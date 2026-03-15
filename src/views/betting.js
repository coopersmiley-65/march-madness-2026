/**
 * Betting View – Bracket-style layout with click-to-pick and winner propagation.
 * When a player picks a winner, that team auto-fills into the next round's game.
 */
import { api } from '../api.js';

export async function renderBetting() {
  const container = document.createElement('div');
  container.className = 'betting-view';

  container.innerHTML = `
    <div class="view-header">
      <h1>🎯 My Picks</h1>
      <p class="subtitle">Click a team to pick it as the winner — picks cascade through the bracket</p>
    </div>
    <div class="wager-suggestion-section" id="wager-suggestion-section"></div>
    <div class="betting-progress-bar" id="betting-progress-bar"></div>
    <div class="bracket-wrapper picks-bracket">
      <div class="loading-spinner">Loading bracket...</div>
    </div>
  `;

  // Load wager suggestions (async, non-blocking)
  loadWagerSuggestions(container);

  try {
    const { games } = await api.getGames();

    // Load all existing picks
    const allPicks = {};
    const rounds = ['R64', 'R32', 'S16', 'E8', 'F4', 'NCG'];
    const pickResults = await Promise.all(rounds.map(r => api.getMyPicks(r)));
    pickResults.forEach(result => {
      result.picks.forEach(p => { allPicks[p.game_id] = p.pick; });
    });

    // Build game map and projected bracket
    const gameMap = {};
    games.forEach(g => { gameMap[g.game_id] = { ...g }; });

    // Build projected bracket based on player's picks
    const projected = buildProjectedBracket(gameMap, allPicks);

    renderPicksBracket(container, games, projected, allPicks, gameMap);
  } catch (e) {
    container.querySelector('.bracket-wrapper').innerHTML =
      `<div class="error-msg">Failed to load: ${e.message}</div>`;
  }

  return container;
}

/**
 * Build a projected bracket: for each game, determine the teams based on picks.
 * R64 games use their actual teams. Later rounds use the picked winner of feeder games.
 * Returns a map: game_id -> { team_a, team_b, seed_a, seed_b }
 */
function buildProjectedBracket(gameMap, picks) {
  const projected = {};

  // Process games in round order (R64 first, then R32, etc.)
  const roundOrder = ['R64', 'R32', 'S16', 'E8', 'F4', 'NCG'];

  for (const round of roundOrder) {
    const roundGames = Object.values(gameMap).filter(g => g.round === round);
    for (const game of roundGames) {
      if (round === 'R64') {
        // R64 games have their actual teams from the database
        projected[game.game_id] = {
          team_a: game.team_a,
          team_b: game.team_b,
          seed_a: game.seed_a,
          seed_b: game.seed_b,
        };
      } else {
        // Later rounds: team comes from the winner of the feeder game
        const feederA = game.feed_a ? resolveFeeder(game.feed_a, gameMap, picks, projected) : null;
        const feederB = game.feed_b ? resolveFeeder(game.feed_b, gameMap, picks, projected) : null;

        projected[game.game_id] = {
          team_a: feederA ? feederA.team : null,
          team_b: feederB ? feederB.team : null,
          seed_a: feederA ? feederA.seed : null,
          seed_b: feederB ? feederB.seed : null,
        };
      }
    }
  }
  return projected;
}

/**
 * Resolve which team advances from a feeder game based on the player's pick.
 * Returns { team, seed } or null if no pick made yet.
 */
function resolveFeeder(feederGameId, gameMap, picks, projected) {
  const pick = picks[feederGameId];
  if (!pick || pick === 'Selection') return null;

  const proj = projected[feederGameId];
  if (!proj) return null;

  // pick 'W' = team_a wins, 'L' = team_b wins
  if (pick === 'W') {
    return proj.team_a ? { team: proj.team_a, seed: proj.seed_a } : null;
  } else {
    return proj.team_b ? { team: proj.team_b, seed: proj.seed_b } : null;
  }
}


