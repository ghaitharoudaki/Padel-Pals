import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBall, stepBallPhysics, strikeBallWithRacket } from '../../src/game/engine/physics';

test('Case (a) 2 bounces on my side (South) -> opponent (North) gets point', () => {
  let ball = createInitialBall('north', { x: 0, y: 1.0, z: -2.0 });
  // North hits ball over net to South side
  ball = strikeBallWithRacket(
    ball,
    'north',
    'flat',
    0.6,
    { x: 0, y: 0, z: 6.0 },
    { x: 0, y: 1.0, z: -2.0 }
  );

  assert.equal(ball.lastHitter, 'north');
  assert.equal(ball.bouncesOnSide.south, 0);

  // Position ball for 1st bounce on South floor
  ball.position = { x: 0, y: 0.15, z: 5.0 };
  ball.velocity = { x: 0, y: -4.0, z: 2.0 };
  const step1 = stepBallPhysics(ball, 0.016);
  assert.equal(step1.events.bouncedFloor, true);
  assert.equal(step1.ball.bouncesOnSide.south, 1);
  assert.equal(step1.events.pointFault, false);

  // Position ball for 2nd bounce on South floor without South player hitting
  step1.ball.position = { x: 0, y: 0.15, z: 6.5 };
  step1.ball.velocity = { x: 0, y: -2.0, z: 1.0 };
  const step2 = stepBallPhysics(step1.ball, 0.016);

  assert.equal(step2.events.bouncedFloor, true);
  assert.equal(step2.ball.bouncesOnSide.south, 2);
  assert.equal(step2.events.pointFault, true);
  assert.equal(step2.events.faultWinner, 'north', 'Opponent North must be awarded point on double bounce on South');
  assert.equal(step2.events.shortReason, 'Double bounce');
});

test('Case (b) 2 bounces on opponent side (North) -> South gets point', () => {
  let ball = createInitialBall('south', { x: 0, y: 1.0, z: 2.0 });
  // South hits ball over net to North side
  ball = strikeBallWithRacket(
    ball,
    'south',
    'flat',
    0.6,
    { x: 0, y: 0, z: -6.0 },
    { x: 0, y: 1.0, z: 2.0 }
  );

  assert.equal(ball.lastHitter, 'south');
  assert.equal(ball.bouncesOnSide.north, 0);

  // 1st bounce on North floor
  ball.position = { x: 0, y: 0.15, z: -5.0 };
  ball.velocity = { x: 0, y: -4.0, z: -2.0 };
  const step1 = stepBallPhysics(ball, 0.016);
  assert.equal(step1.events.bouncedFloor, true);
  assert.equal(step1.ball.bouncesOnSide.north, 1);
  assert.equal(step1.events.pointFault, false);

  // 2nd bounce on North floor
  step1.ball.position = { x: 0, y: 0.15, z: -6.5 };
  step1.ball.velocity = { x: 0, y: -2.0, z: -1.0 };
  const step2 = stepBallPhysics(step1.ball, 0.016);

  assert.equal(step2.events.bouncedFloor, true);
  assert.equal(step2.ball.bouncesOnSide.north, 2);
  assert.equal(step2.events.pointFault, true);
  assert.equal(step2.events.faultWinner, 'south', 'South must be awarded point on double bounce on North');
  assert.equal(step2.events.shortReason, 'Double bounce');
});

test('Case (c) 1 bounce + glass wall + 2nd bounce on same side without player hit -> defending side loses point', () => {
  let ball = createInitialBall('north', { x: 0, y: 1.0, z: -2.0 });
  ball = strikeBallWithRacket(
    ball,
    'north',
    'flat',
    0.7,
    { x: 0, y: 0, z: 8.5 },
    { x: 0, y: 1.0, z: -2.0 }
  );

  // 1st bounce on South floor
  ball.position = { x: 0, y: 0.15, z: 8.0 };
  ball.velocity = { x: 0, y: -4.0, z: 6.0 };
  const step1 = stepBallPhysics(ball, 0.016);
  assert.equal(step1.events.bouncedFloor, true);
  assert.equal(step1.ball.bouncesOnSide.south, 1);

  // Rebound off South back glass wall
  step1.ball.position = { x: 0, y: 1.2, z: 9.9 };
  step1.ball.velocity = { x: 0, y: 1.0, z: 5.0 };
  const step2 = stepBallPhysics(step1.ball, 0.016);
  assert.equal(step2.events.bouncedGlassWall, true);
  assert.equal(step2.events.pointFault, false, 'Play continues after glass wall rebound');

  // 2nd bounce on South floor without player hit
  step2.ball.position = { x: 0, y: 0.15, z: 8.5 };
  step2.ball.velocity = { x: 0, y: -2.0, z: -3.0 };
  const step3 = stepBallPhysics(step2.ball, 0.016);
  assert.equal(step3.events.bouncedFloor, true);
  assert.equal(step3.ball.bouncesOnSide.south, 2);
  assert.equal(step3.events.pointFault, true);
  assert.equal(step3.events.faultWinner, 'north', 'Defending side South loses point on 2nd bounce');
  assert.equal(step3.events.shortReason, 'Double bounce');
});

test('Case (d) Ball hits wall before bouncing on opponent court -> point against hitter', () => {
  let ball = createInitialBall('south', { x: 0, y: 1.0, z: 4.0 });
  ball = strikeBallWithRacket(
    ball,
    'south',
    'smash',
    1.0,
    { x: 0, y: 0, z: -10.0 },
    { x: 0, y: 1.0, z: 4.0 }
  );

  // Directly hits North glass wall without having bounced on North court floor first!
  ball.position = { x: 0, y: 2.0, z: -9.9 };
  ball.velocity = { x: 0, y: 0, z: -25.0 };
  const step = stepBallPhysics(ball, 0.016);

  assert.equal(step.events.pointFault, true);
  assert.equal(step.events.faultWinner, 'north', 'Point awarded to opponent North when hitter hits wall directly');
  assert.equal(step.events.shortReason, 'Wall first');
});

test('Case (e) Ball hit out of the court entirely -> point against hitter', () => {
  let ball = createInitialBall('south', { x: 0, y: 1.0, z: 4.0 });
  ball = strikeBallWithRacket(
    ball,
    'south',
    'smash',
    1.0,
    { x: 15.0, y: 6.0, z: 0 },
    { x: 0, y: 1.0, z: 4.0 }
  );

  // Flies far out of court bounds
  ball.position = { x: 12.0, y: 2.0, z: 0 };
  ball.velocity = { x: 15.0, y: 0, z: 0 };
  const step = stepBallPhysics(ball, 0.016);

  assert.equal(step.events.pointFault, true);
  assert.equal(step.events.faultWinner, 'north', 'Point awarded to opponent North when hitter hits ball out');
  assert.equal(step.events.shortReason, 'Out');
});
