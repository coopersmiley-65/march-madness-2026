/**
 * Bracket View – Traditional tournament bracket with API data.
 */
import { api } from '../api.js';

export async function renderBracket() {
    const container = document.createElement('div');
    container.className = 'bracket-view';

    container.innerHTML = `
        <div class="view-header">
            <h1>🏀 2026 Tournament Bracket</h1>
            <p class="subtitle">Click any game to view details</p>
        </div>
        <div class="bracket-wrapper">
            <div class="loading-spinner">Loading bracket...</div>
        </div>
    `;

    // Load data
    try {
        const { games } = await api.getGames();
        renderBracketContent(container, games);
    } catch (e) {
        container.querySelector('.bracket-wrapper').innerHTML = `<div class="error-msg">Failed to load bracket: ${e.message}</div>`;
    }

    return container;
}

function renderBracketContent(container, games) {
    const regions = ['East', 'West', 'MidWest', 'South'];
    const byRegion = {};
    regions.forEach(r => byRegion[r] = {});
    games.forEach(g => {
        if (g.region) {
            if (!byRegion[g.region][g.round]) byRegion[g.region][g.round] = [];
            byRegion[g.region][g.round].push(g);
        }
    });

    const f4 = games.filter(g => g.round === 'F4');
    const ncg = games.filter(g => g.round === 'NCG');

    container.querySelector('.bracket-wrapper').innerHTML = `
        <div class="bracket-round-labels">
            <span>R64</span><span>R32</span><span>S16</span><span>E8</span>
            <span class="label-center">F4 / CHAMPIONSHIP / F4</span>
            <span>E8</span><span>S16</span><span>R32</span><span>R64</span>
        </div>
        <div class="bracket-full">
            <div class="bracket-half left-half">
                ${renderHalf(byRegion, 'East', 'West')}
            </div>
            <div class="bracket-center-col">
                <div class="center-game f4-game" data-pos="top">
                    ${centerGameCard(f4[0])}
                </div>
                <div class="center-game ncg-game">
                    <div class="ncg-label">🏆 Championship</div>
                    ${centerGameCard(ncg[0])}
                </div>
                <div class="center-game f4-game" data-pos="bottom">
                    ${centerGameCard(f4[1])}
                </div>
            </div>
            <div class="bracket-half right-half">
                ${renderHalf(byRegion, 'South', 'MidWest')}
            </div>
        </div>
    `;

    // Click handlers for game details modal
    container.querySelectorAll('.b-game').forEach(el => {
        el.addEventListener('click', () => showGameModal(el.dataset.gameId, games));
    });
}

function regionDisplay(r) { return r === 'West' ? 'South' : r === 'South' ? 'West' : r; }

function renderHalf(byRegion, topRegion, bottomRegion) {
    const rounds = ['R64', 'R32', 'S16', 'E8'];

    return `
        <div class="half-content">
            <div class="half-region" data-region="${topRegion}">
                <div class="region-label-bracket ${topRegion.toLowerCase()}">${regionDisplay(topRegion)}</div>
                <div class="region-bracket-rounds">
                    ${rounds.map(roundId => {
        const roundGames = byRegion[topRegion][roundId] || [];
        return `<div class="bracket-round-col round-${roundId}" data-round="${roundId}">
                            ${roundGames.map(g => bracketGameCell(g)).join('')}
                        </div>`;
    }).join('')}
                </div>
            </div>
            <div class="half-region" data-region="${bottomRegion}">
                <div class="region-label-bracket ${bottomRegion.toLowerCase()}">${regionDisplay(bottomRegion)}</div>
                <div class="region-bracket-rounds">
                    ${rounds.map(roundId => {
        const roundGames = byRegion[bottomRegion][roundId] || [];
        return `<div class="bracket-round-col round-${roundId}" data-round="${roundId}">
                            ${roundGames.map(g => bracketGameCell(g)).join('')}
                        </div>`;
    }).join('')}
                </div>
            </div>
        </div>
    `;
}

function bracketGameCell(game) {
    const teamA = game.team_a || 'TBD';
    const teamB = game.team_b || 'TBD';
    const statusClass = game.status === 'FINAL_PAYOUT' ? 'completed' : (game.status === 'LOCKED' ? 'locked' : 'upcoming');

    return `
        <div class="b-game-wrapper">
            <div class="b-game ${statusClass}" data-game-id="${game.game_id}" title="${game.game_id}">
                <div class="b-team ${game.winner === 'A' ? 'b-winner' : ''}">
                    <span class="b-seed">${game.seed_a || ''}</span>
                    <span class="b-name">${teamA}</span>
                    <span class="b-score">${game.score_a !== null && game.score_a !== undefined ? game.score_a : ''}</span>
                </div>
                <div class="b-team ${game.winner === 'B' ? 'b-winner' : ''}">
                    <span class="b-seed">${game.seed_b || ''}</span>
                    <span class="b-name">${teamB}</span>
                    <span class="b-score">${game.score_b !== null && game.score_b !== undefined ? game.score_b : ''}</span>
                </div>
            </div>
        </div>
    `;
}

