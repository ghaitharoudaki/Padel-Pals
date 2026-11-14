/** Size of the on-screen touch controls (joystick, HIT, LOB, JUMP). */
export type TouchControlSize = 'normal' | 'large' | 'xl';

export const TOUCH_CONTROL_SIZES: Array<{ id: TouchControlSize; label: string; scale: number }> = [
  { id: 'normal', label: 'Normal', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.3 },
  { id: 'xl', label: 'Extra Large', scale: 1.55 },
];

const STORAGE_KEY = 'padel_touch_control_size';

export function touchControlScale(size: TouchControlSize): number {
  return TOUCH_CONTROL_SIZES.find((s) => s.id === size)?.scale ?? 1;
}

/** Phones get bigger controls by default; tablets keep the normal size. */
export function defaultTouchControlSize(): TouchControlSize {
  if (typeof window === 'undefined') return 'normal';
  const shortestSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse && shortestSide < 600 ? 'large' : 'normal';
}

export function loadTouchControlSize(): TouchControlSize {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && TOUCH_CONTROL_SIZES.some((s) => s.id === saved)) return saved as TouchControlSize;
  } catch {}
  return defaultTouchControlSize();
}

export function saveTouchControlSize(size: TouchControlSize) {
  try {
    localStorage.setItem(STORAGE_KEY, size);
  } catch {}
}