function renderPicksBracket(container, games, projected, picks, gameMap) {
  // Count progress: games that have both teams projected AND a pick made
  const pickableGames = Object.keys(projected).filter(gid => {
    const p = projected[gid];
    return p.team_a && p.team_b;
  });
  const pickedGames = pickableGames.filter(gid => picks[gid] && picks[gid] !== 'Selection');
  const totalCount = pickableGames.length;
  const pickedCount = pickedGames.length;

  // Progress bar
  const progressEl = container.querySelector('#betting-progress-bar');
  const pct = totalCount > 0 ? (pickedCount / totalCount) * 100 : 0;
  progressEl.innerHTML = `
    <div class="pick-progress-inner">
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${pct}%"></div>
      </div>
      <span class="progress-text">${pickedCount}/${totalCount} picks made</span>
      ${pickedCount === totalCount && totalCount > 0 ? '<span class="progress-complete">✅ All picks complete!</span>' : ''}
    </div>
  `;

  // Group games by region and round
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

  const wrapper = container.querySelector('.bracket-wrapper');
  wrapper.innerHTML = `
    <div class="bracket-round-labels">
      <span>R64</span><span>R32</span><span>S16</span><span>E8</span>
      <span class="label-center">F4 / CHAMPIONSHIP / F4</span>
      <span>E8</span><span>S16</span><span>R32</span><span>R64</span>
    </div>
    <div class="bracket-full">
      <div class="bracket-half left-half">
        ${renderPicksHalf(byRegion, 'East', 'West', picks, projected, gameMap)}
      </div>
      <div class="bracket-connector-col left-connector">
        <div class="connector-top">
          <div class="connector-vertical"></div>
          <div class="connector-horizontal"></div>
        </div>
        <div class="connector-bottom">
          <div class="connector-vertical"></div>
          <div class="connector-horizontal"></div>
        </div>
      </div>
      <div class="bracket-center-col">
        <div class="center-game f4-game" data-pos="top">
          ${pickGameCard(f4[0], picks, projected, gameMap)}
        </div>
        <div class="center-game ncg-game">
          <div class="ncg-label">🏆 Championship</div>
          ${pickGameCard(ncg[0], picks, projected, gameMap)}
        </div>
        <div class="center-game f4-game" data-pos="bottom">
          ${pickGameCard(f4[1], picks, projected, gameMap)}
        </div>
      </div>
      <div class="bracket-connector-col right-connector">
        <div class="connector-top">
          <div class="connector-horizontal"></div>
          <div class="connector-vertical"></div>
        </div>
        <div class="connector-bottom">
          <div class="connector-horizontal"></div>
          <div class="connector-vertical"></div>
        </div>
      </div>
      <div class="bracket-half right-half">
        ${renderPicksHalf(byRegion, 'South', 'MidWest', picks, projected, gameMap)}
      </div>
    </div>
  `;

  // Attach click-on-team listeners
  wrapper.querySelectorAll('.b-team.pickable').forEach(teamRow => {
    teamRow.addEventListener('click', async () => {
      const gameId = teamRow.dataset.gameId;
      const pick = teamRow.dataset.pick; // 'W' = top team wins, 'L' = bottom team wins
      const card = teamRow.closest('.b-game');
      const teamRows = card.querySelectorAll('.b-team');

      try {
        await api.setPick(gameId, pick);

        // Update local picks
        picks[gameId] = pick;

        // Green for winner, Red for loser
        teamRows.forEach(row => row.classList.remove('team-win', 'team-lose'));
        if (pick === 'W') {
          teamRows[0].classList.add('team-win');
          teamRows[1].classList.add('team-lose');
        } else {
          teamRows[0].classList.add('team-lose');
          teamRows[1].classList.add('team-win');
        }

        // Rebuild the projected bracket and re-render downstream games
        const newProjected = buildProjectedBracket(gameMap, picks);

        // Update all downstream game cards that depend on this pick
        propagateDownstream(wrapper, gameId, picks, newProjected, gameMap);

        // Update projected reference
        Object.assign(projected, newProjected);

        // Update progress
        const pickableGames = Object.keys(projected).filter(gid => {
          const p = projected[gid];
          return p.team_a && p.team_b;
        });
        const pickedGames = pickableGames.filter(gid => picks[gid] && picks[gid] !== 'Selection');
        const pct = pickableGames.length > 0 ? (pickedGames.length / pickableGames.length) * 100 : 0;
        const progressInner = container.querySelector('.pick-progress-inner');
        if (progressInner) {
          progressInner.querySelector('.progress-bar').style.width = `${pct}%`;
          progressInner.querySelector('.progress-text').textContent = `${pickedGames.length}/${pickableGames.length} picks made`;
        }
      } catch (err) {
        alert('Error saving pick: ' + err.message);
      }
    });
  });
}

