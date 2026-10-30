import test from 'node:test';
import assert from 'node:assert/strict';
import { awardPoint, createInitialScoreState, handleServeFault, getServeTargetBox } from './rules';
import { createInitialBall, stepBallPhysics, strikeBallWithRacket, predictBallLanding, evaluateContactQuality } from './physics';
import { COURT_CONFIG } from './types';

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

test('Ball physics steps and handles floor gravity', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.position = { x: 0, y: 2.0, z: 0 };
  ball.velocity = { x: 0, y: 0, z: 0 };

  const result = stepBallPhysics(ball, 0.1);
  assert.ok(result.ball.position.y < 2.0, 'Ball should fall with gravity');
  assert.ok(result.ball.velocity.y < 0, 'Velocity Y should be negative downward');
});

test('Racket strike launches ball with velocity towards target', () => {
  const ball = createInitialBall('south');
  const target = { x: 2.0, y: 0, z: -7.0 };
  const struck = strikeBallWithRacket(ball, 'south', 'topspin', 0.8, target, { x: 0, y: 0, z: 7 });

  assert.equal(struck.inPlay, true);
  assert.equal(struck.lastHitter, 'south');
  assert.ok(struck.velocity.z < 0, 'Ball hit by South player should travel towards negative Z (North)');
  assert.ok(struck.velocity.y > 0, 'Ball should have upward launch angle');
  assert.ok(struck.spin.x > 0, 'Topspin should apply positive spin.x');
});

test('Predict ball landing projects bounce location accurately', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.position = { x: 0, y: 2.5, z: 2.0 };
  ball.velocity = { x: 1.0, y: 0, z: -10.0 };

  const pred = predictBallLanding(ball);
  assert.ok(pred.timeToBounce > 0, 'Predicted time to bounce should be positive');
  assert.ok(pred.z < 2.0, 'Predicted Z should be further down court');
});

test('Evaluate contact quality assesses sweet spot and distance', () => {
  const player = { x: 0, y: 0, z: 5.0 };
  // Ball right in sweet spot zone (~0.9m away, waist height)
  const sweetBall = { x: 0.8, y: 1.1, z: 5.2 };
  const contact = evaluateContactQuality(player, sweetBall, 5.0);
  assert.equal(contact.quality, 'PERFECT');
  assert.ok(contact.powerMultiplier >= 1.0);

  // Ball far away (out of reach)
  const farBall = { x: 4.0, y: 1.1, z: 5.0 };
  const outContact = evaluateContactQuality(player, farBall, 5.0);
  assert.equal(outContact.quality, 'OUT_OF_REACH');
});
