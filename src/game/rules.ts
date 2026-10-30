import { ScoreState, Side } from './types';

export const POINT_LABELS = ['0', '15', '30', '40'];

export function createInitialScoreState(servingSide: Side = 'south'): ScoreState {
  return {
    games: [0, 0],
    points: ['0', '0'],
    rawPoints: [0, 0],
    servingSide,
    serveAttempt: 1,
    rallyCount: 0,
    winner: null,
    lastEventDescription: 'Match ready. Service to Player 1.',
  };
}

export interface PointAwardResult {
  nextState: ScoreState;
  pointWinner: Side;
  gameWon: boolean;
  matchWon: boolean;
  eventDescription: string;
}

/**
 * Award a point to either 'south' or 'north' according to official padel / tennis rules.
 * targetGames: number of games needed to win match (default 3 for brisk matches, can be 6 for full set)
 */
export function awardPoint(
  currentState: ScoreState,
  winner: Side,
  targetGames: number = 6,
  goldenPoint: boolean = false
): PointAwardResult {
  const winnerIdx = winner === 'south' ? 0 : 1;
  const loserIdx = winner === 'south' ? 1 : 0;

  const raw = [...currentState.rawPoints] as [number, number];
  const games = [...currentState.games] as [number, number];
  let servingSide = currentState.servingSide;
  let serveAttempt: 1 | 2 = 1;
  let gameWon = false;
  let matchWon = false;
  let eventDesc = `${winner === 'south' ? 'Player 1' : 'Player 2'} wins the point!`;

  raw[winnerIdx] += 1;

  const pW = raw[winnerIdx];
  const pL = raw[loserIdx];

  // Scoring logic
  let nextPoints: [string, string] = ['0', '0'];

  if (goldenPoint && pW >= 4 && pW > pL) {
    // Golden point rule at 40-40 (next point wins game)
    gameWon = true;
  } else if (pW >= 4 && pW - pL >= 2) {
    // Regular win (40-0, 40-15, 40-30, or win from AD)
    gameWon = true;
  }

  if (gameWon) {
    games[winnerIdx] += 1;
    raw[0] = 0;
    raw[1] = 0;
    nextPoints = ['0', '0'];
    servingSide = servingSide === 'south' ? 'north' : 'south'; // Rotate server each game
    eventDesc = `Game ${winner === 'south' ? 'Player 1' : 'Player 2'}! (${games[0]}-${games[1]})`;

    // First team to reach 6 games wins the match!
    if (games[winnerIdx] >= targetGames) {
      matchWon = true;
      eventDesc = `Match won by ${winner === 'south' ? 'Player 1' : 'Player 2'}!`;
    }
  } else {
    // Format display points
    if (pW >= 3 && pL >= 3) {
      if (pW === pL) {
        nextPoints = ['40', '40']; // Deuce
        eventDesc = 'Deuce!';
      } else if (pW === pL + 1) {
        nextPoints[winnerIdx] = 'AD';
        nextPoints[loserIdx] = '40';
        eventDesc = `Advantage ${winner === 'south' ? 'Player 1' : 'Player 2'}!`;
      }
    } else {
      nextPoints[0] = POINT_LABELS[Math.min(raw[0], 3)];
      nextPoints[1] = POINT_LABELS[Math.min(raw[1], 3)];
    }
  }

  const nextState: ScoreState = {
    games,
    points: nextPoints,
    rawPoints: raw,
    servingSide,
    serveAttempt,
    rallyCount: 0,
    winner: matchWon ? winner : null,
    lastEventDescription: eventDesc,
  };

  return {
    nextState,
    pointWinner: winner,
    gameWon,
    matchWon,
    eventDescription: eventDesc,
  };
}

/**
 * Handle a serve fault. If 1st serve fault -> 2nd serve.
 * If 2nd serve fault -> double fault, opponent gets the point!
 */
export function handleServeFault(
  currentState: ScoreState,
  targetGames: number = 6
): PointAwardResult {
  const servingSide = currentState.servingSide;
  const receivingSide: Side = servingSide === 'south' ? 'north' : 'south';

  if (currentState.serveAttempt === 1) {
    return {
      nextState: {
        ...currentState,
        serveAttempt: 2,
        lastEventDescription: 'First serve fault! Second serve.',
      },
      pointWinner: receivingSide,
      gameWon: false,
      matchWon: false,
      eventDescription: 'First serve fault! Second serve.',
    };
  }

  // Double fault
  const result = awardPoint(currentState, receivingSide, targetGames);
  result.eventDescription = `Double fault! ${result.eventDescription}`;
  result.nextState.lastEventDescription = result.eventDescription;
  return result;
}

/**
 * Check which service box is targeted based on point number (right/left alternation).
 */
export function getServeTargetBox(rawPointsSum: number): 'right' | 'left' {
  // Even sum: serve from right to opponent's right (diagonal to their left from their perspective)
  return rawPointsSum % 2 === 0 ? 'right' : 'left';
}
