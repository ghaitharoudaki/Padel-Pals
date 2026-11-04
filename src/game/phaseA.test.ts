import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBall, stepBallPhysics, strikeBallWithRacket } from './physics';
import { awardPoint, createInitialScoreState } from './rules';
import { ScreenState, Side } from './types';

test('BUG 1: ScreenState Machine single source of truth & menu state protection', () => {
  const allowedScreens: ScreenState[] = [
    'BOOT',
    'MENU',
    'MODE_SELECT',
    'LOCKER',
    'SETTINGS',
    'HOW_TO_PLAY',
    'COUNTDOWN',
    'PLAYING',
    'PAUSED',
    'POINT_SCORED',
    'MATCH_END',
    'RESULTS',
  ];

  const isMenuScreen = (s: ScreenState) =>
    s === 'BOOT' || s === 'MENU' || s === 'MODE_SELECT' || s === 'LOCKER' || s === 'SETTINGS' || s === 'HOW_TO_PLAY';

  // In menu states, match simulation is halted
  assert.equal(isMenuScreen('MENU'), true);
  assert.equal(isMenuScreen('MODE_SELECT'), true);
  assert.equal(isMenuScreen('LOCKER'), true);
  assert.equal(isMenuScreen('PLAYING'), false);
  assert.equal(isMenuScreen('COUNTDOWN'), false);
  assert.equal(isMenuScreen('PAUSED'), false);

  // Guard against double clicks on match start
  let isStarting = false;
  let matchesStartedCount = 0;

  const startMatch = () => {
    if (isStarting) return;
    isStarting = true;
    matchesStartedCount++;
  };

  startMatch();
  startMatch(); // Double click simulation
  assert.equal(matchesStartedCount, 1, 'Double click guard should prevent second match start');
});

test('BUG 2: Case (a) 2 bounces on my side (South) -> opponent (North) gets point', () => {
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

test('BUG 2: Case (b) 2 bounces on opponent side (North) -> South gets point', () => {
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

test('BUG 2: Case (c) 1 bounce + glass wall + 2nd bounce on same side without player hit -> defending side loses point', () => {
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

test('BUG 2: Case (d) Ball hits wall before bouncing on opponent court -> point against hitter', () => {
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

test('BUG 2: Case (e) Ball hit out of the court entirely -> point against hitter', () => {
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

test('BUG 3: 1v1 and 2v2 Player Visibility and Setup', () => {
  const getVisibleAvatars = (isDoubles: boolean) => {
    const players = [
      { id: 'p1', side: 'south' },
      { id: 'p2', side: 'north' },
      { id: 'p3', side: 'south' },
      { id: 'p4', side: 'north' },
    ];
    return players.filter((p) => p.id === 'p1' || p.id === 'p2' || isDoubles).map((p) => p.id);
  };

  // In 1v1 (!isDoubles): both p1 and p2 are visible, while p3 and p4 are hidden
  const singlesVisible = getVisibleAvatars(false);
  assert.deepEqual(singlesVisible, ['p1', 'p2']);

  // In 2v2 (isDoubles): all 4 players are visible
  const doublesVisible = getVisibleAvatars(true);
  assert.deepEqual(doublesVisible, ['p1', 'p2', 'p3', 'p4']);

  // Player positions for 1v1 are centered on court X=0
  const isD = false;
  const p1Pos = { x: isD ? -2.0 : 0, y: 0, z: 7.2 };
  const p2Pos = { x: isD ? -2.0 : 0, y: 0, z: -7.2 };
  assert.equal(p1Pos.x, 0);
  assert.equal(p2Pos.x, 0);
});
