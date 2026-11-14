import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOUCH_CONTROL_SIZES,
  defaultTouchControlSize,
  loadTouchControlSize,
  touchControlScale,
} from '../../src/components/touchControlSize';

test('Touch controls: sizes grow from Normal to Extra Large', () => {
  assert.deepEqual(
    TOUCH_CONTROL_SIZES.map((s) => s.id),
    ['normal', 'large', 'xl']
  );
  assert.equal(touchControlScale('normal'), 1);
  assert.ok(touchControlScale('large') > 1);
  assert.ok(touchControlScale('xl') > touchControlScale('large'));
});

test('Touch controls: safe defaults without a browser or saved preference', () => {
  assert.equal(defaultTouchControlSize(), 'normal');
  assert.equal(loadTouchControlSize(), 'normal');
});
