import test from 'node:test';
import assert from 'node:assert/strict';
import { getServeTargetBox } from '../../src/game/engine/rules';
import { BALL_RADIUS, createInitialBall, evaluateContactTiming, executePadelServe, GRAVITY, MAX_BALL_SPEED, predictBallLanding, stepBallPhysics, strikeBallWithRacket, evaluateContactQuality } from '../../src/game/engine/physics';
import { isBajadaWindow } from '../../src/game/engine/ball';
import { COURT_CONFIG } from '../../src/game/types';

test('Court regulation dimensions match real padel specs', () => {
  assert.equal(COURT_CONFIG.length, 20, 'Court length must be 20 meters');
  assert.equal(COURT_CONFIG.width, 10, 'Court width must be 10 meters');
  assert.equal(COURT_CONFIG.netHeight, 0.88, 'Net height at center must be 0.88 meters');
  assert.equal(COURT_CONFIG.netPostHeight, 0.92, 'Net height at posts must be 0.92 meters');
  assert.equal(COURT_CONFIG.glassBackWallHeight, 4.0, 'Glass back walls must be 4 meters high');
  assert.equal(COURT_CONFIG.serviceLineZ, 6.95, 'Service line must be 6.95 meters from net');
});

// ==========================================
// 2. BALL PHYSICS & CONTINUOUS COLLISION DETECTION (CCD)
// ==========================================

test('Gravity is -9.81 m/s² and ball accelerates downward predictably', () => {
  assert.equal(GRAVITY, 9.81);
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.position = { x: 0, y: 3.0, z: 0 };
  ball.velocity = { x: 0, y: 0, z: 0 };

  const res = stepBallPhysics(ball, 1 / 60);
  assert.ok(res.ball.velocity.y < 0, 'Velocity Y should be negative downward');
  assert.ok(res.ball.position.y < 3.0, 'Position Y should have dropped');
});

test('Swept-sphere CCD prevents tunneling through back glass at MAX SPEED 35 m/s', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  // Starting at Z = 9.5m, moving at MAX_SPEED (35 m/s) directly into back wall at Z = 10m
  ball.position = { x: 0, y: 1.5, z: 9.5 };
  ball.velocity = { x: 0, y: 0, z: MAX_BALL_SPEED };
  // Mark as already bounced once so hitting glass is legal wall play
  ball.bounceCount = 1;

  // Single step at 60 Hz would move 35/60 = 0.583m (tunneling past 10m if naive)
  const res = stepBallPhysics(ball, 1 / 60);

  assert.equal(res.events.bouncedGlassWall, true, 'Must detect back glass collision');
  assert.ok(
    res.ball.position.z <= COURT_CONFIG.length / 2 - BALL_RADIUS + 0.001,
    'Ball must NOT tunnel through back glass wall'
  );
  assert.ok(res.ball.velocity.z < 0, 'Ball velocity must reflect backwards (negative Z)');
});

test('Swept-sphere CCD prevents tunneling through floor at MAX downward velocity', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  // Ball at y = 0.25m plummeting downward at 28 m/s
  ball.position = { x: 0, y: 0.25, z: 4.0 };
  ball.velocity = { x: 0, y: -28.0, z: 0 };

  const res = stepBallPhysics(ball, 1 / 60);

  assert.equal(res.events.bouncedFloor, true, 'Must detect floor collision');
  assert.ok(res.ball.position.y >= BALL_RADIUS, 'Ball must NOT tunnel below floor');
  assert.ok(res.ball.velocity.y > 0, 'Ball must rebound upward');
});

test('Swept-sphere CCD detects center net collision and tape rollover', () => {
  // Case A: Hard drive into net tape -> rolls over
  const ballTape = createInitialBall('south');
  ballTape.inPlay = true;
  ballTape.position = { x: 0, y: 0.87, z: 0.08 };
  ballTape.velocity = { x: 0, y: 0.1, z: -12.0 };

  const resTape = stepBallPhysics(ballTape, 1 / 60);
  assert.equal(resTape.events.hitNet, true, 'Must detect net hit');
  assert.equal(resTape.events.netTapeHit, true, 'Must detect net tape hit');
  assert.equal(resTape.events.netTapeRolledOver, true, 'Ball should roll over net tape');

  // Case B: Low smash into lower net mesh -> net catch fault
  const ballLow = createInitialBall('south');
  ballLow.inPlay = true;
  ballLow.position = { x: 0, y: 0.45, z: 0.08 };
  ballLow.velocity = { x: 0, y: -0.2, z: -15.0 };

  const resLow = stepBallPhysics(ballLow, 1 / 60);
  assert.equal(resLow.events.hitNet, true, 'Must detect net collision');
  assert.equal(resLow.events.pointFault, true, 'Low net hit is a point fault');
});

