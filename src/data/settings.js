/**
 * Default settings matching the Bet_Settings sheet from the Excel.
 */
export const DEFAULT_SETTINGS = {
    numberOfPlayers: 3,
    maxBetPerGame: 0.50,
    betAmounts: [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50,
        0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00],
    players: [
        { id: 1, name: 'Rick', active: true },
        { id: 2, name: 'Fred', active: true },
        { id: 3, name: 'Curt', active: true },
        { id: 4, name: 'Player 4', active: false },
        { id: 5, name: 'Player 5', active: false },
        { id: 6, name: 'Player 6', active: false },
        { id: 7, name: 'Player 7', active: false },
        { id: 8, name: 'Player 8', active: false },
        { id: 9, name: 'Player 9', active: false },
        { id: 10, name: 'Player 10', active: false },
    ],
};