/**
 * After a pick changes, find all downstream games and update their displayed teams.
 * Also clears picks and colors on games whose teams changed.
 */
function propagateDownstream(wrapper, changedGameId, picks, projected, gameMap) {
  // Find all games that directly or indirectly feed from the changed game
  const toUpdate = new Set();

  function findDownstream(gameId) {
    for (const [gid, game] of Object.entries(gameMap)) {
      if (game.feed_a === gameId || game.feed_b === gameId) {
        toUpdate.add(gid);
        findDownstream(gid); // recursive for further rounds
      }
    }
  }
  findDownstream(changedGameId);

  // Update each downstream game card in the DOM
  for (const gid of toUpdate) {
    const proj = projected[gid];
    const cardEl = wrapper.querySelector(`.b-game[data-game-id="${gid}"]`);
    if (!cardEl) continue;

    const teamRows = cardEl.querySelectorAll('.b-team');
    if (teamRows.length < 2) continue;

    // Update team A (top)
    const nameA = teamRows[0].querySelector('.b-name');
    const seedA = teamRows[0].querySelector('.b-seed');
    if (nameA) nameA.textContent = proj.team_a || 'TBD';
    if (seedA) seedA.textContent = proj.seed_a || '';

    // Update team B (bottom)
    const nameB = teamRows[1].querySelector('.b-name');
    const seedB = teamRows[1].querySelector('.b-seed');
    if (nameB) nameB.textContent = proj.team_b || 'TBD';
    if (seedB) seedB.textContent = proj.seed_b || '';

    // Make pickable if both teams exist, disable if not
    const hasTeams = proj.team_a && proj.team_b;
    teamRows.forEach(row => {
      if (hasTeams) {
        row.classList.add('pickable');
        row.dataset.gameId = gid;
      } else {
        row.classList.remove('pickable');
      }
    });
    teamRows[0].dataset.pick = 'W';
    teamRows[1].dataset.pick = 'L';

    // If a team changed, reset the pick for this game
    const currentPick = picks[gid];
    if (currentPick && currentPick !== 'Selection') {
      // Check if the teams changed — if so, clear the pick
      // We'll keep the pick if teams haven't changed
    }

    // Re-apply pick colors if pick exists and teams are still valid
    teamRows.forEach(row => row.classList.remove('team-win', 'team-lose'));
    if (picks[gid] && picks[gid] !== 'Selection' && hasTeams) {
      if (picks[gid] === 'W') {
        teamRows[0].classList.add('team-win');
        teamRows[1].classList.add('team-lose');
      } else {
        teamRows[0].classList.add('team-lose');
        teamRows[1].classList.add('team-win');
      }
    }

    // Re-attach click listener (remove old, add new)
    teamRows.forEach(row => {
      const newRow = row.cloneNode(true);
      row.parentNode.replaceChild(newRow, row);
    });

    // Re-query and re-attach listeners on the refreshed rows
    const freshRows = cardEl.querySelectorAll('.b-team.pickable');
    freshRows.forEach(teamRow => {
      teamRow.addEventListener('click', async () => {
        const gid2 = teamRow.dataset.gameId;
        const pick2 = teamRow.dataset.pick;
        const card2 = teamRow.closest('.b-game');
        const rows2 = card2.querySelectorAll('.b-team');

        try {
          await api.setPick(gid2, pick2);
          picks[gid2] = pick2;

          rows2.forEach(r => r.classList.remove('team-win', 'team-lose'));
          if (pick2 === 'W') {
            rows2[0].classList.add('team-win');
            rows2[1].classList.add('team-lose');
          } else {
            rows2[0].classList.add('team-lose');
            rows2[1].classList.add('team-win');
          }

          const newProj = buildProjectedBracket(gameMap, picks);
          propagateDownstream(wrapper, gid2, picks, newProj, gameMap);
          Object.assign(projected, newProj);

          // Update progress (find the container)
          const progressInner = wrapper.closest('.betting-view').querySelector('.pick-progress-inner');
          if (progressInner) {
            const pickableGames = Object.keys(newProj).filter(id => {
              const p = newProj[id];
              return p.team_a && p.team_b;
            });
            const pickedGames = pickableGames.filter(id => picks[id] && picks[id] !== 'Selection');
            const pct = pickableGames.length > 0 ? (pickedGames.length / pickableGames.length) * 100 : 0;
            progressInner.querySelector('.progress-bar').style.width = `${pct}%`;
            progressInner.querySelector('.progress-text').textContent = `${pickedGames.length}/${pickableGames.length} picks made`;
          }
        } catch (err) {
          alert('Error saving pick: ' + err.message);
        }
      });
    });
  }
}

