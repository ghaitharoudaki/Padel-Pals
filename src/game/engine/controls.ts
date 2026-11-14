import { ShotType } from '../types';

/**
 * Rebindable keyboard controls.
 *
 * The default layout follows the classic arcade-tennis scheme (Virtua Tennis / Top Spin):
 * one dedicated button per shot, hold to charge, release to swing, and the movement
 * direction held at contact picks the target. Every shot works on its own key, so a lob is
 * a single press instead of a modifier + hit combo.
 *
 * Bindings use `KeyboardEvent.code` so they follow the physical key position on any layout.
 */
export type ControlAction =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'shot'
  | 'slice'
  | 'lob'
  | 'drop'
  | 'smash'
  | 'jump';

export type KeyBindings = Record<ControlAction, string[]>;

/** Each action can hold a primary and a secondary key. */
export const MAX_KEYS_PER_ACTION = 2;

export const CONTROL_ACTIONS: { id: ControlAction; label: string; hint: string; group: 'move' | 'shots' }[] = [
  { id: 'moveUp', label: 'Move up / aim deep', hint: 'Towards the net', group: 'move' },
  { id: 'moveDown', label: 'Move down / aim short', hint: 'Towards your back glass', group: 'move' },
  { id: 'moveLeft', label: 'Move left / aim left', hint: '', group: 'move' },
  { id: 'moveRight', label: 'Move right / aim right', hint: '', group: 'move' },
  { id: 'sprint', label: 'Sprint', hint: 'Hold while moving', group: 'move' },
  { id: 'jump', label: 'Jump', hint: 'Reach high balls', group: 'move' },
  { id: 'shot', label: 'Drive (topspin)', hint: 'Hold to charge, release to hit. Also serves', group: 'shots' },
  { id: 'slice', label: 'Slice', hint: 'Low, skidding backspin shot', group: 'shots' },
  { id: 'lob', label: 'Lob', hint: 'High arc over the net players', group: 'shots' },
  { id: 'drop', label: 'Drop shot', hint: 'Soft shot that dies near the net', group: 'shots' },
  { id: 'smash', label: 'Smash', hint: 'Overhead kill on a high ball', group: 'shots' },
];

export const DEFAULT_BINDINGS: KeyBindings = {
  moveUp: ['KeyW', 'ArrowUp'],
  moveDown: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['KeyE'],
  shot: ['Space', 'KeyJ'],
  slice: ['KeyK'],
  lob: ['KeyL', 'KeyQ'],
  drop: ['KeyF', 'KeyI'],
  smash: ['KeyU'],
};

/** Shot each shot button forces. `undefined` = context-sensitive drive (smash/bajada/topspin/flat). */
export const SHOT_FOR_ACTION: Partial<Record<ControlAction, ShotType | undefined>> = {
  shot: undefined,
  slice: 'slice',
  lob: 'lob',
  drop: 'drop',
  smash: 'smash',
};

export const SHOT_ACTIONS: ControlAction[] = ['shot', 'slice', 'lob', 'drop', 'smash'];

/** Keys the game reserves (pause / debug) that cannot be bound. */
export const RESERVED_CODES = new Set(['Escape', 'KeyP', 'F3', 'F4', 'Tab', 'MetaLeft', 'MetaRight']);

export const STORAGE_KEY = 'padel_pals_key_bindings';

export function cloneBindings(b: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  (Object.keys(DEFAULT_BINDINGS) as ControlAction[]).forEach((a) => {
    out[a] = [...(b[a] || [])];
  });
  return out;
}

/** Merge stored data over the defaults, dropping anything malformed. */
export function sanitizeBindings(raw: unknown): KeyBindings {
  const out = cloneBindings(DEFAULT_BINDINGS);
  if (!raw || typeof raw !== 'object') return out;
  const data = raw as Record<string, unknown>;
  (Object.keys(DEFAULT_BINDINGS) as ControlAction[]).forEach((action) => {
    const v = data[action];
    if (Array.isArray(v)) {
      const codes = v
        .filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length < 32 && !RESERVED_CODES.has(c))
        .slice(0, MAX_KEYS_PER_ACTION);
      out[action] = Array.from(new Set(codes));
    }
  });
  return out;
}

/**
 * Bind `code` to `action` in `slot` (0 = primary, 1 = secondary).
 * The key is removed from any other action first so a key never does two things.
 */
export function assignKey(bindings: KeyBindings, action: ControlAction, slot: number, code: string): KeyBindings {
  const next = cloneBindings(bindings);
  if (RESERVED_CODES.has(code)) return next;
  (Object.keys(next) as ControlAction[]).forEach((a) => {
    next[a] = next[a].filter((c) => c !== code);
  });
  const keys = next[action];
  const index = Math.max(0, Math.min(MAX_KEYS_PER_ACTION - 1, slot));
  if (index < keys.length) keys[index] = code;
  else keys.push(code);
  next[action] = Array.from(new Set(keys)).slice(0, MAX_KEYS_PER_ACTION);
  return next;
}

export function clearKey(bindings: KeyBindings, action: ControlAction, slot: number): KeyBindings {
  const next = cloneBindings(bindings);
  next[action] = next[action].filter((_, i) => i !== slot);
  return next;
}

/** Reverse lookup: physical key code -> action. */
export function buildCodeMap(bindings: KeyBindings): Map<string, ControlAction> {
  const map = new Map<string, ControlAction>();
  (Object.keys(bindings) as ControlAction[]).forEach((action) => {
    bindings[action].forEach((code) => map.set(code, action));
  });
  return map;
}

/** Actions with no key bound at all (the remap UI warns about these). */
export function unboundActions(bindings: KeyBindings): ControlAction[] {
  return (Object.keys(bindings) as ControlAction[]).filter((a) => bindings[a].length === 0);
}

/** Human-friendly key label: `KeyL` -> `L`, `ArrowUp` -> `↑`, `ShiftLeft` -> `L-Shift`. */
export function formatKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named: Record<string, string> = {
    Space: 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    AltRight: 'R-Alt',
    Enter: 'Enter',
    Backspace: 'Bksp',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    CapsLock: 'Caps',
  };
  return named[code] || code;
}

export function formatAction(bindings: KeyBindings, action: ControlAction): string {
  const keys = bindings[action];
  if (!keys.length) return 'Unbound';
  // Collapse left/right pairs of the same modifier: ShiftLeft + ShiftRight -> Shift.
  const labels = keys.map(formatKey);
  if (labels.length === 2 && labels[0].slice(2) === labels[1].slice(2) && /^[LR]-/.test(labels[0]) && /^[LR]-/.test(labels[1])) {
    return labels[0].slice(2);
  }
  return labels.join(' / ');
}

// ---- Persistence + tiny pub/sub so the HUD, guide and settings stay in sync ----

let current: KeyBindings = loadBindings();
const listeners = new Set<(b: KeyBindings) => void>();

export function loadBindings(): KeyBindings {
  try {
    if (typeof localStorage === 'undefined') return cloneBindings(DEFAULT_BINDINGS);
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeBindings(JSON.parse(raw)) : cloneBindings(DEFAULT_BINDINGS);
  } catch {
    return cloneBindings(DEFAULT_BINDINGS);
  }
}

export function getBindings(): KeyBindings {
  return current;
}

export function setBindings(next: KeyBindings) {
  current = sanitizeBindings(next);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable (private mode) - bindings still apply for this session.
  }
  listeners.forEach((fn) => fn(current));
}

export function resetBindings() {
  setBindings(cloneBindings(DEFAULT_BINDINGS));
}

export function subscribeBindings(fn: (b: KeyBindings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
