/**
 * Tournament data model.
 * 4 regions × 8 first-round matchups = 32 Round-of-64 games
 * Progresses: R64 → R32 → Sweet 16 → Elite 8 → Final 4 → Championship
 * Total: 63 games
 */

export const REGIONS = ['East', 'West', 'Midwest', 'South'];

export const ROUNDS = [
    { id: 'R64', name: 'Round of 64', gamesPerRegion: 8 },
    { id: 'R32', name: 'Round of 32', gamesPerRegion: 4 },
    { id: 'R16', name: 'Sweet 16', gamesPerRegion: 2 },
    { id: 'E8', name: 'Elite 8', gamesPerRegion: 1 },
    { id: 'F4', name: 'Final 4', gamesPerRegion: 0 },  // special: 2 cross-region semis
    { id: 'NCG', name: 'Championship', gamesPerRegion: 0 }, // special: 1 final
];

/**
 * Generate the full set of 63 game objects for the tournament.
 * Each game: { id, round, region, gameNum, teamA, teamB, scoreA, scoreB, winner, status }
 * status: 'upcoming' | 'locked' | 'completed'
 */
export function generateBracket() {
    const games = [];

    // Round of 64: seed matchups per region (1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15)
    const seedMatchups = [
        [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]
    ];

    for (const region of REGIONS) {
        seedMatchups.forEach((seeds, i) => {
            games.push({
                id: `${region}_R64_G${i + 1}`,
                round: 'R64',
                region,
                gameNum: i + 1,
                teamA: `${region} #${seeds[0]} Seed`,
                teamB: `${region} #${seeds[1]} Seed`,
                seedA: seeds[0],
                seedB: seeds[1],
                scoreA: null,
                scoreB: null,
                winner: null,  // 'A' or 'B'
                status: 'upcoming',
            });
        });
    }

    // Round of 32: winners feed in (G1 winner vs G2 winner, G3 vs G4, G5 vs G6, G7 vs G8)
    const r32Feeds = [[1, 2], [3, 4], [5, 6], [7, 8]];
    for (const region of REGIONS) {
        r32Feeds.forEach((feedGames, i) => {
            games.push({
                id: `${region}_R32_G${i + 1}`,
                round: 'R32',
                region,
                gameNum: i + 1,
                teamA: null, // filled from R64 results
                teamB: null,
                feedA: `${region}_R64_G${feedGames[0]}`,
                feedB: `${region}_R64_G${feedGames[1]}`,
                scoreA: null,
                scoreB: null,
                winner: null,
                status: 'upcoming',
            });
        });
    }

    // Sweet 16: 2 games per region
    const r16Feeds = [[1, 2], [3, 4]];
    for (const region of REGIONS) {
        r16Feeds.forEach((feedGames, i) => {
            games.push({
                id: `${region}_R16_G${i + 1}`,
                round: 'R16',
                region,
                gameNum: i + 1,
                teamA: null,
                teamB: null,
                feedA: `${region}_R32_G${feedGames[0]}`,
                feedB: `${region}_R32_G${feedGames[1]}`,
                scoreA: null,
                scoreB: null,
                winner: null,
                status: 'upcoming',
            });
        });
    }

    // Elite 8: 1 game per region
    for (const region of REGIONS) {
        games.push({
            id: `${region}_E8_G1`,
            round: 'E8',
            region,
            gameNum: 1,
            teamA: null,
            teamB: null,
            feedA: `${region}_R16_G1`,
            feedB: `${region}_R16_G2`,
            scoreA: null,
            scoreB: null,
            winner: null,
            status: 'upcoming',
        });
    }

    // Final 4 - Semifinal 1: East vs West
    games.push({
        id: 'F4_Semi1',
        round: 'F4',
        region: null,
        gameNum: 1,
        label: 'East vs West',
        teamA: null,
        teamB: null,
        feedA: 'East_E8_G1',
        feedB: 'West_E8_G1',
        scoreA: null,
        scoreB: null,
        winner: null,
        status: 'upcoming',
    });

    // Final 4 - Semifinal 2: South vs Midwest
    games.push({
        id: 'F4_Semi2',
        round: 'F4',
        region: null,
        gameNum: 2,
        label: 'South vs Midwest',
        teamA: null,
        teamB: null,
        feedA: 'South_E8_G1',
        feedB: 'Midwest_E8_G1',
        scoreA: null,
        scoreB: null,
        winner: null,
        status: 'upcoming',
    });

    // Championship
    games.push({
        id: 'NCG',
        round: 'NCG',
        region: null,
        gameNum: 1,
        label: 'National Championship',
        teamA: null,
        teamB: null,
        feedA: 'F4_Semi1',
        feedB: 'F4_Semi2',
        scoreA: null,
        scoreB: null,
        winner: null,
        status: 'upcoming',
    });

    return games;
}

/**
 * Propagate winners down the bracket: when a game is completed,
 * update the teamA/teamB of the game that feeds from it.
 */
export function propagateWinners(games) {
    const gameMap = {};
    games.forEach(g => gameMap[g.id] = g);

    for (const game of games) {
        if (game.feedA) {
            const feeder = gameMap[game.feedA];
            if (feeder && feeder.winner) {
                game.teamA = feeder.winner === 'A' ? feeder.teamA : feeder.teamB;
                game.seedA = feeder.winner === 'A' ? feeder.seedA : feeder.seedB;
            }
        }
        if (game.feedB) {
            const feeder = gameMap[game.feedB];
            if (feeder && feeder.winner) {
                game.teamB = feeder.winner === 'A' ? feeder.teamA : feeder.teamB;
                game.seedB = feeder.winner === 'A' ? feeder.seedA : feeder.seedB;
            }
        }
    }
    return games;
}
