/**
 * ESPN Results Scraper – March Madness 2026
 * Fetches completed game results from ESPN's public scoreboard API
 * and matches them to games in our database.
 */

const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

// Tournament dates for 2026 March Madness (approximate schedule)
const TOURNAMENT_DATES = [
    // R64 — March 19-20
    '20260319', '20260320',
    // R32 — March 21-22
    '20260321', '20260322',
    // S16 — March 26-27
    '20260326', '20260327',
    // E8 — March 28-29
    '20260328', '20260329',
    // F4 — April 4
    '20260404',
    // NCG — April 6
    '20260406',
];

/**
 * Fetch completed tournament games from ESPN.
 * Returns an array of { teamA, teamB, seedA, seedB, scoreA, scoreB, region, round }
 */
export async function scrapeESPNResults() {
    const completedGames = [];

    for (const dateStr of TOURNAMENT_DATES) {
        try {
            const url = `${ESPN_SCOREBOARD_URL}?groups=100&dates=${dateStr}&limit=50`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            if (!response.ok) continue;

            const data = await response.json();
            if (!data.events) continue;

            for (const event of data.events) {
                const competition = event.competitions?.[0];
                if (!competition) continue;

                // Only process completed games
                const status = competition.status?.type;
                if (!status || !status.completed) continue;

                // Extract teams (home = order 0, away = order 1)
                const home = competition.competitors?.find(c => c.order === 0);
                const away = competition.competitors?.find(c => c.order === 1);
                if (!home || !away) continue;

                const homeTeam = home.team?.shortDisplayName || home.team?.displayName || '';
                const awayTeam = away.team?.shortDisplayName || away.team?.displayName || '';
                const homeSeed = home.curatedRank?.current;
                const awaySeed = away.curatedRank?.current;
                const homeScore = parseInt(home.score);
                const awayScore = parseInt(away.score);

                // Extract region from notes
                const noteHeadline = competition.notes?.[0]?.headline || '';
                let region = null;
                if (noteHeadline.includes('East')) region = 'East';
                else if (noteHeadline.includes('West')) region = 'West';
                else if (noteHeadline.includes('Midwest')) region = 'MidWest';
                else if (noteHeadline.includes('South')) region = 'South';

                // Extract round
                let round = null;
                if (noteHeadline.includes('1st Round')) round = 'R64';
                else if (noteHeadline.includes('2nd Round')) round = 'R32';
                else if (noteHeadline.includes('Sweet 16') || noteHeadline.includes('Regional Semifinal')) round = 'S16';
                else if (noteHeadline.includes('Elite 8') || noteHeadline.includes('Elite Eight') || noteHeadline.includes('Regional Final')) round = 'E8';
                else if (noteHeadline.includes('Final Four') || noteHeadline.includes('National Semifinal')) round = 'F4';
                else if (noteHeadline.includes('Championship') || noteHeadline.includes('National Championship')) round = 'NCG';

                if (!isNaN(homeScore) && !isNaN(awayScore)) {
                    completedGames.push({
                        homeTeam,
                        awayTeam,
                        homeSeed,
                        awaySeed,
                        homeScore,
                        awayScore,
                        region,
                        round,
                        espnId: event.id,
                    });
                }
            }
        } catch (e) {
            console.error(`ESPN scrape error for date ${dateStr}:`, e.message);
        }
    }

    return completedGames;
}

/**
 * Match an ESPN game to a DB game by comparing team names and seeds.
 * Returns the matched DB game or null.
 */
export function matchGameToDb(espnGame, dbGames) {
    for (const dbGame of dbGames) {
        if (!dbGame.team_a || !dbGame.team_b) continue;
        // Already has a result — skip
        if (dbGame.winner) continue;

        // Try matching by team name (fuzzy: check if ESPN name is contained in DB name or vice versa)
        const dbA = (dbGame.team_a || '').toLowerCase();
        const dbB = (dbGame.team_b || '').toLowerCase();
        const espnHome = espnGame.homeTeam.toLowerCase();
        const espnAway = espnGame.awayTeam.toLowerCase();

        // Match: home=A,away=B or home=B,away=A
        const homeIsA = nameMatch(espnHome, dbA) || (espnGame.homeSeed && espnGame.homeSeed === dbGame.seed_a);
        const awayIsB = nameMatch(espnAway, dbB) || (espnGame.awaySeed && espnGame.awaySeed === dbGame.seed_b);
        const homeIsB = nameMatch(espnHome, dbB) || (espnGame.homeSeed && espnGame.homeSeed === dbGame.seed_b);
        const awayIsA = nameMatch(espnAway, dbA) || (espnGame.awaySeed && espnGame.awaySeed === dbGame.seed_a);

        if (homeIsA && awayIsB) {
            // Home = team_a, Away = team_b
            return {
                dbGame,
                score_a: espnGame.homeScore,
                score_b: espnGame.awayScore,
            };
        }
        if (homeIsB && awayIsA) {
            // Home = team_b, Away = team_a
            return {
                dbGame,
                score_a: espnGame.awayScore,
                score_b: espnGame.homeScore,
            };
        }
    }
    return null;
}

/**
 * Fuzzy name match — checks if one name contains the other
 */
function nameMatch(a, b) {
    if (!a || !b) return false;
    // Remove common prefixes like "TBD"
    if (a.startsWith('tbd') || b.startsWith('tbd')) return false;
    return a.includes(b) || b.includes(a);
}
