/**
 * Games Routes – CRUD for tournament games, score entry, winner propagation
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware.js';

const router = Router();

// POST /api/games/scrape-results — Scrape ESPN for completed game results (admin only)
router.post('/scrape-results', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { scrapeESPNResults, matchGameToDb } = await import('../resultsScraper.js');
        const espnGames = await scrapeESPNResults();

        if (espnGames.length === 0) {
            return res.json({ ok: true, updated: 0, message: 'No completed tournament games found on ESPN' });
        }

        const db = getDb();
        const allDbGames = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
        let updatedCount = 0;
        const updatedGameIds = [];

        for (const espnGame of espnGames) {
            const match = matchGameToDb(espnGame, allDbGames);
            if (!match) continue;

            const { dbGame, score_a, score_b } = match;
            const winner = score_a > score_b ? 'A' : (score_b > score_a ? 'B' : null);
            if (!winner) continue; // tie — shouldn't happen in tournament

            // Update score and winner
            db.prepare(`
                UPDATE games SET score_a = ?, score_b = ?, winner = ?, status = 'FINAL_PAYOUT'
                WHERE game_id = ?
            `).run(score_a, score_b, winner, dbGame.game_id);

            // Recalculate payouts
            recalculateGame(db, dbGame.game_id);

            // Mark as processed so we don't re-match
            dbGame.winner = winner;
            updatedCount++;
            updatedGameIds.push(dbGame.game_id);
        }

        // Propagate winners to downstream games
        if (updatedCount > 0) {
            const refreshedGames = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
            const propagated = propagateWinners(refreshedGames);
            for (const g of propagated) {
                if (g.feed_a || g.feed_b) {
                    db.prepare('UPDATE games SET team_a = ?, team_b = ?, seed_a = ?, seed_b = ? WHERE game_id = ?')
                        .run(g.team_a, g.team_b, g.seed_a, g.seed_b, g.game_id);
                }
            }
        }

        res.json({ ok: true, updated: updatedCount, gameIds: updatedGameIds });
    } catch (e) {
        console.error('Scrape results error:', e);
        res.status(500).json({ error: 'Scrape failed: ' + e.message });
    }
});

// TEMPORARY: POST /api/games/reset-all-results — Clear ALL game results (admin only)
// This is used to fix incorrectly matched game results from the scraper.
// REMOVE THIS ENDPOINT after use.
router.post('/reset-all-results', requireAuth, requireAdmin, (req, res) => {
    try {
        const db = getDb();

        // Clear all game results
        db.prepare(`
            UPDATE games SET score_a = NULL, score_b = NULL, winner = NULL,
            status = 'OPEN', new_money = NULL, in_push = NULL,
            total_pot = NULL, out_push = NULL
            WHERE winner IS NOT NULL
        `).run();

        // Clear all payouts
        db.prepare('DELETE FROM player_payouts').run();

        const remaining = db.prepare('SELECT COUNT(*) as cnt FROM games WHERE winner IS NOT NULL').get();
        res.json({ ok: true, message: `All game results cleared. Games with results remaining: ${remaining.cnt}` });
    } catch (e) {
        console.error('Reset results error:', e);
        res.status(500).json({ error: 'Reset failed: ' + e.message });
    }
});

// GET /api/games - All games with propagated winners
router.get('/', (req, res) => {
    const db = getDb();
    const games = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
    const propagated = propagateWinners(games);
    res.json({ games: propagated });
});

// GET /api/games/round/:round
router.get('/round/:round', (req, res) => {
    const db = getDb();
    const games = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
    const propagated = propagateWinners(games);
    const filtered = propagated.filter(g => g.round === req.params.round);
    res.json({ games: filtered });
});

// PUT /api/games/:gameId/result - Enter game result (admin only)
router.put('/:gameId/result', requireAuth, requireAdmin, (req, res) => {
    const { score_a, score_b } = req.body;
    const { gameId } = req.params;

    if (score_a === undefined || score_b === undefined) {
        return res.status(400).json({ error: 'Both scores required' });
    }

    const db = getDb();
    const game = db.prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    const winner = score_a > score_b ? 'A' : (score_b > score_a ? 'B' : null);

    db.prepare(`
        UPDATE games SET score_a = ?, score_b = ?, winner = ?, status = 'FINAL_PAYOUT'
        WHERE game_id = ?
    `).run(score_a, score_b, winner, gameId);

    // Recalculate pots and payouts for this game
    recalculateGame(db, gameId);

    // Propagate winner to next round games
    const allGames = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
    const propagated = propagateWinners(allGames);

    // Update team names in downstream games
    for (const g of propagated) {
        if (g.feed_a || g.feed_b) {
            db.prepare('UPDATE games SET team_a = ?, team_b = ?, seed_a = ?, seed_b = ? WHERE game_id = ?')
                .run(g.team_a, g.team_b, g.seed_a, g.seed_b, g.game_id);
        }
    }

    res.json({ ok: true });
});

// PUT /api/games/:gameId/teams - Update team names (admin)
router.put('/:gameId/teams', requireAuth, requireAdmin, (req, res) => {
    const { team_a, team_b, seed_a, seed_b } = req.body;
    const db = getDb();

    db.prepare('UPDATE games SET team_a = ?, team_b = ?, seed_a = ?, seed_b = ? WHERE game_id = ?')
        .run(team_a, team_b, seed_a || null, seed_b || null, req.params.gameId);

    res.json({ ok: true });
});

// PUT /api/games/:gameId/lock - Lock a game (admin)
router.put('/:gameId/lock', requireAuth, requireAdmin, (req, res) => {
    const db = getDb();
    db.prepare("UPDATE games SET status = 'LOCKED' WHERE game_id = ?").run(req.params.gameId);
    res.json({ ok: true });
});

/**
 * Recalculate pot, push, and payouts for a game.
 */
