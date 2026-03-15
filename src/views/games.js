/**
 * Games View – Round-by-round vertical game list.
 * Mirrors the Excel round sheets with tabs for each round.
 */
import { store } from '../store.js';
import { REGIONS, ROUNDS } from '../data/tournament.js';
import { calculateGameResult, getActivePlayers } from '../engine.js';

export function renderGames() {
    const container = document.createElement('div');
    container.className = 'games-view';

    const games = store.getGames();
    const settings = store.getSettings();
    const activePlayers = getActivePlayers(settings);

    container.innerHTML = `
    <div class="view-header">
      <h1>📋 Games by Round</h1>
      <p class="subtitle">View and manage all tournament games</p>
    </div>
    <div class="round-tabs">
      ${ROUNDS.map((r, i) => `
        <button class="round-tab ${i === 0 ? 'active' : ''}" data-round="${r.id}">
          ${r.name}
        </button>
      `).join('')}
    </div>
    <div class="round-content" id="round-content">
      ${renderRound('R64', games, settings, activePlayers)}
    </div>
  `;

    // Tab event handlers
    setTimeout(() => {
        container.querySelectorAll('.round-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                container.querySelectorAll('.round-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const roundId = tab.dataset.round;
                container.querySelector('#round-content').innerHTML =
                    renderRound(roundId, games, settings, activePlayers);
                attachGameCardHandlers(container);
            });
        });
        attachGameCardHandlers(container);
    }, 0);

    return container;
}

function renderRound(roundId, games, settings, activePlayers) {
    const roundGames = games.filter(g => g.round === roundId);

    if (roundId === 'F4' || roundId === 'NCG') {
        // No region grouping
        return `
      <div class="region-section">
        <h2 class="region-header">
          <span class="region-badge special">${roundId === 'F4' ? 'Final Four' : '🏆 Championship'}</span>
        </h2>
        <div class="games-list">
          ${roundGames.map(g => gameRow(g, settings, activePlayers)).join('')}
        </div>
      </div>
    `;
    }

    return REGIONS.map(region => {
        const regionGames = roundGames.filter(g => g.region === region);
        if (regionGames.length === 0) return '';
        return `
      <div class="region-section">
        <h2 class="region-header">
          <span class="region-badge ${region.toLowerCase()}">${region}</span>
        </h2>
        <div class="games-list">
          ${regionGames.map(g => gameRow(g, settings, activePlayers)).join('')}
        </div>
      </div>
    `;
    }).join('');
}

function gameRow(game, settings, activePlayers) {
    const picks = store.getPicks(game.id);
    const allPicks = store.getAllPicks();
    const result = game.winner
        ? calculateGameResult(game, picks, settings, 0)
        : null;

    const statusBadge = game.status === 'completed'
        ? (result && result.isPush ? '<span class="status-badge push">PUSH</span>' : '<span class="status-badge completed">FINAL</span>')
        : game.status === 'locked'
            ? '<span class="status-badge locked">LOCKED</span>'
            : '<span class="status-badge upcoming">UPCOMING</span>';

    return `
    <div class="game-row-card" data-game-id="${game.id}">
      <div class="game-row-header">
        <span class="game-id">${game.label || game.id.replace(/_/g, ' ')}</span>
        ${statusBadge}
      </div>
      <div class="game-row-matchup">
        <div class="game-row-team ${game.winner === 'A' ? 'winner' : ''}">
          <span class="seed-badge">${game.seedA || '?'}</span>
          <span class="team-label">${game.teamA || 'TBD'}</span>
          <span class="team-score">${game.scoreA !== null ? game.scoreA : '-'}</span>
        </div>
        <div class="game-row-team ${game.winner === 'B' ? 'winner' : ''}">
          <span class="seed-badge">${game.seedB || '?'}</span>
          <span class="team-label">${game.teamB || 'TBD'}</span>
          <span class="team-score">${game.scoreB !== null ? game.scoreB : '-'}</span>
        </div>
      </div>
      <div class="game-row-picks">
        ${activePlayers.map(p => {
        const pick = picks[p.id];
        const isWinner = result && result.winners && result.winners.some(w => w.id === p.id);
        const className = !pick ? 'no-pick' : isWinner ? 'winner-pick' : (result ? 'loser-pick' : 'pending-pick');
        return `<span class="pick-chip ${className}" title="${p.name}: ${pick ? (pick === 'A' ? (game.teamA || 'Team A') : (game.teamB || 'Team B')) : 'No pick'}">${p.name.charAt(0)}:${pick || '?'}</span>`;
    }).join('')}
      </div>
      ${result && !result.isPush && result.winners.length > 0 ? `
        <div class="game-row-payout">
          Pot: $${result.totalPot.toFixed(2)} → ${result.winners.map(w => w.name).join(', ')} ($${result.payout.toFixed(2)} each)
        </div>
      ` : ''}
      ${result && result.isPush ? `
        <div class="game-row-payout push-payout">
          PUSH → $${result.totalPot.toFixed(2)} rolls to next game
        </div>
      ` : ''}
    </div>
  `;
}

function attachGameCardHandlers(container) {
    container.querySelectorAll('.game-row-card').forEach(el => {
        el.style.cursor = 'pointer';
        el.addEventListener('click', () => {
            // Import showGameModal dynamically to avoid circular deps
            import('./bracket.js').then(mod => {
                // We'll dispatch a custom event to open the modal
                window.dispatchEvent(new CustomEvent('openGameModal', { detail: { gameId: el.dataset.gameId } }));
            });
        });
    });
}