// ==========================================
// 3. WALL PLAY & PADEL RULES (GLASS VS FENCE)
// ==========================================

test('Ball hitting glass AFTER floor bounce remains legally in play', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.bounceCount = 1; // already bounced on opponent's turf
  ball.position = { x: 0, y: 1.0, z: -9.80 };
  ball.velocity = { x: 0, y: 0, z: -15.0 };

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.events.bouncedGlassWall, true);
  assert.equal(res.events.pointFault, false, 'Wall hit after floor bounce MUST NOT be a fault');
  assert.equal(res.ball.hitWallBeforeFloor, false);
});

test('Ball hitting wall BEFORE bouncing on opponent floor is a FAULT against hitter', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.bounceCount = 0; // directly through air without floor bounce
  ball.position = { x: 0, y: 1.5, z: -9.80 };
  ball.velocity = { x: 0, y: 0, z: -15.0 };

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.events.bouncedGlassWall, true);
  assert.equal(res.events.pointFault, true, 'Direct wall hit before floor bounce is a fault');
  assert.equal(res.ball.hitWallBeforeFloor, true);
});

test('Fence bounce emits mesh wall event and is deader than glass', () => {
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.bounceCount = 1;
  // Side fence is in the middle section (|Z| < 6m)
  ball.position = { x: 4.8, y: 1.2, z: 2.0 };
  ball.velocity = { x: 10.0, y: 0, z: 0 };

  const res = stepBallPhysics(ball, 1 / 60);
  assert.equal(res.events.bouncedMeshWall, true, 'Must emit bouncedMeshWall event');
  assert.equal(res.ball.lastWallType, 'fence');
  // Wire mesh restitution is ~0.60
  assert.ok(Math.abs(res.ball.velocity.x) <= 6.5, 'Fence bounce should be deader than glass');
});

test('Bajada window correctly identifies glass wall rebound opportunity', () => {
  const player = { x: 0, y: 0, z: 7.2 };
  const ball = createInitialBall('south');
  ball.inPlay = true;
  ball.wallHitCount = 1;
  ball.lastWallType = 'glass';
  ball.position = { x: 0.3, y: 1.4, z: 6.5 }; // in front of player
  ball.velocity = { x: 0, y: -0.4, z: -4.0 }; // moving forward towards net

  assert.equal(isBajadaWindow(ball, player, 'south'), true, 'Should detect valid bajada window');
});

// ==========================================
// 4. SERVE RULES & ALTERNATION
// ==========================================

test('Serve executes legal underhand hit directed diagonally into receiver box', () => {
  const ball = createInitialBall('south');
  const targetBox = getServeTargetBox(0); // Point 0 -> right box
  assert.equal(targetBox, 'right');

  const served = executePadelServe(ball, 'south', targetBox, 0.65);
  assert.equal(served.isServe, true);
  assert.equal(served.serveBoxTarget, 'right');
  assert.ok(served.velocity.z < 0, 'Serve from south must travel towards north');
});

test('Timing quality differentiates PERFECT sweetspot, EARLY pulled, and LATE reach', () => {
  const player = { x: 0, y: 0, z: 6.0 };

  // 1. Sweetspot: waist height, ~1.0m horizontal, in front of player
  const perfectBall = { x: 0.9, y: 1.1, z: 5.8 };
  const tPerfect = evaluateContactTiming(player, perfectBall, 'south');
  assert.equal(tPerfect.quality, 'PERFECT');
  assert.ok(tPerfect.powerMultiplier > 1.1);

  // 2. Early: ball struck far ahead of player plane
  const earlyBall = { x: 0.9, y: 1.1, z: 5.2 };
  const tEarly = evaluateContactTiming(player, earlyBall, 'south');
  assert.equal(tEarly.quality, 'EARLY');

  // 3. Late: ball struck behind player
  const lateBall = { x: 0.9, y: 1.1, z: 6.3 };
  const tLate = evaluateContactTiming(player, lateBall, 'south');
  assert.equal(tLate.quality, 'LATE');
  assert.ok(tLate.powerMultiplier < 1.0);
});

// ==========================================
// 6. SCORING: GAMES, GOLDEN POINT, SET & TIEBREAK
// ==========================================

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
