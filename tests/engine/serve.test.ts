import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeServe, RosterRefs } from '../../src/game/engine/serve';
import { createPlayerState } from '../../src/game/engine/player';
import { awardPoint, createInitialScoreState, getServeTargetBox } from '../../src/game/engine/rules';
import { DEFAULT_APPEARANCE, Side } from '../../src/game/types';

function makeRoster(): RosterRefs {
  const mk = (slot: 1 | 2 | 3 | 4, side: Side, zone: 'left' | 'right') =>
    createPlayerState({
      id: `p${slot}`,
      slot,
      name: `P${slot}`,
      side,
      team: side === 'south' ? 'blue' : 'red',
      zone,
      isBot: slot !== 1,
      position: { x: 0, y: 0, z: side === 'south' ? 7 : -7 },
      customization: DEFAULT_APPEARANCE,
    });
  return { p1: mk(1, 'south', 'left'), p2: mk(2, 'north', 'left'), p3: mk(3, 'south', 'right'), p4: mk(4, 'north', 'right') };
}

test('Serve: server stands diagonally opposite the target box at the baseline', () => {
  const roster = makeRoster();
  const score = createInitialScoreState('south');
  const ball = arrangeServe(roster, score, true);
  const targetRight = getServeTargetBox(score) === 'right';
  assert.ok(targetRight ? roster.p1.position.x < 0 : roster.p1.position.x > 0, 'server is on the diagonal');
  assert.ok(roster.p1.position.z > 7, 'server is behind the service line');
  assert.equal(roster.p1.isServing, true);
  assert.equal(roster.p2.isServing, false);
  assert.equal(ball.inPlay, false);
  assert.ok(Math.abs(ball.position.x - roster.p1.position.x) < 0.01, 'ball starts with the server');
});

test('Serve: doubles partners never overlap and lanes swap with the serve side', () => {
  const roster = makeRoster();
  let score = createInitialScoreState('south');
  for (let point = 0; point < 4; point++) {
    arrangeServe(roster, score, true);
    const { p1, p3 } = roster;
    assert.ok(Math.hypot(p1.position.x - p3.position.x, p1.position.z - p3.position.z) > 2, 'partners are apart');
    assert.equal(p1.zone === 'right', p1.position.x > 0, "server's lane matches where they stand");
    assert.notEqual(p1.zone, p3.zone, 'partners cover different lanes');
    score = awardPoint(score, 'south').nextState;
  }
});

test('Serve: receiver lines up behind the target box on the other side', () => {
  const roster = makeRoster();
  const score = createInitialScoreState('north');
  arrangeServe(roster, score, true);
  assert.equal(roster.p2.isServing, true);
  const targetX = getServeTargetBox(score) === 'right' ? 1 : -1;
  const receiver = [roster.p1, roster.p3].find((p) => Math.sign(p.position.x) === targetX);
  assert.ok(receiver, 'a south player covers the target box');
  assert.ok(receiver!.position.z > 7.5, 'receiver waits deep');
});
