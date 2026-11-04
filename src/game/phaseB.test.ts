import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCrowdSystem } from './crowd';
import { InputManager, AIM_ZONES } from './input';
import { createInitialBall, strikeBallWithRacket } from './physics';
import { AimTargetZone } from './types';

test('Crowd System: instantiates 300+ fans across padel court stands', () => {
  const crowd = createCrowdSystem();
  const fanCount = crowd.getFanCount();
  assert.ok(fanCount >= 300, `Expected at least 300 fans, got ${fanCount}`);
  assert.ok(crowd.group instanceof THREE.Group);
  assert.ok(crowd.group.children.length > 0);
  crowd.dispose();
});

test('Crowd System: proves root cause fix: InstancedMesh materials have vertexColors: false so instanceColor displays brightly', () => {
  const crowd = createCrowdSystem();
  let checkedMeshes = 0;
  crowd.group.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      checkedMeshes++;
      const mat = obj.material as THREE.Material & { vertexColors?: boolean };
      // Root cause was vertexColors: true on geometry without color attribute causing black multiplication
      assert.strictEqual(Boolean(mat.vertexColors), false, 'vertexColors must be false so instanceColor works');
      assert.ok(obj.instanceColor !== null, 'instanceColor must be allocated');
      assert.ok((obj.instanceColor?.count || 0) > 0, 'instanceColor count must be > 0');
    }
  });

  assert.ok(checkedMeshes >= 4, `Expected at least 4 instanced meshes, found ${checkedMeshes}`);
  crowd.dispose();
});

test('Crowd System: updates crowd animation and supports reactions without error', () => {
  const crowd = createCrowdSystem();
  assert.doesNotThrow(() => crowd.update(0.1, 0.016));
  assert.doesNotThrow(() => crowd.triggerReaction('cheer', 1.5));
  assert.doesNotThrow(() => crowd.triggerReaction('miss', 2.0));
  assert.doesNotThrow(() => crowd.triggerReaction('smash', 1.0));
  assert.doesNotThrow(() => crowd.dispose());
});

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
