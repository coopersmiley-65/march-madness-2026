/**
 * Express Server – March Madness 2026
 */
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import picksRoutes from './routes/picks.js';
import teamsRoutes from './routes/teams.js';
import settingsRoutes from './routes/settings.js';
import leaderboardRoutes from './routes/leaderboard.js';
import wagerSuggestionsRoutes from './routes/wagerSuggestions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(cors({
    origin: true,
    credentials: true,
}));
app.use(session({
    secret: 'march-madness-2026-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
    },
}));

getDb();

app.use('/api/auth', authRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/picks', picksRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/wager-suggestions', wagerSuggestionsRoutes);

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🏀 March Madness server running at http://localhost:${PORT}`);
    startAutoScraper();
});

/**
 * Auto-scrape ESPN results every hour during the tournament.
 * Tournament window: March 19, 2026 – April 7, 2026.
 */
function startAutoScraper() {
    const TOURNAMENT_START = new Date('2026-03-19T00:00:00-04:00');
    const TOURNAMENT_END = new Date('2026-04-08T00:00:00-04:00');
    const ONE_HOUR = 60 * 60 * 1000;

    async function runScrape() {
        const now = new Date();
        if (now < TOURNAMENT_START || now > TOURNAMENT_END) {
            return; // Outside tournament window — do nothing
        }

        console.log(`[Auto-Scraper] Running ESPN results scrape at ${now.toISOString()}...`);
        try {
            const { scrapeESPNResults, matchGameToDb } = await import('./resultsScraper.js');
            const espnGames = await scrapeESPNResults();
            if (espnGames.length === 0) {
                console.log('[Auto-Scraper] No completed tournament games found on ESPN.');
                return;
            }

            const db = getDb();
            const allDbGames = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
            let updatedCount = 0;

            for (const espnGame of espnGames) {
                const match = matchGameToDb(espnGame, allDbGames);
                if (!match) continue;

                const { dbGame, score_a, score_b } = match;
                const winner = score_a > score_b ? 'A' : (score_b > score_a ? 'B' : null);
                if (!winner) continue;

                db.prepare(`
                    UPDATE games SET score_a = ?, score_b = ?, winner = ?, status = 'FINAL_PAYOUT'
                    WHERE game_id = ?
                `).run(score_a, score_b, winner, dbGame.game_id);

                // Recalculate payouts (inline — same logic as games.js)
                const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
                const game = db.prepare('SELECT * FROM games WHERE game_id = ?').get(dbGame.game_id);
                if (game && game.winner) {
                    const numPlayers = settings.number_of_players;
                    const betPerGame = settings.max_bet_per_game;
                    const newMoney = numPlayers * betPerGame;
                    const prevGame = db.prepare('SELECT * FROM games WHERE sequence_order = ?').get(game.sequence_order - 1);
                    const inPush = prevGame ? (prevGame.out_push || 0) : 0;
                    const totalPot = newMoney + inPush;
                    const picks = db.prepare("SELECT * FROM picks WHERE game_id = ? AND pick != ?").all(dbGame.game_id, 'Selection');
                    const winPick = game.winner === 'A' ? 'W' : 'L';
                    const winners = picks.filter(p => p.pick === winPick && p.player_number <= numPlayers);
                    const allSame = picks.length === numPlayers && new Set(picks.map(p => p.pick)).size === 1;
                    let outPush = 0, status = 'FINAL_PAYOUT';
                    if (allSame && picks.length === numPlayers) {
                        outPush = totalPot; status = 'PUSH';
                        db.prepare('DELETE FROM player_payouts WHERE game_id = ?').run(dbGame.game_id);
                    } else {
                        const payout = winners.length > 0 ? totalPot / winners.length : 0;
                        db.prepare('DELETE FROM player_payouts WHERE game_id = ?').run(dbGame.game_id);
                        const ins = db.prepare('INSERT INTO player_payouts (game_id, player_number, payout) VALUES (?, ?, ?)');
                        for (const w of winners) ins.run(dbGame.game_id, w.player_number, payout);
                    }
                    db.prepare('UPDATE games SET new_money = ?, in_push = ?, total_pot = ?, out_push = ?, status = ? WHERE game_id = ?')
                        .run(newMoney, inPush, totalPot, outPush, status, dbGame.game_id);
                }

                dbGame.winner = winner;
                updatedCount++;
            }

            // Propagate winners
            if (updatedCount > 0) {
                const refreshed = db.prepare('SELECT * FROM games ORDER BY sequence_order').all();
                const gameMap = {};
                refreshed.forEach(g => gameMap[g.game_id] = { ...g });
                for (const game of Object.values(gameMap)) {
                    if (game.feed_a) {
                        const f = gameMap[game.feed_a];
                        if (f && f.winner) { game.team_a = f.winner === 'A' ? f.team_a : f.team_b; game.seed_a = f.winner === 'A' ? f.seed_a : f.seed_b; }
                    }
                    if (game.feed_b) {
                        const f = gameMap[game.feed_b];
                        if (f && f.winner) { game.team_b = f.winner === 'A' ? f.team_a : f.team_b; game.seed_b = f.winner === 'A' ? f.seed_a : f.seed_b; }
                    }
                }
                for (const g of Object.values(gameMap)) {
                    if (g.feed_a || g.feed_b) {
                        db.prepare('UPDATE games SET team_a = ?, team_b = ?, seed_a = ?, seed_b = ? WHERE game_id = ?')
                            .run(g.team_a, g.team_b, g.seed_a, g.seed_b, g.game_id);
                    }
                }
            }

            console.log(`[Auto-Scraper] Updated ${updatedCount} game(s) from ESPN.`);
        } catch (err) {
            console.error('[Auto-Scraper] Error:', err.message);
        }
    }

    // Run immediately on startup (if in tournament window), then every hour
    runScrape();
    setInterval(runScrape, ONE_HOUR);
    console.log('⏰ Auto-scraper scheduled: ESPN results checked every 60 minutes during tournament (Mar 19 – Apr 7)');
}