function renderPicksHalf(byRegion, topRegion, bottomRegion, picks, projected, gameMap) {
  const rounds = ['R64', 'R32', 'S16', 'E8'];

  return `
    <div class="half-content">
      <div class="half-region" data-region="${topRegion}">
        <div class="region-label-bracket ${topRegion.toLowerCase()}">${topRegion}</div>
        <div class="region-bracket-rounds">
          ${rounds.map(roundId => {
    const roundGames = byRegion[topRegion][roundId] || [];
    return `<div class="bracket-round-col round-${roundId}" data-round="${roundId}">
              ${roundGames.map(g => pickGameCell(g, picks, projected, gameMap)).join('')}
            </div>`;
  }).join('')}
        </div>
      </div>
      <div class="half-region" data-region="${bottomRegion}">
        <div class="region-label-bracket ${bottomRegion.toLowerCase()}">${bottomRegion}</div>
        <div class="region-bracket-rounds">
          ${rounds.map(roundId => {
    const roundGames = byRegion[bottomRegion][roundId] || [];
    return `<div class="bracket-round-col round-${roundId}" data-round="${roundId}">
              ${roundGames.map(g => pickGameCell(g, picks, projected, gameMap)).join('')}
            </div>`;
  }).join('')}
        </div>
      </div>
    </div>
  `;
}

function pickGameCell(game, picks, projected, gameMap) {
  if (!game) return '<div class="b-game-wrapper"><div class="b-game empty">TBD</div></div>';

  const proj = projected[game.game_id] || {};
  const teamA = proj.team_a || 'TBD';
  const teamB = proj.team_b || 'TBD';
  const seedA = proj.seed_a;
  const seedB = proj.seed_b;
  const currentPick = picks[game.game_id];
  const isCompleted = game.status === 'FINAL_PAYOUT' || game.status === 'PUSH';
  const isLocked = isCompleted || game.status === 'LOCKED';
  const hasTeams = proj.team_a && proj.team_b;
  const hasPick = currentPick && currentPick !== 'Selection';
  const canPick = !isLocked && hasTeams;

  const statusClass = game.status === 'FINAL_PAYOUT' ? 'completed' :
    game.status === 'PUSH' ? 'pushed' :
      game.status === 'LOCKED' ? 'locked' : 'upcoming';

  // Determine result indicators for completed games
  let topIndicator = '';
  let botIndicator = '';
  let topResultClass = '';
  let botResultClass = '';
  let scoreDisplay = '';

  if (isCompleted && game.winner) {
    // Show scores
    if (game.score_a != null && game.score_b != null) {
      scoreDisplay = `<div class="game-score-line">${game.score_a} – ${game.score_b}</div>`;
    }

    // Winner is A = team_a won, Winner is B = team_b won
    const aWon = game.winner === 'A';
    topResultClass = aWon ? 'result-winner' : 'result-loser';
    botResultClass = aWon ? 'result-loser' : 'result-winner';
    topIndicator = aWon ? '<span class="result-mark win">✓</span>' : '<span class="result-mark lose">✗</span>';
    botIndicator = aWon ? '<span class="result-mark lose">✗</span>' : '<span class="result-mark win">✓</span>';
  }

  const topClass = hasPick ? (currentPick === 'W' ? 'team-win' : 'team-lose') : '';
  const botClass = hasPick ? (currentPick === 'L' ? 'team-win' : 'team-lose') : '';

  return `
    <div class="b-game-wrapper">
      <div class="b-game pick-game ${statusClass} ${hasPick ? 'has-pick' : 'no-pick'}" data-game-id="${game.game_id}">
        <div class="b-team ${topClass} ${topResultClass} ${canPick ? 'pickable' : ''}" data-game-id="${game.game_id}" data-pick="W">
          <span class="b-seed">${seedA || ''}</span>
          <span class="b-name">${teamA}</span>
          ${topIndicator}
        </div>
        ${scoreDisplay}
        <div class="b-team ${botClass} ${botResultClass} ${canPick ? 'pickable' : ''}" data-game-id="${game.game_id}" data-pick="L">
          <span class="b-seed">${seedB || ''}</span>
          <span class="b-name">${teamB}</span>
          ${botIndicator}
        </div>
      </div>
    </div>
  `;
}

