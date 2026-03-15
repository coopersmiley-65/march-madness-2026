/**
 * Settings Routes
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware.js';

const router = Router();

// GET /api/settings
router.get('/', (req, res) => {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json({ settings });
});

// PUT /api/settings
router.put('/', requireAuth, requireAdmin, (req, res) => {
    const { number_of_players, max_bet_per_game } = req.body;
    const db = getDb();

    if (number_of_players !== undefined) {
        db.prepare('UPDATE settings SET number_of_players = ? WHERE id = 1').run(number_of_players);
    }
    if (max_bet_per_game !== undefined) {
        db.prepare('UPDATE settings SET max_bet_per_game = ? WHERE id = 1').run(max_bet_per_game);
    }

    const updated = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    res.json({ settings: updated });
});

export default router;
