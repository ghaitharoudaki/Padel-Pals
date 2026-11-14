import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InputManager, SwingIntent } from '../../src/game/engine/input';
import {
  DEFAULT_BINDINGS,
  assignKey,
  clearKey,
  cloneBindings,
  formatKey,
  sanitizeBindings,
  unboundActions,
} from '../../src/game/engine/controls';
import { evaluateContactTiming, REACH } from '../../src/game/engine/physics';

function makeInput() {
  const swings: SwingIntent[] = [];
  let jumps = 0;
  const im = new InputManager({
    camera: new THREE.PerspectiveCamera(),
    onSwing: (i) => swings.push(i),
    onChargeChange: () => {},
    onAimChange: () => {},
    onToggleDebug: () => {},
    onJumpRequest: () => jumps++,
  });
  im.setEnabled(true);
  const key = (type: 'down' | 'up', code: string, repeat = false) => {
    const e = { code, key: code, repeat, target: null, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} };
    (im as any)[type === 'down' ? 'handleKeyDown' : 'handleKeyUp'](e);
  };
  return { im, swings, key, jumps: () => jumps };
}

test('Lob is a single dedicated key: press + release L plays a lob (no Q + Space combo)', () => {
  const { swings, key } = makeInput();
  key('down', 'KeyL');
  key('up', 'KeyL');
  assert.equal(swings.length, 1);
  assert.equal(swings[0].shot, 'lob');
});

test('Q still works as the alternate lob key on its own', () => {
  const { swings, key } = makeInput();
  key('down', 'KeyQ');
  key('up', 'KeyQ');
  assert.equal(swings.length, 1);
  assert.equal(swings[0].shot, 'lob');
});

test('Each shot button forces its own shot; the drive button stays context-sensitive', () => {
  const { swings, key } = makeInput();
  for (const [code, shot] of [
    ['KeyK', 'slice'],
    ['KeyF', 'drop'],
    ['KeyU', 'smash'],
    ['Space', 'flat'],
  ] as const) {
    key('down', code);
    key('up', code);
    assert.equal(swings[swings.length - 1].shot, shot, `${code} -> ${shot}`);
  }
});

test('Switching shot button mid-charge changes the shot and releases once', () => {
  const { swings, key } = makeInput();
  key('down', 'Space');
  key('down', 'KeyL'); // change to lob while charging
  key('up', 'Space'); // releasing the old button does nothing
  assert.equal(swings.length, 0);
  key('up', 'KeyL');
  assert.equal(swings.length, 1);
  assert.equal(swings[0].shot, 'lob');
});

test('Movement and aim follow rebound keys', () => {
  const { im, key } = makeInput();
  im.setBindings(assignKey(cloneBindings(DEFAULT_BINDINGS), 'moveLeft', 0, 'KeyH'));
  key('down', 'KeyH');
  assert.equal(im.getMovementInput().x, -1);
  assert.equal(im.getTargetZone(), 'left_deep');
  key('up', 'KeyH');
  assert.equal(im.getMovementInput().x, 0);
});

test('Jump key requests a jump; sprint key sets sprint', () => {
  const { im, key, jumps } = makeInput();
  key('down', 'KeyE');
  assert.equal(jumps(), 1);
  key('down', 'ShiftLeft');
  assert.equal(im.getMovementInput().sprint, true);
});

test('Assigning a key removes it from its previous action', () => {
  const next = assignKey(DEFAULT_BINDINGS, 'lob', 0, 'Space');
  assert.equal(next.lob[0], 'Space');
  assert.ok(!next.shot.includes('Space'));
  assert.deepEqual(unboundActions(clearKey(clearKey(next, 'shot', 0), 'shot', 0)), ['shot']);
});

test('Stored bindings are sanitised (bad values, reserved keys, duplicates)', () => {
  const b = sanitizeBindings({ lob: ['KeyL', 'KeyL', 'Escape', 42], shot: 'nope', unknown: ['KeyZ'] });
  assert.deepEqual(b.lob, ['KeyL']);
  assert.deepEqual(b.shot, DEFAULT_BINDINGS.shot);
  assert.equal(formatKey('KeyL'), 'L');
  assert.equal(formatKey('ArrowUp'), '↑');
});

test('Hitbox: ball behind the player or beyond arm + racket reach is out of reach', () => {
  const player = { x: 0, y: 0, z: 6 };
  // 1.0 m behind a south player (facing -Z): can't swing at it.
  assert.equal(evaluateContactTiming(player, { x: 0.3, y: 1.0, z: 7.0 }, 'south').quality, 'OUT_OF_REACH');
  // 1.9 m to the side: further than a lunge with arm + racket.
  assert.equal(evaluateContactTiming(player, { x: 1.9, y: 1.0, z: 6 }, 'south').quality, 'OUT_OF_REACH');
  // Same ball for the north player (facing +Z) is in front of them, so reachable.
  assert.notEqual(evaluateContactTiming({ x: 0, y: 0, z: 6 }, { x: 0.3, y: 1.0, z: 7.0 }, 'north').quality, 'OUT_OF_REACH');
});

test('Hitbox: overhead reach is limited standing and extended by a jump', () => {
  const high = { x: 0.3, y: REACH.maxStandingHeight + 0.3, z: 5.8 };
  assert.equal(evaluateContactTiming({ x: 0, y: 0, z: 6 }, high, 'south').quality, 'OUT_OF_REACH');
  assert.notEqual(evaluateContactTiming({ x: 0, y: 0.6, z: 6 }, high, 'south').quality, 'OUT_OF_REACH');
});

test('Hitbox: full-stretch and jammed contacts are weaker than the sweet spot', () => {
  const player = { x: 0, y: 0, z: 6 };
  const sweet = evaluateContactTiming(player, { x: 0.8, y: 1.0, z: 5.9 }, 'south');
  const stretch = evaluateContactTiming(player, { x: 1.5, y: 1.0, z: 6 }, 'south');
  const jammed = evaluateContactTiming(player, { x: 0.1, y: 1.0, z: 6 }, 'south');
  assert.equal(sweet.quality, 'PERFECT');
  assert.ok(stretch.powerMultiplier < sweet.powerMultiplier);
  assert.ok(jammed.powerMultiplier < sweet.powerMultiplier);
  assert.notEqual(stretch.quality, 'OUT_OF_REACH');
});
