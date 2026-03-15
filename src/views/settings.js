/**
 * Settings View – Admin-only: manage players, bet amount, teams, ESPN scrape
 */
import { api } from '../api.js';

export async function renderSettings() {
  const container = document.createElement('div');
  container.className = 'settings-view';

  const user = window.appState.user;
  if (!user || !user.is_admin) {
    container.innerHTML = `<div class="view-header"><h1>⚙️ Admin Only</h1><p class="subtitle">You must be an admin to access settings.</p></div>`;
    return container;
  }

  container.innerHTML = `
        <div class="view-header">
            <h1>⚙️ Admin Settings</h1>
            <p class="subtitle">Configure players, betting rules, and manage teams</p>
        </div>
        <div id="settings-content">
            <div class="loading-spinner">Loading settings...</div>
        </div>
    `;

  try {
    const [settingsData, teamsData, playersData] = await Promise.all([
      api.getSettings(),
      api.getTeams(),
      api.getPlayers(),
    ]);
    renderSettingsContent(container, settingsData.settings, teamsData.teams, playersData.players);
  } catch (e) {
    container.querySelector('#settings-content').innerHTML = `<div class="error-msg">Failed to load: ${e.message}</div>`;
  }

  return container;
}

function renderSettingsContent(container, settings, teams, players) {
  const contentEl = container.querySelector('#settings-content');

  const betOptions = [];
  for (let i = 0.05; i <= 1.0; i += 0.05) {
    betOptions.push(Math.round(i * 100) / 100);
  }

  contentEl.innerHTML = `
        <div class="settings-sections">
            <div class="settings-card">
                <h2>🎲 Betting Rules</h2>
                <div class="setting-row">
                    <label for="numPlayers">Number of Active Players</label>
                    <select id="numPlayers">
                        ${[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}" ${settings.number_of_players === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>
                <div class="setting-row">
                    <label for="maxBet">Max Bet Per Game ($)</label>
                    <select id="maxBet">
                        ${betOptions.map(amt => `<option value="${amt}" ${settings.max_bet_per_game === amt ? 'selected' : ''}>$${amt.toFixed(2)}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="settings-card">
                <h2>👥 Registered Players</h2>
                <div class="players-list-admin">
                    ${players.length === 0 ? '<p class="muted-text">No players registered yet.</p>' : ''}
                    ${players.map(p => `
                        <div class="player-row-admin">
                            <span class="player-num">#${p.player_number}</span>
                            <span class="player-name-admin">${p.display_name}</span>
                            ${p.is_admin ? '<span class="admin-badge">Admin</span>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="settings-card">
                <h2>🏀 Teams – ESPN Import</h2>
                <p class="card-description">Scrape ESPN for the official 2026 tournament bracket, or manually enter team names below.</p>
                <div class="team-actions">
                    <button class="btn btn-primary" id="scrapeEspn">🌐 Scrape ESPN Bracket</button>
                    <button class="btn btn-primary" id="scrapeResults" style="margin-left:0.5rem">📊 Scrape ESPN Results</button>
                </div>
                <div id="scrape-result"></div>
                <div id="scrape-results-result"></div>

                <h3 style="margin-top:1.5rem">Manual Team Entry</h3>
                <div class="teams-grid">
                    ${['East', 'West', 'MidWest', 'South'].map(region => {
    const regionTeams = teams.filter(t => t.region === region);
    return `
                            <div class="team-region-section">
                                <h4 class="region-badge ${region.toLowerCase()}">${region}</h4>
                                ${regionTeams.map(t => `
                                    <div class="team-edit-row">
                                        <span class="team-seed">#${t.seed_number}</span>
                                        <input type="text" class="team-name-input" data-team-id="${t.id}" data-region="${t.region}" data-seed="${t.seed_number}" value="${t.team_name}" />
                                    </div>
                                `).join('')}
                            </div>
                        `;
  }).join('')}
                </div>
                <button class="btn btn-primary" id="saveTeams" style="margin-top:1rem">💾 Save All Team Names</button>
                <div id="save-result"></div>
            </div>

            <div class="settings-card danger-card">
                <h2>⚠️ Data Management</h2>
                <p class="card-description">Export tournament data or reset the database.</p>
                <div class="data-actions">
                    <button class="btn btn-secondary" id="exportData">📤 Export Data (JSON)</button>
                </div>
            </div>
        </div>
    `;

  // Event handlers
  setTimeout(() => {
    // Settings changes
    contentEl.querySelector('#numPlayers').addEventListener('change', async (e) => {
      try {
        await api.updateSettings({ number_of_players: parseInt(e.target.value) });
      } catch (err) { alert('Error: ' + err.message); }
    });

    contentEl.querySelector('#maxBet').addEventListener('change', async (e) => {
      try {
        await api.updateSettings({ max_bet_per_game: parseFloat(e.target.value) });
      } catch (err) { alert('Error: ' + err.message); }
    });

    // ESPN Scrape
    contentEl.querySelector('#scrapeEspn').addEventListener('click', async () => {
      const resultEl = contentEl.querySelector('#scrape-result');
      resultEl.innerHTML = '<div class="loading-spinner">Scraping ESPN...</div>';
      try {
        const result = await api.scrapeESPN();
        resultEl.innerHTML = `<div class="success-msg">✅ Successfully imported ${result.count} teams!</div>`;
        // Reload settings
        window.dispatchEvent(new CustomEvent('rerender'));
      } catch (err) {
        resultEl.innerHTML = `<div class="error-msg">❌ ${err.message}</div>`;
      }
    });

    // ESPN Results Scrape
    contentEl.querySelector('#scrapeResults').addEventListener('click', async () => {
      const resultEl = contentEl.querySelector('#scrape-results-result');
      resultEl.innerHTML = '<div class="loading-spinner">Scraping ESPN for game results...</div>';
      try {
        const result = await api.scrapeESPNResults();
        if (result.updated > 0) {
          resultEl.innerHTML = `<div class="success-msg">✅ Updated ${result.updated} game(s) with ESPN results!</div>`;
          window.dispatchEvent(new CustomEvent('rerender'));
        } else {
          resultEl.innerHTML = `<div class="success-msg">ℹ️ ${result.message || 'No new completed games found on ESPN'}</div>`;
        }
      } catch (err) {
        resultEl.innerHTML = `<div class="error-msg">❌ ${err.message}</div>`;
      }
    });

    // Save teams
    contentEl.querySelector('#saveTeams').addEventListener('click', async () => {
      const inputs = contentEl.querySelectorAll('.team-name-input');
      const teamsToSave = [];
      inputs.forEach(input => {
        teamsToSave.push({
          region: input.dataset.region,
          seed_number: parseInt(input.dataset.seed),
          team_name: input.value.trim(),
          is_play_in: false,
        });
      });

      const resultEl = contentEl.querySelector('#save-result');
      try {
        await api.importTeams(teamsToSave);
        resultEl.innerHTML = '<div class="success-msg">✅ Teams saved successfully!</div>';
      } catch (err) {
        resultEl.innerHTML = `<div class="error-msg">❌ ${err.message}</div>`;
      }
    });

    // Export
    contentEl.querySelector('#exportData').addEventListener('click', async () => {
      try {
        const [gamesData, teamsData, settingsData] = await Promise.all([
          api.getGames(), api.getTeams(), api.getSettings()
        ]);
        const data = { games: gamesData.games, teams: teamsData.teams, settings: settingsData.settings };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'march-madness-2026-backup.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) { alert('Export error: ' + err.message); }
    });
  }, 0);
}
