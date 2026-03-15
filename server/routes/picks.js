/**
 * Picks Routes – Player pick management with visibility rules
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// Tournament start: March 19, 2026 at 12:00 PM Eastern (UTC-4 in March = EDT)
const TOURNAMENT_START = new Date('2026-03-19T16:00:00Z'); // noon EDT = 16:00 UTC

// GET /api/picks/all-players - Get ALL players' picks across ALL rounds
router.get('/all-players', requireAuth, (req, res) => {
    const db = getDb();
    const user = req.session.user;
    const now = new Date();

    // Access control: admin always, players only after tournament start
    const isAdmin = user.player_number === 0 || user.is_admin;
    const tournamentStarted = now >= TOURNAMENT_START;

    if (!isAdmin && !tournamentStarted) {
        return res.json({
            allowed: false,
            tournamentStart: TOURNAMENT_START.toISOString(),
            message: 'All picks will be visible after the tournament starts on March 19 at noon ET'
        });
    }

    // Get all games
    const games = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();

    // Get all players (exclude admin account from the grid)
    const players = db.prepare('SELECT id, display_name, player_number FROM users WHERE player_number > 0 ORDER BY player_number').all();

    // Get settings for number of active players
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    // Get all picks for active players
    const allPicks = db.prepare('SELECT * FROM picks WHERE player_number <= ?').all(settings.number_of_players);

    res.json({
        allowed: true,
        games,
        players: players.filter(p => p.player_number <= settings.number_of_players),
        picks: allPicks,
        settings
    });
});

// GET /api/picks/mine/:round - Get current player's picks for a round
router.get('/mine/:round', requireAuth, (req, res) => {
    const db = getDb();
    const playerNum = req.session.user.player_number;
    const round = req.params.round;

    const gameIds = db.prepare('SELECT game_id FROM games WHERE round = ?').all(round).map(g => g.game_id);

    if (gameIds.length === 0) {
        return res.json({ picks: [] });
    }

    const placeholders = gameIds.map(() => '?').join(',');
    const picks = db.prepare(
        `SELECT * FROM picks WHERE player_number = ? AND game_id IN (${placeholders})`
    ).all(playerNum, ...gameIds);

    res.json({ picks });
});

// GET /api/picks/all/:round - Get all players' picks (only if requesting player has completed their picks)
router.get('/all/:round', requireAuth, (req, res) => {
    const db = getDb();
    const playerNum = req.session.user.player_number;
    const round = req.params.round;
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();

    const gameIds = db.prepare('SELECT game_id FROM games WHERE round = ?').all(round).map(g => g.game_id);

    if (gameIds.length === 0) {
        return res.json({ picks: [], eligible: false });
    }

    const placeholders = gameIds.map(() => '?').join(',');

    // Check if requesting player has completed all picks for this round
    const myPicks = db.prepare(
        `SELECT * FROM picks WHERE player_number = ? AND game_id IN (${placeholders}) AND pick != 'Selection'`
    ).all(playerNum, ...gameIds);

    const allComplete = myPicks.length === gameIds.length;

    if (!allComplete && !req.session.user.is_admin) {
        // Return only this player's picks
        const picks = db.prepare(
            `SELECT * FROM picks WHERE player_number = ? AND game_id IN (${placeholders})`
        ).all(playerNum, ...gameIds);
        return res.json({ picks, eligible: false, myProgress: myPicks.length, total: gameIds.length });
    }

    // Return all picks for active players
    const allPicks = db.prepare(
        `SELECT * FROM picks WHERE game_id IN (${placeholders}) AND player_number <= ?`
    ).all(...gameIds, settings.number_of_players);

    res.json({ picks: allPicks, eligible: true });
});

// POST /api/picks - Set a pick
router.post('/', requireAuth, (req, res) => {
    const { game_id, pick } = req.body;
    const playerNum = req.session.user.player_number;

    if (!game_id || !pick) {
        return res.status(400).json({ error: 'game_id and pick required' });
    }

    if (!['W', 'L', 'Selection'].includes(pick)) {
        return res.status(400).json({ error: 'Pick must be W, L, or Selection' });
    }

    const db = getDb();

    // Check game exists and is not locked/completed
    const game = db.prepare('SELECT * FROM games WHERE game_id = ?').get(game_id);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }
    if (game.status === 'LOCKED' || game.status === 'FINAL_PAYOUT' || game.status === 'PUSH') {
        return res.status(403).json({ error: 'Game is locked, cannot change picks' });
    }

    // Note: we don't check team_a/team_b here because for bracket picks,
    // later-round teams are determined client-side through the player's picks.
    // The server just stores the W/L choice.

    // Upsert pick
    db.prepare(`
        INSERT INTO picks (game_id, player_number, pick) VALUES (?, ?, ?)
        ON CONFLICT(game_id, player_number) DO UPDATE SET pick = excluded.pick
    `).run(game_id, playerNum, pick);

    res.json({ ok: true });
});

// GET /api/picks/progress/:round - Get pick completion progress for current player
router.get('/progress/:round', requireAuth, (req, res) => {
    const db = getDb();
    const playerNum = req.session.user.player_number;
    const round = req.params.round;

    const totalGames = db.prepare('SELECT COUNT(*) as c FROM games WHERE round = ?').get(round).c;

    const gameIds = db.prepare('SELECT game_id FROM games WHERE round = ?').all(round).map(g => g.game_id);
    if (gameIds.length === 0) {
        return res.json({ picked: 0, total: 0, complete: true });
    }

    const placeholders = gameIds.map(() => '?').join(',');
    const picked = db.prepare(
        `SELECT COUNT(*) as c FROM picks WHERE player_number = ? AND game_id IN (${placeholders}) AND pick != 'Selection'`
    ).all(playerNum, ...gameIds)[0].c;

    res.json({ picked, total: totalGames, complete: picked === totalGames });
});

export default router;
