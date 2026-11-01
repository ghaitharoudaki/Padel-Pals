import { MatchLength, ScoreState, Side } from './types';

export const POINT_LABELS = ['0', '15', '30', '40'];

export function createInitialScoreState(
  servingSide: Side = 'south',
  matchLength: MatchLength = '1_set',
  goldenPoint: boolean = false
): ScoreState {
  const targetGames = matchLength === '1_game' ? 1 : matchLength === '3_games' ? 3 : 6;
  return {
    games: [0, 0],
    points: ['0', '0'],
    rawPoints: [0, 0],
    servingSide,
    serveAttempt: 1,
    rallyCount: 0,
    winner: null,
    lastEventDescription: 'Match ready. Service to Player 1.',
    isTiebreak: false,
    tiebreakPoints: [0, 0],
    targetGames,
    matchLength,
    goldenPoint,
    switchedSides: false,
  };
}

export interface PointAwardResult {
  nextState: ScoreState;
  pointWinner: Side;
  gameWon: boolean;
  matchWon: boolean;
  eventDescription: string;
  sideSwitch: boolean;
}

/**
 * Award a point according to official padel rules:
 * - 15/30/40/Advantage or Golden Point (Punto de Oro at 40-40)
 * - First to 6 games (must win by 2, or 7-5, or tiebreak at 6-6)
 * - Match lengths: 1 game / 3 games / 1 set
 * - Side switch after odd games (1st, 3rd, 5th, etc.)
 */
