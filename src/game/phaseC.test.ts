import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraController } from './camera.js';
import { buildPadelAvatar } from './avatar.js';
import { DEFAULT_APPEARANCE } from './types.js';

test('CameraController: menu framing and slow orbit/sway', () => {
  const controller = new CameraController(16 / 9);
  controller.snapToMenuOrbit();

  // Test camera update in menu mode
  controller.update(0.016, true, { x: 0, y: 0, z: 0 }, { x: 1.71, y: 0.94, z: 4.15 });

  // Camera should be positioned back and angled gently, never jittery
  assert.ok(controller.camera.position.z > 6.0, 'Camera Z should sit back in menu');
  assert.ok(controller.camera.position.y > 1.2, 'Camera Y should provide slightly elevated vantage');
});

test('CameraController: startPlayPushIn triggers smooth push-in and callback', () => {
  const controller = new CameraController(16 / 9);
  controller.snapToMenuOrbit();

  let completed = false;
  controller.startPlayPushIn(() => {
    completed = true;
  });

  // Step camera forward 0.5s (push-in duration is ~0.45s)
  controller.update(0.25, true, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  assert.equal(completed, false, 'Should not complete halfway through push-in');

  controller.update(0.25, true, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  assert.equal(completed, true, 'Callback should fire upon push-in completion');
});

test('AvatarController: updateMenuIdle sets relaxed idle pose with side racket', () => {
  const avatar = buildPadelAvatar(DEFAULT_APPEARANCE, 'south', 7.2, 5, 'blue');

  // Initial call with bouncePhase at impact (0.0)
  avatar.updateMenuIdle(0.016, 1.0, 0.0, { x: 0.3, y: -0.2 });

  // Racket should be tilted face-upward for ball bounce
  assert.ok(avatar.racketGroup.rotation.x > 1.2, 'Racket should be angled face-upward');

  // Calling with mouse parallax tilts head
  avatar.updateMenuIdle(0.016, 1.05, 0.5, { x: 0.5, y: 0.2 });
  assert.ok(avatar.group.children.length > 0, 'Avatar group should contain rigged components');
});