function recalculateGame(db, gameId) {
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const game = db.prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    if (!game || !game.winner) return;

    const numPlayers = settings.number_of_players;
    const betPerGame = settings.max_bet_per_game;
    const newMoney = numPlayers * betPerGame;

    // Get pushed pot from previous game in sequence
    const prevGame = db.prepare('SELECT * FROM games WHERE sequence_order = ?').get(game.sequence_order - 1);
    const inPush = prevGame ? (prevGame.out_push || 0) : 0;
    const totalPot = newMoney + inPush;

    // Get all picks for this game
    const picks = db.prepare('SELECT * FROM picks WHERE game_id = ? AND pick != ?').all(gameId, 'Selection');
    const winPick = game.winner === 'A' ? 'W' : 'L';

    const winners = picks.filter(p => p.pick === winPick && p.player_number <= numPlayers);
    const allSame = picks.length === numPlayers && new Set(picks.map(p => p.pick)).size === 1;

    let outPush = 0;
    let status = 'FINAL_PAYOUT';

    if (allSame && picks.length === numPlayers) {
        // PUSH
        outPush = totalPot;
        status = 'PUSH';

        // Zero out payouts
        db.prepare('DELETE FROM player_payouts WHERE game_id = ?').run(gameId);
    } else {
        const payout = winners.length > 0 ? totalPot / winners.length : 0;

        // Delete old payouts for this game
        db.prepare('DELETE FROM player_payouts WHERE game_id = ?').run(gameId);

        // Insert payouts for winners
        const insertPayout = db.prepare('INSERT INTO player_payouts (game_id, player_number, payout) VALUES (?, ?, ?)');
        for (const w of winners) {
            insertPayout.run(gameId, w.player_number, payout);
        }
    }

    db.prepare('UPDATE games SET new_money = ?, in_push = ?, total_pot = ?, out_push = ?, status = ? WHERE game_id = ?')
        .run(newMoney, inPush, totalPot, outPush, status, gameId);
}

/**
 * Propagate winners through the bracket.
 */
function propagateWinners(games) {
    const gameMap = {};
    games.forEach(g => gameMap[g.game_id] = { ...g });

    for (const game of Object.values(gameMap)) {
        if (game.feed_a) {
            const feeder = gameMap[game.feed_a];
            if (feeder && feeder.winner) {
                game.team_a = feeder.winner === 'A' ? feeder.team_a : feeder.team_b;
                game.seed_a = feeder.winner === 'A' ? feeder.seed_a : feeder.seed_b;
            }
        }
        if (game.feed_b) {
            const feeder = gameMap[game.feed_b];
            if (feeder && feeder.winner) {
                game.team_b = feeder.winner === 'A' ? feeder.team_a : feeder.team_b;
                game.seed_b = feeder.winner === 'A' ? feeder.seed_a : feeder.seed_b;
            }
        }
    }

    return Object.values(gameMap).sort((a, b) => a.sequence_order - b.sequence_order);
}

export default router;
