import test from 'node:test';
import assert from 'node:assert/strict';
import { awardPoint, createInitialScoreState, handleServeFault, getServeTargetBox, handleLetServe } from '../../src/game/engine/rules';

test('Initial score state is properly structured', () => {
  const state = createInitialScoreState('south');
  assert.equal(state.servingSide, 'south');
  assert.deepEqual(state.games, [0, 0]);
  assert.deepEqual(state.points, ['0', '0']);
  assert.equal(state.winner, null);
});

test('Awarding points advances tennis/padel scoring correctly', () => {
  let state = createInitialScoreState('south');

  // Point 1: 15 - 0
  let res = awardPoint(state, 'south');
  assert.equal(res.nextState.points[0], '15');
  assert.equal(res.nextState.points[1], '0');

  // Point 2: 30 - 0
  res = awardPoint(res.nextState, 'south');
  assert.equal(res.nextState.points[0], '30');

  // Point 3: 40 - 0
  res = awardPoint(res.nextState, 'south');
  assert.equal(res.nextState.points[0], '40');

  // Point 4: Game Player 1! Games: 1 - 0, points reset to 0 - 0, server rotates
  res = awardPoint(res.nextState, 'south');
  assert.equal(res.gameWon, true);
  assert.deepEqual(res.nextState.games, [1, 0]);
  assert.deepEqual(res.nextState.points, ['0', '0']);
  assert.equal(res.nextState.servingSide, 'north');
});

test('Deuce and Advantage scoring work properly', () => {
  let state = createInitialScoreState('south');
  state = awardPoint(state, 'south').nextState; // 15-0
  state = awardPoint(state, 'south').nextState; // 30-0
  state = awardPoint(state, 'south').nextState; // 40-0
  state = awardPoint(state, 'north').nextState; // 40-15
  state = awardPoint(state, 'north').nextState; // 40-30
  const deuceRes = awardPoint(state, 'north');  // 40-40 Deuce
  assert.deepEqual(deuceRes.nextState.points, ['40', '40']);

  const advRes = awardPoint(deuceRes.nextState, 'south');
  assert.equal(advRes.nextState.points[0], 'AD');
  assert.equal(advRes.gameWon, false);

  const gameRes = awardPoint(advRes.nextState, 'south');
  assert.equal(gameRes.gameWon, true);
  assert.equal(gameRes.nextState.games[0], 1);
});

test('Double fault awards point to opponent', () => {
  const state = createInitialScoreState('south');
  const fault1 = handleServeFault(state);
  assert.equal(fault1.nextState.serveAttempt, 2);
  assert.deepEqual(fault1.nextState.points, ['0', '0']);

  const fault2 = handleServeFault(fault1.nextState);
  assert.equal(fault2.nextState.points[1], '15');
});

test('Serve target box alternates by point count', () => {
  assert.equal(getServeTargetBox(0), 'right');
  assert.equal(getServeTargetBox(1), 'left');
  assert.equal(getServeTargetBox(2), 'right');
  assert.equal(getServeTargetBox(3), 'left');
});

test('Let serve replay preserves score and serve attempt', () => {
  const state = createInitialScoreState('south');
  const replayed = handleLetServe(state);
  assert.equal(replayed.serveAttempt, 1);
  assert.ok(replayed.lastEventDescription.includes('Let!'));
});

test('First serve fault gives second serve; second serve fault gives point to receiver', () => {
  const state = createInitialScoreState('south');
  const f1 = handleServeFault(state);
  assert.equal(f1.nextState.serveAttempt, 2);
  assert.deepEqual(f1.nextState.points, ['0', '0']);

  const f2 = handleServeFault(f1.nextState);
  assert.equal(f2.pointWinner, 'north');
  assert.equal(f2.nextState.points[1], '15');
});

// ==========================================
// 5. TIMING QUALITY & CONTACT EVALUATION
// ==========================================

test('Golden Point (Punto de Oro) awards game directly at 40-40 deuce', () => {
  let score = createInitialScoreState('south', '1_set', true); // goldenPoint = true
  // Advance to 40-40
  score = awardPoint(score, 'south').nextState; // 15-0
  score = awardPoint(score, 'south').nextState; // 30-0
  score = awardPoint(score, 'south').nextState; // 40-0
  score = awardPoint(score, 'north').nextState; // 40-15
  score = awardPoint(score, 'north').nextState; // 40-30
  score = awardPoint(score, 'north').nextState; // 40-40
  assert.deepEqual(score.points, ['40', '40']);

  // Golden point! Next point wins game directly
  const res = awardPoint(score, 'south');
  assert.equal(res.gameWon, true, 'Game should be won directly on golden point');
  assert.deepEqual(res.nextState.games, [1, 0]);
});

test('Odd games trigger side switch (change of ends)', () => {
  let score = createInitialScoreState('south', '1_set');
  // Win game 1 (South wins 4 points)
  for (let i = 0; i < 4; i++) {
    const res = awardPoint(score, 'south');
    score = res.nextState;
    if (res.gameWon) {
      assert.equal(res.sideSwitch, true, 'Must switch ends after game 1 (odd total games)');
    }
  }
});

test('Full set: 6-6 triggers deciding tiebreak to 7 points (win by 2)', () => {
  let score = createInitialScoreState('south', '1_set');
  score.games = [5, 6];

  // South wins game to make it 6-6
  let res = awardPoint(score, 'south');
  res = awardPoint(res.nextState, 'south');
  res = awardPoint(res.nextState, 'south');
  res = awardPoint(res.nextState, 'south');

  assert.equal(res.nextState.isTiebreak, true, 'Should enter tiebreak at 6-6');
  assert.deepEqual(res.nextState.games, [6, 6]);

  // In tiebreak, win points up to 7-5
  let tb = res.nextState;
  for (let i = 0; i < 6; i++) {
    tb = awardPoint(tb, 'south').nextState;
  }
  for (let i = 0; i < 5; i++) {
    tb = awardPoint(tb, 'north').nextState;
  }
  assert.deepEqual(tb.tiebreakPoints, [6, 5]);

  // Point 7 wins tiebreak and match!
  const tbWin = awardPoint(tb, 'south');
  assert.equal(tbWin.matchWon, true, 'Tiebreak win must win the match');
  assert.equal(tbWin.nextState.winner, 'south');
});
