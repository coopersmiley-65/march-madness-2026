/**
 * Game Engine – Betting logic matching the Excel spreadsheet.
 *
 * Core mechanic:
 *  - Each game has a pot = (numberOfActivePlayers × betPerGame) + pushedPot
 *  - Each player picks which team wins: 'A' or 'B'
 *  - If the actual result matches a player's pick → they are a winner
 *  - If ALL players pick the same team → PUSH (pot rolls to next game)
 *  - Winners split the pot evenly
 */

/**
 * Get the list of active players from settings.
 */
export function getActivePlayers(settings) {
    return settings.players.filter(p => p.active);
}

/**
 * Calculate the result of a single game.
 * @param {Object} game - The game object (must have .winner set)
 * @param {Object} picks - { playerId: 'A' | 'B' } for this game
 * @param {Object} settings - Settings with maxBetPerGame
 * @param {number} pushedPot - Pot amount pushed from a previous game
 * @returns {Object} { winners: [], losers: [], isPush, newMoney, totalPot, payout, pushAmount }
 */
export function calculateGameResult(game, picks, settings, pushedPot = 0) {
    const activePlayers = getActivePlayers(settings);
    const betPerGame = settings.maxBetPerGame;
    const newMoney = activePlayers.length * betPerGame;
    const totalPot = newMoney + pushedPot;

    if (!game.winner) {
        return {
            winners: [],
            losers: [],
            isPush: false,
            newMoney,
            totalPot,
            payout: 0,
            pushAmount: 0,
            status: 'pending',
        };
    }

    const winningTeam = game.winner; // 'A' or 'B'

    const winners = [];
    const losers = [];

    for (const player of activePlayers) {
        const pick = picks[player.id];
        if (!pick) continue;
        if (pick === winningTeam) {
            winners.push(player);
        } else {
            losers.push(player);
        }
    }

    // Check for PUSH: all players picked the same team
    const allPicks = activePlayers.map(p => picks[p.id]).filter(Boolean);
    const uniquePicks = [...new Set(allPicks)];
    const isPush = uniquePicks.length === 1 && allPicks.length === activePlayers.length;

    if (isPush) {
        return {
            winners: [],
            losers: [],
            isPush: true,
            newMoney,
            totalPot,
            payout: 0,
            pushAmount: totalPot,
            status: 'push',
        };
    }

    const payout = winners.length > 0 ? totalPot / winners.length : 0;

    return {
        winners,
        losers,
        isPush: false,
        newMoney,
        totalPot,
        payout,
        pushAmount: 0,
        status: 'completed',
    };
}

/**
 * Calculate the leaderboard across all completed games.
 * @param {Array} games - All game objects
 * @param {Object} allPicks - { gameId: { playerId: 'A' | 'B' } }
 * @param {Object} settings
 * @returns {Array} Sorted leaderboard: [{ player, totalWon, totalBet, netProfit, gamesWon, gamesLost }]
 */
export function calculateLeaderboard(games, allPicks, settings) {
    const activePlayers = getActivePlayers(settings);
    const betPerGame = settings.maxBetPerGame;

    const playerStats = {};
    for (const player of activePlayers) {
        playerStats[player.id] = {
            player,
            totalWon: 0,
            totalBet: 0,
            netProfit: 0,
            gamesWon: 0,
            gamesLost: 0,
            gamesPushed: 0,
        };
    }

    // Process games in order, tracking push chains
    const completedGames = games.filter(g => g.winner);
    let pushedPot = 0;

    // We need to process games in the order they'd be played
    // For simplicity, process all games and track push chains per game sequence
    const gameResults = {};

    for (const game of completedGames) {
        const picks = allPicks[game.id] || {};
        const result = calculateGameResult(game, picks, settings, pushedPot);
        gameResults[game.id] = result;

        if (result.isPush) {
            pushedPot = result.pushAmount;
        } else {
            pushedPot = 0;
        }

        // Update player stats
        for (const player of activePlayers) {
            const pick = picks[player.id];
            if (!pick) continue;

            playerStats[player.id].totalBet += betPerGame;

            if (result.isPush) {
                playerStats[player.id].gamesPushed++;
            } else if (result.winners.find(w => w.id === player.id)) {
                playerStats[player.id].gamesWon++;
                playerStats[player.id].totalWon += result.payout;
            } else {
                playerStats[player.id].gamesLost++;
            }
        }
    }

    // Calculate net profit
    for (const player of activePlayers) {
        const stats = playerStats[player.id];
        stats.netProfit = stats.totalWon - stats.totalBet;
    }

    // Sort by net profit descending
    return Object.values(playerStats).sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Get detailed results for a single game, formatted for display.
 */
export function getGameSummary(game, picks, settings, pushedPot = 0) {
    const result = calculateGameResult(game, picks, settings, pushedPot);
    return {
        gameId: game.id,
        teamA: game.teamA,
        teamB: game.teamB,
        scoreA: game.scoreA,
        scoreB: game.scoreB,
        winner: game.winner,
        ...result,
        picks: Object.entries(picks).map(([playerId, pick]) => {
            const player = settings.players.find(p => p.id === parseInt(playerId));
            return {
                player: player ? player.name : `Player ${playerId}`,
                pick,
                isWinner: result.winners.some(w => w.id === parseInt(playerId)),
            };
        }),
    };
}
