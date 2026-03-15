/**
 * State Manager – Handles all app state with localStorage persistence.
 * Single source of truth for games, picks, settings, and results.
 */
import { generateBracket, propagateWinners } from './data/tournament.js';
import { DEFAULT_SETTINGS } from './data/settings.js';

const STORAGE_KEY = 'march_madness_2026';

class StateManager {
    constructor() {
        this.listeners = [];
        this.state = this.load();
    }

    /**
     * Load state from localStorage or initialize fresh.
     */
    load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.warn('Failed to load saved state:', e);
        }
        return this.getInitialState();
    }

    getInitialState() {
        return {
            games: generateBracket(),
            picks: {},       // { gameId: { playerId: 'A' | 'B' } }
            settings: { ...DEFAULT_SETTINGS },
            currentView: 'bracket',
            version: 1,
        };
    }

    /**
     * Save current state to localStorage.
     */
    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch (e) {
            console.warn('Failed to save state:', e);
        }
    }

    /**
     * Get the full games list with winners propagated.
     */
    getGames() {
        return propagateWinners([...this.state.games]);
    }

    /**
     * Get a single game by ID.
     */
    getGame(gameId) {
        const games = this.getGames();
        return games.find(g => g.id === gameId);
    }

    /**
     * Get games for a specific round.
     */
    getGamesByRound(roundId) {
        return this.getGames().filter(g => g.round === roundId);
    }

    /**
     * Get picks for a specific game.
     */
    getPicks(gameId) {
        return this.state.picks[gameId] || {};
    }

    /**
     * Get all picks.
     */
    getAllPicks() {
        return this.state.picks;
    }

    /**
     * Set a player's pick for a game.
     */
    setPick(gameId, playerId, pick) {
        if (!this.state.picks[gameId]) {
            this.state.picks[gameId] = {};
        }
        this.state.picks[gameId][playerId] = pick;
        this.save();
        this.notify();
    }

    /**
     * Update a game's team names (for Round of 64 setup).
     */
    setTeamNames(gameId, teamA, teamB) {
        const game = this.state.games.find(g => g.id === gameId);
        if (game) {
            game.teamA = teamA;
            game.teamB = teamB;
            this.save();
            this.notify();
        }
    }

    /**
     * Set game result (scores and winner).
     */
    setGameResult(gameId, scoreA, scoreB) {
        const game = this.state.games.find(g => g.id === gameId);
        if (game) {
            game.scoreA = scoreA;
            game.scoreB = scoreB;
            game.winner = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : null);
            game.status = game.winner ? 'completed' : 'upcoming';
            this.save();
            this.notify();
        }
    }

    /**
     * Lock a game (prevent further pick changes).
     */
    lockGame(gameId) {
        const game = this.state.games.find(g => g.id === gameId);
        if (game) {
            game.status = 'locked';
            this.save();
            this.notify();
        }
    }

    /**
     * Get settings.
     */
    getSettings() {
        return this.state.settings;
    }

    /**
     * Update settings.
     */
    updateSettings(updates) {
        this.state.settings = { ...this.state.settings, ...updates };
        this.save();
        this.notify();
    }

    /**
     * Update a player's name and active status.
     */
    updatePlayer(playerId, name, active) {
        const player = this.state.settings.players.find(p => p.id === playerId);
        if (player) {
            player.name = name;
            player.active = active;
            // Update active player count
            this.state.settings.numberOfPlayers =
                this.state.settings.players.filter(p => p.active).length;
            this.save();
            this.notify();
        }
    }

    /**
     * Get/set the current view.
     */
    getCurrentView() {
        return this.state.currentView;
    }

    setCurrentView(view) {
        this.state.currentView = view;
        this.save();
        this.notify();
    }

    /**
     * Reset all data.
     */
    reset() {
        this.state = this.getInitialState();
        this.save();
        this.notify();
    }

    /**
     * Export state as JSON string (for backup).
     */
    exportData() {
        return JSON.stringify(this.state, null, 2);
    }

    /**
     * Import state from JSON string.
     */
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            this.state = data;
            this.save();
            this.notify();
            return true;
        } catch (e) {
            console.error('Failed to import data:', e);
            return false;
        }
    }

    /**
     * Subscribe to state changes.
     */
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(l => l(this.state));
    }
}

// Singleton
export const store = new StateManager();
