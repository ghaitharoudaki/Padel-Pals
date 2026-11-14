import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_FOV, fovForAspect } from '../../src/game/scene/camera';
import { AdaptiveResolution, getQualityOptions } from '../../src/game/scene/quality';

const horizontalFov = (vfovDeg: number, aspect: number) =>
  (2 * Math.atan(Math.tan((vfovDeg * Math.PI) / 360) * aspect) * 180) / Math.PI;

test('Camera FOV: unchanged on wide screens', () => {
  assert.equal(fovForAspect(16 / 9), BASE_FOV);
  assert.equal(fovForAspect(21 / 9), BASE_FOV);
});

test('Camera FOV: narrow screens keep the 16:9 horizontal view of the court', () => {
  const target = horizontalFov(BASE_FOV, 16 / 9);
  for (const aspect of [4 / 3, 1, 0.8]) {
    const fov = fovForAspect(aspect);
    assert.ok(fov > BASE_FOV, `wider vertical FOV for aspect ${aspect}`);
    assert.ok(Math.abs(horizontalFov(fov, aspect) - target) < 0.5, `horizontal FOV preserved at ${aspect}`);
  }
  // Very tall phones are capped to avoid a fisheye look.
  assert.ok(fovForAspect(0.4) <= 100);
});

test('Quality: phones start below their native pixel ratio, desktops stay sharp', () => {
  const phone = getQualityOptions({ isMobile: true, isTouch: true, devicePixelRatio: 3 }, false);
  assert.equal(phone.initialPixelRatio, 1.5);
  assert.equal(phone.maxPixelRatio, 2);
  const desktop = getQualityOptions({ isMobile: false, isTouch: false, devicePixelRatio: 2 }, false);
  assert.equal(desktop.initialPixelRatio, 2);
  const software = getQualityOptions({ isMobile: false, isTouch: false, devicePixelRatio: 2 }, true);
  assert.equal(software.initialPixelRatio, 1);
});

test('Quality: drops resolution when slow and recovers when there is headroom', () => {
  const adaptive = new AdaptiveResolution({ maxPixelRatio: 2, minPixelRatio: 1, initialPixelRatio: 1.5 });
  let changed: number | null = null;
  for (let i = 0; i < 70 && changed === null; i++) changed = adaptive.sample(1 / 30); // 30 fps
  assert.equal(changed, 1.25, 'steps down after a slow window');

  // Never drops below the minimum.
  for (let i = 0; i < 2000; i++) adaptive.sample(1 / 20);
  assert.equal(adaptive.pixelRatio, 1);

  // Sustained 60 fps raises it again, one step at a time.
  let raised: number | null = null;
  for (let i = 0; i < 60 * 30 && raised === null; i++) raised = adaptive.sample(1 / 60);
  assert.equal(raised, 1.25);
});

test('Quality: ignores huge frame gaps from tab switches', () => {
  const adaptive = new AdaptiveResolution({ maxPixelRatio: 2, minPixelRatio: 1, initialPixelRatio: 1.5 });
  assert.equal(adaptive.sample(5), null);
  assert.equal(adaptive.pixelRatio, 1.5);
});