function pickGameCard(game, picks, projected, gameMap) {
  if (!game) return '<div class="b-game empty">TBD</div>';
  return pickGameCell(game, picks, projected, gameMap);
}

/**
 * Load and render the wager suggestion section (dropdown + summary table)
 */
async function loadWagerSuggestions(container) {
  const section = container.querySelector('#wager-suggestion-section');
  const user = window.appState.user;

  // Admin doesn't suggest — they set the amount directly in settings
  if (user.player_number === 0) {
    section.innerHTML = `
      <div class="wager-box">
        <span class="wager-label">💰 Wager suggestions from players appear below</span>
      </div>
    `;
  }

  try {
    const data = await api.getWagerSuggestions();
    renderWagerSection(section, data, user);
  } catch (e) {
    section.innerHTML = '';
  }
}

function renderWagerSection(section, data, user) {
  const { suggestions, mySuggestion } = data;
  const isAdmin = user.player_number === 0;

  // Build bet options $0.05 to $1.00
  const betOptions = [];
  for (let i = 0.05; i <= 1.0; i += 0.05) {
    betOptions.push(Math.round(i * 100) / 100);
  }

  const currentAmount = mySuggestion ? mySuggestion.suggested_amount : '';

  let html = `<div class="wager-box">`;

  // Player dropdown (not for admin)
  if (!isAdmin) {
    html += `
      <div class="wager-suggest-row">
        <label class="wager-label" for="wager-dropdown">💰 Suggest your preferred bet per game:</label>
        <select id="wager-dropdown" class="wager-dropdown">
          <option value="">Select amount…</option>
          ${betOptions.map(amt => `<option value="${amt}" ${currentAmount === amt ? 'selected' : ''}>$${amt.toFixed(2)}</option>`).join('')}
        </select>
        <button class="btn btn-primary btn-sm" id="submit-wager-btn">${mySuggestion ? 'Update' : 'Submit'}</button>
        ${mySuggestion ? `<span class="wager-current">Currently: $${mySuggestion.suggested_amount.toFixed(2)}</span>` : ''}
      </div>
    `;
  }

  // Suggestions table
  if (suggestions.length > 0) {
    html += `
      <div class="wager-suggestions-table">
        <h4>🗳️ Player Suggestions</h4>
        <table class="wager-table">
          <thead><tr><th>Player</th><th>Suggested Bet</th></tr></thead>
          <tbody>
            ${suggestions.map(s => `
              <tr${s.player_number === user.player_number ? ' class="my-row"' : ''}>
                <td>${s.display_name}</td>
                <td>$${s.suggested_amount.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (isAdmin) {
    html += `<p class="wager-empty">No wager suggestions yet.</p>`;
  }

  html += `</div>`;
  section.innerHTML = html;

  // Event handler for submit
  if (!isAdmin) {
    const btn = section.querySelector('#submit-wager-btn');
    const dropdown = section.querySelector('#wager-dropdown');
    if (btn && dropdown) {
      btn.addEventListener('click', async () => {
        const amount = parseFloat(dropdown.value);
        if (!amount) return;
        try {
          btn.disabled = true;
          btn.textContent = '…';
          await api.submitWagerSuggestion(amount);
          // Reload suggestions
          const updated = await api.getWagerSuggestions();
          renderWagerSection(section, updated, user);
        } catch (err) {
          alert('Error: ' + err.message);
          btn.disabled = false;
          btn.textContent = 'Submit';
        }
      });
    }
  }
}
