/**
 * API Client – Handles all HTTP requests to the backend.
 */

const BASE = '/api';

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// Auth
export const api = {
    // Auth
    login: (username, password) =>
        request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    register: (username, password, display_name, player_number) =>
        request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, display_name, player_number }) }),
    logout: () =>
        request('/auth/logout', { method: 'POST' }),
    me: () =>
        request('/auth/me'),
    getPlayers: () =>
        request('/auth/players'),

    // Games
    getGames: () =>
        request('/games'),
    getGamesByRound: (round) =>
        request(`/games/round/${round}`),
    setGameResult: (gameId, score_a, score_b) =>
        request(`/games/${encodeURIComponent(gameId)}/result`, { method: 'PUT', body: JSON.stringify({ score_a, score_b }) }),
    setTeamNames: (gameId, team_a, team_b, seed_a, seed_b) =>
        request(`/games/${encodeURIComponent(gameId)}/teams`, { method: 'PUT', body: JSON.stringify({ team_a, team_b, seed_a, seed_b }) }),
    lockGame: (gameId) =>
        request(`/games/${encodeURIComponent(gameId)}/lock`, { method: 'PUT' }),

    // Picks
    getMyPicks: (round) =>
        request(`/picks/mine/${round}`),
    getAllPicks: (round) =>
        request(`/picks/all/${round}`),
    setPick: (game_id, pick) =>
        request('/picks', { method: 'POST', body: JSON.stringify({ game_id, pick }) }),
    getPickProgress: (round) =>
        request(`/picks/progress/${round}`),
    getAllPlayerPicks: () =>
        request('/picks/all-players'),

    // Teams
    getTeams: () =>
        request('/teams'),
    importTeams: (teams) =>
        request('/teams/import', { method: 'PUT', body: JSON.stringify({ teams }) }),
    scrapeESPN: () =>
        request('/teams/scrape', { method: 'POST' }),

    // Settings
    getSettings: () =>
        request('/settings'),
    updateSettings: (settings) =>
        request('/settings', { method: 'PUT', body: JSON.stringify(settings) }),

    // Leaderboard
    getLeaderboard: () =>
        request('/leaderboard'),

    // Wager Suggestions
    getWagerSuggestions: () =>
        request('/wager-suggestions'),
    submitWagerSuggestion: (suggested_amount) =>
        request('/wager-suggestions', { method: 'POST', body: JSON.stringify({ suggested_amount }) }),

    // ESPN Results Scraping
    scrapeESPNResults: () =>
        request('/games/scrape-results', { method: 'POST' }),
};