export function awardPoint(
  currentState: ScoreState,
  winner: Side,
  overrideTargetGames?: number,
  overrideGoldenPoint?: boolean
): PointAwardResult {
  const winnerIdx = winner === 'south' ? 0 : 1;
  const loserIdx = winner === 'south' ? 1 : 0;
  const targetGames = overrideTargetGames ?? currentState.targetGames;
  const goldenPoint = overrideGoldenPoint ?? currentState.goldenPoint;

  const raw = [...currentState.rawPoints] as [number, number];
  const games = [...currentState.games] as [number, number];
  const tiebreakPoints = [...currentState.tiebreakPoints] as [number, number];
  let servingSide = currentState.servingSide;
  let isTiebreak = currentState.isTiebreak;
  let gameWon = false;
  let matchWon = false;
  let sideSwitch = false;
  let eventDesc = `${winner === 'south' ? 'Player 1' : 'Player 2'} wins the point!`;
  let nextPoints: [string, string] = ['0', '0'];

  // 1. TIEBREAK SCORING (at 6-6 in 1 set mode)
  if (isTiebreak) {
    tiebreakPoints[winnerIdx] += 1;
    const tW = tiebreakPoints[winnerIdx];
    const tL = tiebreakPoints[loserIdx];

    // Win tiebreak: first to 7 points, win by 2
    if (tW >= 7 && tW - tL >= 2) {
      gameWon = true;
      games[winnerIdx] += 1;
      matchWon = true; // Set is won on tiebreak
      eventDesc = `Tiebreak & Set won by ${winner === 'south' ? 'Player 1' : 'Player 2'} (${tW}-${tL})!`;
    } else {
      nextPoints = [String(tiebreakPoints[0]), String(tiebreakPoints[1])];
      eventDesc = `Tiebreak: ${tiebreakPoints[0]} - ${tiebreakPoints[1]}`;
      // In tiebreak, rotate server after 1st point and then every 2 points
      const sumPts = tiebreakPoints[0] + tiebreakPoints[1];
      if (sumPts % 2 === 1) {
        servingSide = servingSide === 'south' ? 'north' : 'south';
      }
      // Switch sides every 6 points in a tiebreak
      if (sumPts % 6 === 0) {
        sideSwitch = true;
      }
    }
  } else {
    // 2. STANDARD GAME SCORING
    raw[winnerIdx] += 1;
    const pW = raw[winnerIdx];
    const pL = raw[loserIdx];

    if (goldenPoint && pW >= 4 && pW > pL) {
      // Golden Point (Punto de Oro) at 40-40: next point wins game directly
      gameWon = true;
    } else if (pW >= 4 && pW - pL >= 2) {
      // Standard win (40-0, 40-15, 40-30, or AD -> win)
      gameWon = true;
    }

    if (gameWon) {
      games[winnerIdx] += 1;
      raw[0] = 0;
      raw[1] = 0;
      nextPoints = ['0', '0'];
      servingSide = servingSide === 'south' ? 'north' : 'south'; // Rotate server

      const gW = games[winnerIdx];
      const gL = games[loserIdx];
      const totalGames = games[0] + games[1];

      // Padel Rule: Switch ends/sides after odd games
      if (totalGames % 2 === 1) {
        sideSwitch = true;
      }

      eventDesc = `Game ${winner === 'south' ? 'Player 1' : 'Player 2'}! (${games[0]}-${games[1]})`;

      // Check match victory condition based on match length:
      if (targetGames === 1) {
        // 1 Game match
        matchWon = true;
        eventDesc = `Match won by ${winner === 'south' ? 'Player 1' : 'Player 2'}!`;
      } else if (targetGames === 3) {
        // 3 Games match
        if (gW >= 3) {
          matchWon = true;
          eventDesc = `Match won by ${winner === 'south' ? 'Player 1' : 'Player 2'} (${games[0]}-${games[1]})!`;
        }
      } else {
        // Full Set (target 6 games)
        if (gW >= 6 && gW - gL >= 2) {
          // Standard set win: 6-0, 6-1, 6-2, 6-3, 6-4, 7-5
          matchWon = true;
          eventDesc = `Set won by ${winner === 'south' ? 'Player 1' : 'Player 2'} (${games[0]}-${games[1]})!`;
        } else if (gW === 6 && gL === 6) {
          // Tiebreak triggered at 6-6!
          isTiebreak = true;
          tiebreakPoints[0] = 0;
          tiebreakPoints[1] = 0;
          nextPoints = ['0', '0'];
          eventDesc = '6-6! Entering deciding Tiebreak (first to 7 points, win by 2)!';
        }
      }
    } else {
      // Format 15/30/40/AD display
      if (pW >= 3 && pL >= 3) {
        if (pW === pL) {
          nextPoints = ['40', '40']; // Deuce
          eventDesc = goldenPoint ? '40-40 Punto de Oro (Golden Point)!' : 'Deuce!';
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
  }

  const nextState: ScoreState = {
    games,
    points: nextPoints,
    rawPoints: raw,
    servingSide,
    serveAttempt: 1, // Reset to 1st serve for next point
    rallyCount: 0,
    winner: matchWon ? winner : null,
    lastEventDescription: eventDesc,
    isTiebreak,
    tiebreakPoints,
    targetGames,
    matchLength: currentState.matchLength,
    goldenPoint,
    switchedSides: sideSwitch,
  };

  return {
    nextState,
    pointWinner: winner,
    gameWon,
    matchWon,
    eventDescription: eventDesc,
    sideSwitch,
  };
}

/**
 * Handle a serve fault:
 * - 1st serve fault -> "Fault! Second serve." (same score, serveAttempt = 2)
 * - 2nd serve fault -> Double fault! Point to opponent.
 */
export function handleServeFault(
  currentState: ScoreState,
  overrideTargetGames?: number
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
      sideSwitch: false,
    };
  }

  // Second serve fault = Double Fault!
  const result = awardPoint(currentState, receivingSide, overrideTargetGames);
  result.eventDescription = `Double fault! ${result.eventDescription}`;
  result.nextState.lastEventDescription = result.eventDescription;
  return result;
}

/**
 * Handle a LET serve (serve hits net tape and lands legally in receiver's service box).
 * Result: replay the same serve attempt!
 */
export function handleLetServe(currentState: ScoreState): ScoreState {
  return {
    ...currentState,
    lastEventDescription: `Let! Ball clipped net tape into service box. Replay ${
      currentState.serveAttempt === 1 ? '1st' : '2nd'
    } serve.`,
  };
}

/**
 * Check which service box is targeted based on point count (right/left alternation).
 * Even sum of points -> right box (deuce court).
 * Odd sum of points -> left box (ad court).
 */
export function getServeTargetBox(scoreOrPoints: ScoreState | number): 'right' | 'left' {
  if (typeof scoreOrPoints === 'number') {
    return scoreOrPoints % 2 === 0 ? 'right' : 'left';
  }
  if (scoreOrPoints.isTiebreak) {
    const sum = scoreOrPoints.tiebreakPoints[0] + scoreOrPoints.tiebreakPoints[1];
    return sum % 2 === 0 ? 'right' : 'left';
  }
  const sum = scoreOrPoints.rawPoints[0] + scoreOrPoints.rawPoints[1];
  return sum % 2 === 0 ? 'right' : 'left';
}
