/**
 * Leaderboard View – Player standings with API data
 */
import { api } from '../api.js';

export async function renderLeaderboard() {
  const container = document.createElement('div');
  container.className = 'leaderboard-view';

  container.innerHTML = `
        <div class="view-header">
            <h1>🏆 Leaderboard</h1>
            <p class="subtitle">Player standings</p>
        </div>
        <div id="leaderboard-content">
            <div class="loading-spinner">Loading standings...</div>
        </div>
    `;

  try {
    const data = await api.getLeaderboard();
    renderLeaderboardContent(container, data);
  } catch (e) {
    container.querySelector('#leaderboard-content').innerHTML = `<div class="error-msg">Failed to load: ${e.message}</div>`;
  }

  return container;
}

function renderLeaderboardContent(container, data) {
  const { leaderboard, completed_games, total_games, bet_per_game } = data;
  const contentEl = container.querySelector('#leaderboard-content');

  contentEl.innerHTML = `
        <div class="leaderboard-stats">
            <div class="stat-card">
                <div class="stat-value">${completed_games}</div>
                <div class="stat-label">Games Played</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${total_games - completed_games}</div>
                <div class="stat-label">Games Remaining</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$${bet_per_game.toFixed(2)}</div>
                <div class="stat-label">Bet Per Game</div>
            </div>
        </div>

        <div class="leaderboard-table-container">
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th class="rank-col">#</th>
                        <th class="player-col">Player</th>
                        <th>Won</th>
                        <th>Lost</th>
                        <th>Push</th>
                        <th>Total Bet</th>
                        <th>Total Won</th>
                        <th class="profit-col">Net Profit</th>
                    </tr>
                </thead>
                <tbody>
                    ${leaderboard.map((entry, i) => `
                        <tr class="${i === 0 && entry.net_profit > 0 ? 'leader-row' : ''}">
                            <td class="rank-col">${i === 0 ? '👑' : i + 1}</td>
                            <td class="player-col">
                                <span class="player-avatar">${entry.display_name.charAt(0)}</span>
                                <span class="player-name-lb">${entry.display_name}</span>
                            </td>
                            <td><span class="games-won">${entry.games_won}</span></td>
                            <td><span class="games-lost">${entry.games_lost}</span></td>
                            <td><span class="games-pushed">${entry.games_pushed}</span></td>
                            <td>$${entry.total_bet.toFixed(2)}</td>
                            <td>$${entry.total_won.toFixed(2)}</td>
                            <td class="profit-col ${entry.net_profit >= 0 ? 'profit-positive' : 'profit-negative'}">
                                ${entry.net_profit >= 0 ? '+' : ''}$${entry.net_profit.toFixed(2)}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        ${completed_games === 0 ? `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <h3>No games completed yet</h3>
                <p>The leaderboard will populate once games are played and results are entered.</p>
            </div>
        ` : ''}
    `;
}