function centerGameCard(game) {
    if (!game) return '<div class="b-game empty">TBD</div>';
    const teamA = game.team_a || 'TBD';
    const teamB = game.team_b || 'TBD';
    const statusClass = game.status === 'FINAL_PAYOUT' ? 'completed' : 'upcoming';
    return `
        <div class="b-game center-card ${statusClass}" data-game-id="${game.game_id}">
            <div class="b-team ${game.winner === 'A' ? 'b-winner' : ''}">
                <span class="b-seed">${game.seed_a || ''}</span>
                <span class="b-name">${teamA}</span>
                <span class="b-score">${game.score_a !== null && game.score_a !== undefined ? game.score_a : ''}</span>
            </div>
            <div class="b-team ${game.winner === 'B' ? 'b-winner' : ''}">
                <span class="b-seed">${game.seed_b || ''}</span>
                <span class="b-name">${teamB}</span>
                <span class="b-score">${game.score_b !== null && game.score_b !== undefined ? game.score_b : ''}</span>
            </div>
        </div>
    `;
}

async function showGameModal(gameId, allGames) {
    const game = allGames.find(g => g.game_id === gameId);
    if (!game) return;

    const user = window.appState.user;
    const isAdmin = user && user.is_admin;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal game-modal">
            <div class="modal-header">
                <h2>${game.label || game.game_id}</h2>
                <button class="modal-close" id="modal-close">✕</button>
            </div>
            <div class="modal-body">
                <div class="matchup-display">
                    <div class="matchup-team ${game.winner === 'A' ? 'winner-highlight' : ''}">
                        <span class="matchup-seed">${game.seed_a || ''}</span>
                        <span class="matchup-name">${game.team_a || 'TBD'}</span>
                        ${isAdmin ? `<input type="number" class="score-input" id="scoreA" value="${game.score_a !== null && game.score_a !== undefined ? game.score_a : ''}" placeholder="Score" min="0" />` : `<span class="matchup-score">${game.score_a !== null && game.score_a !== undefined ? game.score_a : '-'}</span>`}
                    </div>
                    <div class="matchup-vs">VS</div>
                    <div class="matchup-team ${game.winner === 'B' ? 'winner-highlight' : ''}">
                        <span class="matchup-seed">${game.seed_b || ''}</span>
                        <span class="matchup-name">${game.team_b || 'TBD'}</span>
                        ${isAdmin ? `<input type="number" class="score-input" id="scoreB" value="${game.score_b !== null && game.score_b !== undefined ? game.score_b : ''}" placeholder="Score" min="0" />` : `<span class="matchup-score">${game.score_b !== null && game.score_b !== undefined ? game.score_b : '-'}</span>`}
                    </div>
                </div>

                ${game.status === 'FINAL_PAYOUT' || game.status === 'PUSH' ? `
                    <div class="game-result-badge ${game.status === 'PUSH' ? 'push' : 'final'}">
                        ${game.status === 'PUSH' ? '🔄 PUSH — Pot rolls to next game' : '✅ FINAL'}
                    </div>
                ` : ''}

                ${isAdmin ? `
                <div class="modal-actions">
                    <button class="btn btn-primary" id="saveGame">Save Result</button>
                    <button class="btn btn-secondary" id="cancelGame">Cancel</button>
                </div>
                ` : `
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="cancelGame">Close</button>
                </div>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cancelGame').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    if (isAdmin && overlay.querySelector('#saveGame')) {
        overlay.querySelector('#saveGame').addEventListener('click', async () => {
            const scoreA = overlay.querySelector('#scoreA').value;
            const scoreB = overlay.querySelector('#scoreB').value;
            if (scoreA !== '' && scoreB !== '') {
                try {
                    await api.setGameResult(gameId, parseInt(scoreA), parseInt(scoreB));
                    overlay.remove();
                    window.dispatchEvent(new CustomEvent('rerender'));
                } catch (err) {
                    alert('Error: ' + err.message);
                }
            }
        });
    }
}
