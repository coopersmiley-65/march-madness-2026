/**
 * Leaderboard Routes – Player standings with pot calculations
 */
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// GET /api/leaderboard
router.get('/', (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const numPlayers = settings.number_of_players;
    const betPerGame = settings.max_bet_per_game;

    // Get all completed/pushed games
    const completedGames = db.prepare(
        "SELECT * FROM games WHERE status IN ('FINAL_PAYOUT', 'PUSH') ORDER BY sequence_order"
    ).all();

    // Get all registered players
    const players = db.prepare(
        'SELECT * FROM users WHERE player_number <= ? ORDER BY player_number'
    ).all(numPlayers);

    // Get all payouts
    const payouts = db.prepare('SELECT * FROM player_payouts').all();
    const payoutMap = {};
    for (const p of payouts) {
        if (!payoutMap[p.player_number]) payoutMap[p.player_number] = 0;
        payoutMap[p.player_number] += p.payout;
    }

    // Get all picks for completed games
    const picks = db.prepare(
        "SELECT p.* FROM picks p JOIN games g ON p.game_id = g.game_id WHERE g.status IN ('FINAL_PAYOUT', 'PUSH') AND p.pick != 'Selection'"
    ).all();

    // Build per-player stats
    const leaderboard = [];
    for (let pn = 1; pn <= numPlayers; pn++) {
        const player = players.find(p => p.player_number === pn);
        const playerPicks = picks.filter(p => p.player_number === pn);

        let gamesWon = 0;
        let gamesLost = 0;
        let gamesPushed = 0;

        for (const game of completedGames) {
            const pick = playerPicks.find(p => p.game_id === game.game_id);
            if (!pick) continue;

            if (game.status === 'PUSH') {
                gamesPushed++;
            } else {
                const winPick = game.winner === 'A' ? 'W' : 'L';
                if (pick.pick === winPick) {
                    gamesWon++;
                } else {
                    gamesLost++;
                }
            }
        }

        const totalBet = completedGames.length * betPerGame;
        const totalWon = payoutMap[pn] || 0;
        const netProfit = totalWon - totalBet;

        leaderboard.push({
            player_number: pn,
            display_name: player ? player.display_name : `Player ${pn}`,
            games_won: gamesWon,
            games_lost: gamesLost,
            games_pushed: gamesPushed,
            total_bet: totalBet,
            total_won: totalWon,
            net_profit: netProfit,
        });
    }

    // Sort by net profit descending
    leaderboard.sort((a, b) => b.net_profit - a.net_profit);

    const totalGames = db.prepare('SELECT COUNT(*) as c FROM games').get().c;

    res.json({
        leaderboard,
        completed_games: completedGames.length,
        total_games: totalGames,
        bet_per_game: betPerGame,
    });
});

export default router;
