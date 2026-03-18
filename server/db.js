/**
 * SQLite Database Setup – March Madness 2026
 * Creates all tables and seeds initial data from the spreadsheet structure.
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'march_madness.db');

// Ensure the directory for the database exists (needed for Railway volume mounts)
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

let db;

export function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        initializeDb(db);
    }
    return db;
}

function initializeDb(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            player_number INTEGER UNIQUE NOT NULL CHECK(player_number BETWEEN 0 AND 10),
            is_admin INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY DEFAULT 1,
            number_of_players INTEGER DEFAULT 3,
            max_bet_per_game REAL DEFAULT 0.50
        );

        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            region TEXT NOT NULL CHECK(region IN ('East','West','MidWest','South')),
            seed_number INTEGER NOT NULL CHECK(seed_number BETWEEN 1 AND 16),
            team_name TEXT NOT NULL,
            is_play_in INTEGER DEFAULT 0,
            UNIQUE(region, seed_number)
        );

        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT UNIQUE NOT NULL,
            round TEXT NOT NULL,
            region TEXT,
            game_num INTEGER NOT NULL,
            team_a TEXT,
            team_b TEXT,
            seed_a INTEGER,
            seed_b INTEGER,
            score_a INTEGER,
            score_b INTEGER,
            winner TEXT CHECK(winner IN ('A','B',NULL)),
            status TEXT DEFAULT 'OPEN' CHECK(status IN ('OPEN','LOCKED','PUSH','FINAL_PAYOUT')),
            feed_a TEXT,
            feed_b TEXT,
            label TEXT,
            new_money REAL DEFAULT 0,
            in_push REAL DEFAULT 0,
            total_pot REAL DEFAULT 0,
            out_push REAL DEFAULT 0,
            sequence_order INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS picks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            player_number INTEGER NOT NULL,
            pick TEXT DEFAULT 'Selection' CHECK(pick IN ('W','L','Selection')),
            locked_at TEXT,
            UNIQUE(game_id, player_number),
            FOREIGN KEY(game_id) REFERENCES games(game_id)
        );

        CREATE TABLE IF NOT EXISTS player_payouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id TEXT NOT NULL,
            player_number INTEGER NOT NULL,
            payout REAL DEFAULT 0,
            UNIQUE(game_id, player_number),
            FOREIGN KEY(game_id) REFERENCES games(game_id)
        );

        CREATE TABLE IF NOT EXISTS wager_suggestions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_number INTEGER UNIQUE NOT NULL,
            suggested_amount REAL NOT NULL CHECK(suggested_amount BETWEEN 0.05 AND 1.00),
            created_at TEXT DEFAULT (datetime('now'))
        );
    `);

    // Migrate users table if it has old constraint (player_number BETWEEN 1 AND 10)
    // Try inserting a test row with player_number 0; if it fails, recreate the table
    try {
        db.prepare('INSERT INTO users (username, password_hash, display_name, player_number, is_admin) VALUES (?, ?, ?, 0, 1)')
            .run('__migration_test__', 'x', 'x');
        db.prepare('DELETE FROM users WHERE username = ?').run('__migration_test__');
    } catch (e) {
        // Constraint prevents player_number 0 — recreate the users table
        const existingUsers = db.prepare('SELECT * FROM users').all();
        db.exec('DROP TABLE users');
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                player_number INTEGER UNIQUE NOT NULL CHECK(player_number BETWEEN 0 AND 10),
                is_admin INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );
        `);
        // Re-insert existing users (skip any that had player_number = 0 or player 1 admin flag)
        for (const u of existingUsers) {
            try {
                db.prepare('INSERT INTO users (username, password_hash, display_name, player_number, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                    .run(u.username, u.password_hash, u.display_name, u.player_number, 0, u.created_at);
            } catch (insertErr) {
                // skip duplicates or constraint violations
            }
        }
    }

    // Seed admin user if not exists (player_number = 0)
    const adminExists = db.prepare('SELECT id FROM users WHERE player_number = 0').get();
    if (!adminExists) {
        const adminHash = bcrypt.hashSync('admin2026', 10);
        db.prepare('INSERT INTO users (username, password_hash, display_name, player_number, is_admin) VALUES (?, ?, ?, 0, 1)')
            .run('admin', adminHash, 'Admin');
    }

    // Ensure no regular player has is_admin = 1 (only player_number 0 is admin)
    db.prepare('UPDATE users SET is_admin = 0 WHERE player_number != 0').run();
    // Ensure admin account always has is_admin = 1
    db.prepare('UPDATE users SET is_admin = 1 WHERE player_number = 0').run();

    // Seed settings if empty
    const settingsCount = db.prepare('SELECT COUNT(*) as c FROM settings').get();
    if (settingsCount.c === 0) {
        db.prepare('INSERT INTO settings (id, number_of_players, max_bet_per_game) VALUES (1, 3, 0.50)').run();
    }

    // Seed teams if empty
    const teamsCount = db.prepare('SELECT COUNT(*) as c FROM teams').get();
    if (teamsCount.c === 0) {
        seedTeams(db);
    }

    // Seed games if empty
    const gamesCount = db.prepare('SELECT COUNT(*) as c FROM games').get();
    if (gamesCount.c === 0) {
        seedGames(db);
    }
}

function seedTeams(db) {
    const regions = ['East', 'West', 'MidWest', 'South'];
    const insert = db.prepare('INSERT INTO teams (region, seed_number, team_name) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
        for (const region of regions) {
            for (let seed = 1; seed <= 16; seed++) {
                insert.run(region, seed, `TBD ${region} ${seed}`);
            }
        }
    });
    tx();
}

function seedGames(db) {
    const games = [];
    let seq = 1;

    // Seed matchups: standard NCAA bracket order
    const seedMatchups = [
        [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]
    ];
    const regions = ['East', 'West', 'MidWest', 'South'];

    // Round of 64: 32 games
    for (const region of regions) {
        seedMatchups.forEach((seeds, i) => {
            games.push({
                game_id: `${region} R64 Game ${i + 1}`,
                round: 'R64',
                region,
                game_num: i + 1,
                team_a: `TBD ${region} ${seeds[0]}`,
                team_b: `TBD ${region} ${seeds[1]}`,
                seed_a: seeds[0],
                seed_b: seeds[1],
                feed_a: null,
                feed_b: null,
                label: null,
                sequence_order: seq++,
            });
        });
    }

    // Round of 32: 16 games
    const r32Feeds = [[1, 2], [3, 4], [5, 6], [7, 8]];
    for (const region of regions) {
        r32Feeds.forEach((feeds, i) => {
            games.push({
                game_id: `${region} R32 Game ${i + 1}`,
                round: 'R32',
                region,
                game_num: i + 1,
                team_a: null,
                team_b: null,
                seed_a: null,
                seed_b: null,
                feed_a: `${region} R64 Game ${feeds[0]}`,
                feed_b: `${region} R64 Game ${feeds[1]}`,
                label: null,
                sequence_order: seq++,
            });
        });
    }

    // Sweet 16: 8 games
    const s16Feeds = [[1, 2], [3, 4]];
    for (const region of regions) {
        s16Feeds.forEach((feeds, i) => {
            games.push({
                game_id: `${region} S16 Game ${i + 1}`,
                round: 'S16',
                region,
                game_num: i + 1,
                team_a: null, team_b: null, seed_a: null, seed_b: null,
                feed_a: `${region} R32 Game ${feeds[0]}`,
                feed_b: `${region} R32 Game ${feeds[1]}`,
                label: null,
                sequence_order: seq++,
            });
        });
    }

    // Elite 8: 4 games
    for (const region of regions) {
        games.push({
            game_id: `${region} E8 Game 1`,
            round: 'E8',
            region,
            game_num: 1,
            team_a: null, team_b: null, seed_a: null, seed_b: null,
            feed_a: `${region} S16 Game 1`,
            feed_b: `${region} S16 Game 2`,
            label: null,
            sequence_order: seq++,
        });
    }

    // Final 4: 2 games
    games.push({
        game_id: 'Final 4 Game 1',
        round: 'F4',
        region: null,
        game_num: 1,
        team_a: null, team_b: null, seed_a: null, seed_b: null,
        feed_a: 'East E8 Game 1',
        feed_b: 'West E8 Game 1',
        label: 'East vs West',
        sequence_order: seq++,
    });
    games.push({
        game_id: 'Final 4 Game 2',
        round: 'F4',
        region: null,
        game_num: 2,
        team_a: null, team_b: null, seed_a: null, seed_b: null,
        feed_a: 'MidWest E8 Game 1',
        feed_b: 'South E8 Game 1',
        label: 'South vs MidWest',
        sequence_order: seq++,
    });

    // Championship: 1 game
    games.push({
        game_id: 'Championship Game',
        round: 'NCG',
        region: null,
        game_num: 1,
        team_a: null, team_b: null, seed_a: null, seed_b: null,
        feed_a: 'Final 4 Game 1',
        feed_b: 'Final 4 Game 2',
        label: 'National Championship',
        sequence_order: seq++,
    });

    const insert = db.prepare(`
        INSERT INTO games (game_id, round, region, game_num, team_a, team_b, seed_a, seed_b,
            feed_a, feed_b, label, sequence_order, new_money, in_push, total_pot, out_push, status)
        VALUES (@game_id, @round, @region, @game_num, @team_a, @team_b, @seed_a, @seed_b,
            @feed_a, @feed_b, @label, @sequence_order, 0, 0, 0, 0, 'OPEN')
    `);

    const tx = db.transaction(() => {
        for (const g of games) insert.run(g);
    });
    tx();
}

export function closeDb() {
    if (db) {
        db.close();
        db = null;
    }
}
