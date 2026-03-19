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

        const dbA = (dbGame.team_a || '').toLowerCase().trim();
        const dbB = (dbGame.team_b || '').toLowerCase().trim();
        const espnHome = espnGame.homeTeam.toLowerCase().trim();
        const espnAway = espnGame.awayTeam.toLowerCase().trim();

        // Require name match on BOTH teams — seeds alone are NOT sufficient
        // because multiple games can share the same seed numbers.
        const homeNameMatchA = nameMatch(espnHome, dbA);
        const awayNameMatchB = nameMatch(espnAway, dbB);
        const homeNameMatchB = nameMatch(espnHome, dbB);
        const awayNameMatchA = nameMatch(espnAway, dbA);

        // Optionally boost confidence with seed match (both must match)
        const seedMatchAB = espnGame.homeSeed && espnGame.awaySeed
            && espnGame.homeSeed === dbGame.seed_a && espnGame.awaySeed === dbGame.seed_b;
        const seedMatchBA = espnGame.homeSeed && espnGame.awaySeed
            && espnGame.homeSeed === dbGame.seed_b && espnGame.awaySeed === dbGame.seed_a;

        // Match if BOTH team names match, OR both seeds match AND at least one name matches
        if ((homeNameMatchA && awayNameMatchB) || (seedMatchAB && (homeNameMatchA || awayNameMatchB))) {
            return {
                dbGame,
                score_a: espnGame.homeScore,
                score_b: espnGame.awayScore,
            };
        }
        if ((homeNameMatchB && awayNameMatchA) || (seedMatchBA && (homeNameMatchB || awayNameMatchA))) {
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
 * Strict name match — compares team names for reliable matching.
 * Requires at least 4 characters and checks for meaningful overlap,
 * not just substring containment of short strings like "north".
 */
function nameMatch(a, b) {
    if (!a || !b) return false;
    if (a.startsWith('tbd') || b.startsWith('tbd')) return false;

    // Normalize: remove punctuation, extra spaces
    const cleanA = a.replace(/['.]/g, '').replace(/\s+/g, ' ').trim();
    const cleanB = b.replace(/['.]/g, '').replace(/\s+/g, ' ').trim();

    // Exact match
    if (cleanA === cleanB) return true;

    // One fully contains the other (but require the shorter to be at least 4 chars)
    if (cleanA.length >= 4 && cleanB.length >= 4) {
        if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
    }

    // Word-level matching: check if key words overlap
    const wordsA = cleanA.split(' ').filter(w => w.length >= 3);
    const wordsB = cleanB.split(' ').filter(w => w.length >= 3);

    // Common short words to ignore in matching
    const ignoreWords = new Set(['the', 'state', 'north', 'south', 'east', 'west', 'new', 'san', 'old']);

    // Check if a significant unique word from one appears in the other
    for (const word of wordsA) {
        if (ignoreWords.has(word)) continue;
        if (word.length >= 4 && wordsB.some(wb => wb === word || wb.includes(word) || word.includes(wb))) {
            return true;
        }
    }

    return false;
}
