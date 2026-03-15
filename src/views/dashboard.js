/**
 * Dashboard View – Personal player summary (W/L record, money, game breakdown)
 */
import { api } from '../api.js';

export async function renderDashboard() {
    const container = document.createElement('div');
    container.className = 'dashboard-view';

    const user = window.appState.user;

    container.innerHTML = `
        <div class="view-header">
            <h1>📊 My Dashboard</h1>
            <p class="subtitle">${user.display_name}'s tournament overview</p>
        </div>
        <div id="dashboard-content">
            <div class="loading-spinner">Loading your stats...</div>
        </div>
    `;

    try {
        const [leaderboardData, gamesData] = await Promise.all([
            api.getLeaderboard(),
            api.getGames(),
        ]);

        const myStats = leaderboardData.leaderboard.find(p => p.player_number === user.player_number);
        const myRank = leaderboardData.leaderboard.findIndex(p => p.player_number === user.player_number) + 1;

        renderDashboardContent(container, myStats, myRank, leaderboardData, gamesData.games, user);
    } catch (e) {
        container.querySelector('#dashboard-content').innerHTML = `<div class="error-msg">Failed to load: ${e.message}</div>`;
    }

    return container;
}

function renderDashboardContent(container, stats, rank, leaderboardData, games, user) {
    const completedGames = games.filter(g => g.status === 'FINAL_PAYOUT' || g.status === 'PUSH');
    const totalGames = games.length;

    const contentEl = container.querySelector('#dashboard-content');
    contentEl.innerHTML = `
        <div class="dashboard-stats-grid">
            <div class="stat-card stat-rank">
                <div class="stat-icon">${rank === 1 ? '👑' : '🏅'}</div>
                <div class="stat-value">#${rank}</div>
                <div class="stat-label">Leaderboard Rank</div>
            </div>
            <div class="stat-card stat-profit ${(stats?.net_profit || 0) >= 0 ? 'positive' : 'negative'}">
                <div class="stat-icon">💰</div>
                <div class="stat-value">${(stats?.net_profit || 0) >= 0 ? '+' : ''}$${(stats?.net_profit || 0).toFixed(2)}</div>
                <div class="stat-label">Net Profit/Loss</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value">${stats?.games_won || 0}</div>
                <div class="stat-label">Games Won</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">❌</div>
                <div class="stat-value">${stats?.games_lost || 0}</div>
                <div class="stat-label">Games Lost</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🔄</div>
                <div class="stat-value">${stats?.games_pushed || 0}</div>
                <div class="stat-label">Pushes</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🎯</div>
                <div class="stat-value">${stats?.games_won && (stats.games_won + stats.games_lost) > 0 ? Math.round((stats.games_won / (stats.games_won + stats.games_lost)) * 100) : 0}%</div>
                <div class="stat-label">Win Rate</div>
            </div>
        </div>

        <div class="dashboard-section">
            <h2>💵 Financial Summary</h2>
            <div class="financial-grid">
                <div class="financial-item">
                    <span class="fin-label">Total Bet</span>
                    <span class="fin-value">$${(stats?.total_bet || 0).toFixed(2)}</span>
                </div>
                <div class="financial-item">
                    <span class="fin-label">Total Won</span>
                    <span class="fin-value positive">$${(stats?.total_won || 0).toFixed(2)}</span>
                </div>
                <div class="financial-item">
                    <span class="fin-label">Bet Per Game</span>
                    <span class="fin-value">$${leaderboardData.bet_per_game.toFixed(2)}</span>
                </div>
                <div class="financial-item">
                    <span class="fin-label">Games Played</span>
                    <span class="fin-value">${leaderboardData.completed_games} / ${leaderboardData.total_games}</span>
                </div>
            </div>
        </div>

        <div class="dashboard-section">
            <h2>📅 Tournament Progress</h2>
            <div class="progress-bar-container large">
                <div class="progress-bar" style="width: ${(leaderboardData.completed_games / leaderboardData.total_games) * 100}%"></div>
            </div>
            <p class="progress-text">${leaderboardData.completed_games} of ${leaderboardData.total_games} games completed (${Math.round((leaderboardData.completed_games / leaderboardData.total_games) * 100)}%)</p>
        </div>

        ${completedGames.length === 0 ? `
            <div class="empty-state">
                <div class="empty-icon">🏀</div>
                <h3>No games played yet</h3>
                <p>Your stats will appear here once games are completed and results are entered.</p>
            </div>
        ` : ''}
    `;
}
