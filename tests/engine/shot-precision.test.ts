import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBall, predictBallLanding, strikeBallWithRacket } from '../../src/game/engine/physics';
import { updateBotAI } from '../../src/game/engine/bot';
import { AIM_ZONES } from '../../src/game/engine/input';
import { createPlayerState } from '../../src/game/engine/player';
import { BallState, DEFAULT_APPEARANCE } from '../../src/game/types';

test('Precision Trajectory: strikes land within 0.15m of targetAim across key zones', () => {
  const zones: Array<keyof typeof AIM_ZONES> = [
    'center_deep',
    'left_deep',
    'right_deep',
    'left_short',
    'center_short',
    'right_short',
  ];

  for (const zone of zones) {
    const targetAim = AIM_ZONES[zone];
    const initialBall = createInitialBall('south');
    initialBall.position = { x: -2.0, y: 1.0, z: 6.5 }; // Player striking from south court

    const struck = strikeBallWithRacket(
      initialBall,
      'south',
      'flat',
      0.75,
      targetAim,
      { x: -2.0, y: 0, z: 6.5 }
    );

    const predicted = predictBallLanding(struck);
    const errorDist = Math.hypot(predicted.x - targetAim.x, predicted.z - targetAim.z);

    assert.ok(
      errorDist <= 0.15,
      `Zone ${zone} target (${targetAim.x}, ${targetAim.z}) vs predicted (${predicted.x.toFixed(2)}, ${predicted.z.toFixed(2)}): error ${errorDist.toFixed(3)}m exceeds 0.15m`
    );
  }
});

test('Precision Trajectory: lob and drop shots land precisely on their designated targets', () => {
  const deepTarget = AIM_ZONES['center_deep'];
  const shortTarget = AIM_ZONES['center_short'];
  const ball = createInitialBall('south');
  ball.position = { x: -1.5, y: 1.1, z: 7.0 };

  // 1. Lob shot
  const lobStruck = strikeBallWithRacket(ball, 'south', 'lob', 0.8, deepTarget, { x: -1.5, y: 0, z: 7.0 });
  const lobPred = predictBallLanding(lobStruck);
  const lobErr = Math.hypot(lobPred.x - deepTarget.x, lobPred.z - deepTarget.z);
  assert.ok(lobErr <= 0.15, `Lob error ${lobErr.toFixed(3)}m exceeds 0.15m`);

  // 2. Drop shot
  const dropStruck = strikeBallWithRacket(ball, 'south', 'drop', 0.6, shortTarget, { x: -1.5, y: 0, z: 7.0 });
  const dropPred = predictBallLanding(dropStruck);
  const dropErr = Math.hypot(dropPred.x - shortTarget.x, dropPred.z - shortTarget.z);
  assert.ok(dropErr <= 0.15, `Drop error ${dropErr.toFixed(3)}m exceeds 0.15m`);
});

test('2v2 Bot Spacing: Bot partner never interferes with ball heading to human player', () => {
  // P1 Human (South Left, X = -2.2, Z = 6.8)
  const humanP1 = createPlayerState({
    id: 'p1',
    name: 'Ghaith',
    team: 'blue',
    side: 'south',
    slot: 1,
    isBot: false,
    position: { x: -2.2, y: 0, z: 6.8 },
    zone: 'left',
    customization: { ...DEFAULT_APPEARANCE, name: 'Ghaith' },
  });

  // P3 Carlos Bot (South Right, X = 2.2, Z = 6.8)
  const botCarlos = createPlayerState({
    id: 'p3',
    name: 'Carlos',
    team: 'blue',
    side: 'south',
    slot: 3,
    isBot: true,
    position: { x: 2.2, y: 0, z: 6.8 },
    zone: 'right',
    customization: { ...DEFAULT_APPEARANCE, name: 'Carlos' },
  });

  // P2 Alejandro Bot (North Opponent)
  const opponentP2 = createPlayerState({
    id: 'p2',
    name: 'Alejandro',
    team: 'red',
    side: 'north',
    slot: 2,
    isBot: true,
    position: { x: 2.2, y: 0, z: -6.8 },
    zone: 'right',
    customization: { ...DEFAULT_APPEARANCE, name: 'Alejandro' },
  });

  // Ball hit by North towards Human player's half (X = -2.0, Z moving towards +6.5)
  const incomingBall: BallState = {
    ...createInitialBall('north'),
    position: { x: -2.0, y: 1.5, z: 1.0 },
    velocity: { x: -0.2, y: 3.5, z: 8.5 },
    lastHitter: 'north',
    inPlay: true,
  };

  const decision = updateBotAI(botCarlos, incomingBall, opponentP2, 'pro', 0.016, true, humanP1);

  // Assertions:
  // 1. Carlos yields to player and does not swing
  assert.equal(decision.wantsToSwing, false, 'Carlos should not swing at a ball coming towards human teammate');
  assert.equal(decision.stateDescription, 'Yielding to Player', 'Carlos should enter Yielding to Player state');

  // 2. Carlos target position strictly stays in his right lane (X >= 0.2)
  assert.ok(
    decision.targetPosition.x >= 0.2,
    `Carlos target X (${decision.targetPosition.x}) crossed into human lane (expected X >= 0.2)`
  );
  assert.ok(
    decision.targetPosition.x <= 4.4,
    `Carlos target X (${decision.targetPosition.x}) exceeded court boundaries`
  );
});

test('Aim Assist: guarantees standard shots clear the net with High aim assist', () => {
  const ball = createInitialBall('south');
  ball.position = { x: 0, y: 0.8, z: 6.5 }; // South baseline
  const playerPos = { x: 0, y: 0, z: 6.5 };
  const targetAim = AIM_ZONES['center_deep']; // North deep

  const struck = strikeBallWithRacket(
    ball,
    'south',
    'flat',
    0.75,
    targetAim,
    playerPos,
    undefined,
    'GOOD',
    'high'
  );

  // Ball should be travelling forward into North court (vz < 0)
  assert.ok(struck.velocity.z < -5, 'Ball should travel toward opponent court');
  // Vertical velocity vy should be sufficient to clear net (net is at z=0, 0.88m high)
  assert.ok(struck.velocity.y > 0.5, 'Vertical velocity should ensure net clearance');
  assert.strictEqual(struck.inPlay, true);
});

test('Aim Assist: keeps shot speeds clamped so balls do not fly out of court unintentionally', () => {
  const ball = createInitialBall('south');
  ball.position = { x: -2.0, y: 0.5, z: 5.0 };
  const playerPos = { x: -2.0, y: 0, z: 5.0 };
  const targetAim = AIM_ZONES['right_short'];

  const struck = strikeBallWithRacket(
    ball,
    'south',
    'flat',
    1.0, // max power
    targetAim,
    playerPos,
    undefined,
    'PERFECT',
    'high'
  );

  // Speed clamped safely for short court placement
  const horizSpeed = Math.hypot(struck.velocity.x, struck.velocity.z);
  assert.ok(horizSpeed <= 28, `Expected horizSpeed <= 28, got ${horizSpeed}`);
});
