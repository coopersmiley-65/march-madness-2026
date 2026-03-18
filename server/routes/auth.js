/**
 * Auth Routes – Register, Login, Logout, Session Check
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';

const router = Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { username, password, display_name, player_number } = req.body;

    if (!username || !password || !display_name || !player_number) {
        return res.status(400).json({ error: 'All fields required' });
    }

    if (player_number < 1 || player_number > 10) {
        return res.status(400).json({ error: 'Player number must be 1-10' });
    }

    const db = getDb();

    // Check if username or player_number already taken
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR player_number = ?').get(username, player_number);
    if (existing) {
        return res.status(409).json({ error: 'Username or player number already taken' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const is_admin = 0; // Admin is player_number 0, seeded in db.js — regular registrations are never admin

    try {
        const result = db.prepare(
            'INSERT INTO users (username, password_hash, display_name, player_number, is_admin) VALUES (?, ?, ?, ?, ?)'
        ).run(username, password_hash, display_name, player_number, is_admin);

        const user = {
            id: result.lastInsertRowid,
            username,
            display_name,
            player_number,
            is_admin: !!is_admin,
        };

        req.session.user = user;
        res.json({ user });
    } catch (e) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionUser = {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        player_number: user.player_number,
        is_admin: !!user.is_admin,
    };

    req.session.user = sessionUser;
    res.json({ user: sessionUser });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    if (req.session.user) {
        res.json({ user: req.session.user });
    } else {
        res.json({ user: null });
    }
});

// GET /api/auth/players - list registered players (public)
router.get('/players', (req, res) => {
    const db = getDb();
    const players = db.prepare('SELECT id, display_name, player_number, is_admin FROM users ORDER BY player_number').all();
    res.json({ players });
});

export default router;
