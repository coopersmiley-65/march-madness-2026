/**
 * Teams Routes – Team management and ESPN import
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware.js';

const router = Router();

// GET /api/teams
router.get('/', (req, res) => {
    const db = getDb();
    const teams = db.prepare('SELECT * FROM teams ORDER BY region, seed_number').all();
    res.json({ teams });
});

// GET /api/teams/:region
router.get('/:region', (req, res) => {
    const db = getDb();
    const teams = db.prepare('SELECT * FROM teams WHERE region = ? ORDER BY seed_number').all(req.params.region);
    res.json({ teams });
});

// PUT /api/teams/import - Bulk import teams (admin, for ESPN scrape or manual entry)
router.put('/import', requireAuth, requireAdmin, (req, res) => {
    const { teams } = req.body; // Array of { region, seed_number, team_name, is_play_in }

    if (!teams || !Array.isArray(teams)) {
        return res.status(400).json({ error: 'teams array required' });
    }

    const db = getDb();

    const update = db.prepare(`
        UPDATE teams SET team_name = ?, is_play_in = ? WHERE region = ? AND seed_number = ?
    `);

    const updateGame = db.prepare(`
        UPDATE games SET team_a = ? WHERE round = 'R64' AND region = ? AND seed_a = ?
    `);
    const updateGameB = db.prepare(`
        UPDATE games SET team_b = ? WHERE round = 'R64' AND region = ? AND seed_b = ?
    `);

    const tx = db.transaction(() => {
        for (const t of teams) {
            update.run(t.team_name, t.is_play_in ? 1 : 0, t.region, t.seed_number);
            // Also update R64 games
            updateGame.run(t.team_name, t.region, t.seed_number);
            updateGameB.run(t.team_name, t.region, t.seed_number);
        }
    });

    try {
        tx();
        res.json({ ok: true, count: teams.length });
    } catch (e) {
        res.status(500).json({ error: 'Import failed: ' + e.message });
    }
});

// PUT /api/teams/:id - Update single team (admin)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
    const { team_name, is_play_in } = req.body;
    const db = getDb();

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    db.prepare('UPDATE teams SET team_name = ?, is_play_in = ? WHERE id = ?')
        .run(team_name || team.team_name, is_play_in !== undefined ? is_play_in : team.is_play_in, req.params.id);

    // Update R64 games too
    db.prepare('UPDATE games SET team_a = ? WHERE round = ? AND region = ? AND seed_a = ?')
        .run(team_name, 'R64', team.region, team.seed_number);
    db.prepare('UPDATE games SET team_b = ? WHERE round = ? AND region = ? AND seed_b = ?')
        .run(team_name, 'R64', team.region, team.seed_number);

    res.json({ ok: true });
});

// POST /api/teams/scrape - ESPN scraping endpoint (admin)
router.post('/scrape', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Dynamic import for the scraper module
        const { scrapeESPN } = await import('../scraper.js');
        const teams = await scrapeESPN();

        if (!teams || teams.length === 0) {
            return res.status(500).json({ error: 'No teams found from ESPN. Use manual entry instead.' });
        }

        // Import the scraped teams
        const db = getDb();
        const update = db.prepare('UPDATE teams SET team_name = ?, is_play_in = ? WHERE region = ? AND seed_number = ?');
        const updateGameA = db.prepare('UPDATE games SET team_a = ? WHERE round = ? AND region = ? AND seed_a = ?');
        const updateGameB = db.prepare('UPDATE games SET team_b = ? WHERE round = ? AND region = ? AND seed_b = ?');

        const tx = db.transaction(() => {
            for (const t of teams) {
                update.run(t.team_name, t.is_play_in ? 1 : 0, t.region, t.seed_number);
                updateGameA.run(t.team_name, 'R64', t.region, t.seed_number);
                updateGameB.run(t.team_name, 'R64', t.region, t.seed_number);
            }
        });

        tx();
        res.json({ ok: true, count: teams.length, teams });
    } catch (e) {
        res.status(500).json({ error: 'Scrape failed: ' + e.message });
    }
});

export default router;
