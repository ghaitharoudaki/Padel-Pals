import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InputManager, AIM_ZONES } from '../../src/game/engine/input';
import { AimTargetZone } from '../../src/game/types';

test('Easy Aiming: defines 6 target zones on the opponent court', () => {
  const zones: AimTargetZone[] = [
    'left_short',
    'center_short',
    'right_short',
    'left_deep',
    'center_deep',
    'right_deep',
  ];

  zones.forEach((z) => {
    const target = AIM_ZONES[z];
    assert.ok(target !== undefined, `Target for ${z} must be defined`);
    assert.ok(target.z < 0, `Target z (${target.z}) must be on North opponent half`);
    assert.ok(Math.abs(target.x) <= 4.5, `Target x (${target.x}) must be inside 10m court width`);
  });
});

test('Easy Aiming: maps neutral directional input to default center-deep target zone', () => {
  const fakeCamera = new THREE.PerspectiveCamera();
  const input = new InputManager({
    camera: fakeCamera,
    onSwing: () => {},
    onChargeChange: () => {},
    onAimChange: () => {},
    onToggleDebug: () => {},
    onJumpRequest: () => {},
  });
  input.setEnabled(true);

  assert.strictEqual(input.getTargetZone(), 'center_deep');
  const aim = input.getAim();
  assert.ok(Math.abs(aim.z - AIM_ZONES['center_deep'].z) < 0.2);
  assert.ok(Math.abs(aim.x) < 0.2);
  input.dispose();
});

test('Easy Aiming: updates target zone based on virtual joystick input', () => {
  const fakeCamera = new THREE.PerspectiveCamera();
  const input = new InputManager({
    camera: fakeCamera,
    onSwing: () => {},
    onChargeChange: () => {},
    onAimChange: () => {},
    onToggleDebug: () => {},
    onJumpRequest: () => {},
  });
  input.setEnabled(true);

  // Push stick left and forward (S in court coords = back/short)
  input.setVirtualStick(-0.8, 0.8);
  assert.strictEqual(input.getTargetZone(), 'left_short');

  // Push stick right and neutral depth
  input.setVirtualStick(0.8, 0.0);
  assert.strictEqual(input.getTargetZone(), 'right_deep');

  // Reset stick to neutral
  input.setVirtualStick(0, 0);
  assert.strictEqual(input.getTargetZone(), 'center_deep');

  input.dispose();
});

test('Easy Aiming: supports touch charge, release, and instant lob', () => {
  const fakeCamera = new THREE.PerspectiveCamera();
  let swingCount = 0;
  let lastShot = '';
  const input = new InputManager({
    camera: fakeCamera,
    onSwing: (intent) => {
      swingCount++;
      lastShot = intent.shot;
    },
    onChargeChange: () => {},
    onAimChange: () => {},
    onToggleDebug: () => {},
    onJumpRequest: () => {},
  });
  input.setEnabled(true);

  input.startTouchCharge();
  assert.strictEqual(input.getIsCharging(), true);

  input.releaseTouchCharge();
  assert.strictEqual(input.getIsCharging(), false);
  assert.strictEqual(swingCount, 1);

  input.triggerTouchLob();
  assert.strictEqual(swingCount, 2);
  assert.strictEqual(lastShot, 'lob');

  input.dispose();
});
