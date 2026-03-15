/**
 * All Picks View – Shows every player's picks across all tournament games
 * Admin can view anytime; players only after March 19 noon ET.
 */
import { api } from '../api.js';

const ROUND_ORDER = ['R64', 'R32', 'S16', 'E8', 'F4', 'NCG'];
const ROUND_LABELS = {
    R64: 'Round of 64', R32: 'Round of 32', S16: 'Sweet 16',
    E8: 'Elite 8', F4: 'Final Four', NCG: 'Championship'
};

export async function renderAllPicks() {
    const wrapper = document.createElement('div');
    wrapper.className = 'allpicks-view';

    wrapper.innerHTML = `
        <div class="allpicks-header">
            <h1><span class="header-icon">👥</span> All Picks</h1>
            <p class="allpicks-subtitle">Every player's picks across all tournament games</p>
        </div>
        <div class="allpicks-loading">Loading all picks…</div>
    `;

    try {
        const data = await api.getAllPlayerPicks();

        if (!data.allowed) {
            wrapper.innerHTML = `
                <div class="allpicks-header">
                    <h1><span class="header-icon">🔒</span> All Picks</h1>
                    <p class="allpicks-subtitle">Picks will be visible once the tournament begins</p>
                </div>
                <div class="allpicks-locked">
                    <div class="locked-icon">🏀</div>
                    <h2>Picks are Hidden Until Tournament Start</h2>
                    <p>${data.message}</p>
                    <p class="locked-date">March 19, 2026 at 12:00 PM Eastern</p>
                </div>
            `;
            return wrapper;
        }

        const { games, players, picks } = data;

        // Build a lookup: pickMap[game_id][player_number] = pick ('W' or 'L')
        const pickMap = {};
        for (const p of picks) {
            if (!pickMap[p.game_id]) pickMap[p.game_id] = {};
            pickMap[p.game_id][p.player_number] = p.pick;
        }

        // Build game lookup
        const gameMap = {};
        for (const g of games) gameMap[g.game_id] = g;

        // Group games by round
        const gamesByRound = {};
        for (const g of games) {
            if (!gamesByRound[g.round]) gamesByRound[g.round] = [];
            gamesByRound[g.round].push(g);
        }

        // Render the table
        let tableHTML = `
            <div class="allpicks-header">
                <h1><span class="header-icon">👥</span> All Picks</h1>
                <p class="allpicks-subtitle">Every player's picks across all ${games.length} tournament games</p>
            </div>
            <div class="allpicks-table-wrap">
                <table class="allpicks-table">
                    <thead>
                        <tr>
                            <th class="col-round">Round</th>
                            <th class="col-game">Game</th>
                            ${players.map(p => `<th class="col-player">P${p.player_number}<br><span class="player-subname">${p.display_name}</span></th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const round of ROUND_ORDER) {
            const roundGames = gamesByRound[round] || [];
            if (roundGames.length === 0) continue;

            for (let i = 0; i < roundGames.length; i++) {
                const g = roundGames[i];
                const teamA = g.team_a || 'TBD';
                const teamB = g.team_b || 'TBD';

                tableHTML += `<tr class="game-row ${i === 0 ? 'round-first' : ''}">`;

                // Round label (only on first game of each round)
                if (i === 0) {
                    tableHTML += `<td class="col-round" rowspan="${roundGames.length}"><span class="round-badge">${ROUND_LABELS[round] || round}</span></td>`;
                }

                // Game matchup
                tableHTML += `<td class="col-game">
                    <span class="matchup-seed">${g.seed_a || ''}</span>
                    <span class="matchup-team">${teamA}</span>
                    <span class="matchup-vs">vs</span>
                    <span class="matchup-seed">${g.seed_b || ''}</span>
                    <span class="matchup-team">${teamB}</span>
                </td>`;

                // Each player's pick
                for (const player of players) {
                    const pick = pickMap[g.game_id]?.[player.player_number];
                    let cellContent = '—';
                    let cellClass = 'pick-none';

                    if (pick === 'W') {
                        cellContent = teamA;
                        cellClass = 'pick-top';
                    } else if (pick === 'L') {
                        cellContent = teamB;
                        cellClass = 'pick-bottom';
                    } else if (pick === 'Selection') {
                        cellContent = '…';
                        cellClass = 'pick-pending';
                    }

                    tableHTML += `<td class="col-pick ${cellClass}">${cellContent}</td>`;
                }

                tableHTML += `</tr>`;
            }
        }

        tableHTML += `</tbody></table></div>`;
        wrapper.innerHTML = tableHTML;

    } catch (err) {
        wrapper.querySelector('.allpicks-loading').textContent = 'Error loading picks: ' + err.message;
    }

    return wrapper;
}
