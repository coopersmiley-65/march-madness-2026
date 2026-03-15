/**
 * Wager Suggestion Routes – Players suggest a bet amount, admin reviews
 */
import { Router } from 'express';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// GET /api/wager-suggestions - Get all wager suggestions (with player names)
router.get('/', requireAuth, (req, res) => {
    const db = getDb();
    const suggestions = db.prepare(`
        SELECT ws.player_number, ws.suggested_amount, ws.created_at, u.display_name
        FROM wager_suggestions ws
        JOIN users u ON u.player_number = ws.player_number
        ORDER BY ws.player_number
    `).all();

    // Get current player's suggestion
    const playerNum = req.session.user.player_number;
    const mySuggestion = db.prepare('SELECT * FROM wager_suggestions WHERE player_number = ?').get(playerNum);

    res.json({ suggestions, mySuggestion: mySuggestion || null });
});

// POST /api/wager-suggestions - Submit or update a wager suggestion
router.post('/', requireAuth, (req, res) => {
    const { suggested_amount } = req.body;
    const playerNum = req.session.user.player_number;

    if (playerNum === 0) {
        return res.status(403).json({ error: 'Admin sets the bet directly in settings, not via suggestions' });
    }

    if (!suggested_amount || suggested_amount < 0.05 || suggested_amount > 1.00) {
        return res.status(400).json({ error: 'Suggested amount must be between $0.05 and $1.00' });
    }

    // Round to nearest 0.05
    const rounded = Math.round(suggested_amount * 20) / 20;

    const db = getDb();
    db.prepare(`
        INSERT INTO wager_suggestions (player_number, suggested_amount) VALUES (?, ?)
        ON CONFLICT(player_number) DO UPDATE SET suggested_amount = excluded.suggested_amount, created_at = datetime('now')
    `).run(playerNum, rounded);

    res.json({ ok: true, amount: rounded });
});

export default router;
