import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraController } from '../../src/game/scene/camera';

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

test('CameraController supports mouse parallax and menu orbit', () => {
  const cameraController = new CameraController(16 / 9);
  assert.strictEqual(typeof cameraController.setMouseParallax, 'function');
  cameraController.setMouseParallax(0.5, -0.3);
  assert.strictEqual(cameraController.mouseParallax.x, 0.5);
  assert.strictEqual(cameraController.mouseParallax.y, -0.3);

  // Update in menu mode
  cameraController.update(0.016, true, { x: 0, y: 0, z: 0 });
  assert.ok(!isNaN(cameraController.camera.position.x));
  assert.ok(!isNaN(cameraController.camera.position.y));
  assert.ok(!isNaN(cameraController.camera.position.z));
});
