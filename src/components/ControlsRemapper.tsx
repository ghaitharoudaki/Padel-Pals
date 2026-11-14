import React, { useEffect, useState } from 'react';
import { Keyboard, RotateCcw, X } from 'lucide-react';
import {
  CONTROL_ACTIONS,
  ControlAction,
  KeyBindings,
  MAX_KEYS_PER_ACTION,
  RESERVED_CODES,
  assignKey,
  clearKey,
  formatKey,
  getBindings,
  resetBindings,
  setBindings,
  subscribeBindings,
  unboundActions,
} from '../game/engine/controls';
import { padelAudio } from '../game/audio';

/** Live key bindings that re-render when they change anywhere in the app. */
export function useKeyBindings(): KeyBindings {
  const [bindings, setLocal] = useState<KeyBindings>(getBindings());
  useEffect(() => subscribeBindings(setLocal), []);
  return bindings;
}

/**
 * Click a key slot, then press the new key (Esc cancels, Backspace/Delete clears the slot).
 * A key can only do one thing: binding it here removes it from any other action.
 */
export const ControlsRemapper: React.FC = () => {
  const bindings = useKeyBindings();
  const [listening, setListening] = useState<{ action: ControlAction; slot: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        setBindings(clearKey(getBindings(), listening.action, listening.slot));
        setListening(null);
        return;
      }
      if (RESERVED_CODES.has(e.code)) {
        setNotice(`${formatKey(e.code)} is reserved (pause / debug).`);
        return;
      }
      const before = getBindings();
      const stolenFrom = CONTROL_ACTIONS.find((a) => a.id !== listening.action && before[a.id].includes(e.code));
      setBindings(assignKey(before, listening.action, listening.slot, e.code));
      setNotice(stolenFrom ? `${formatKey(e.code)} moved from "${stolenFrom.label}".` : null);
      padelAudio.playClickPop();
      setListening(null);
    };
    // Capture phase so the in-game input manager never sees the key.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);

  const missing = unboundActions(bindings);

  const renderGroup = (group: 'move' | 'shots', title: string) => (
    <div className="space-y-1.5">
      <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">{title}</div>
      {CONTROL_ACTIONS.filter((a) => a.group === group).map((a) => (
        <div
          key={a.id}
          className="flex items-center gap-2 bg-white border-2 border-slate-900 rounded-xl px-2.5 py-1.5"
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-slate-900 leading-tight">{a.label}</div>
            {a.hint && <div className="text-[10px] font-bold text-slate-500 leading-tight truncate">{a.hint}</div>}
          </div>
          {Array.from({ length: MAX_KEYS_PER_ACTION }).map((_, slot) => {
            const code = bindings[a.id][slot];
            const active = listening?.action === a.id && listening.slot === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => {
                  padelAudio.playHoverTick();
                  setNotice(null);
                  setListening(active ? null : { action: a.id, slot });
                }}
                className={`min-w-[64px] h-8 px-2 rounded-lg border-2 font-mono text-[11px] font-bold transition active:scale-95 ${
                  active
                    ? 'bg-amber-300 border-slate-900 text-slate-950 animate-pulse'
                    : code
                      ? 'bg-slate-900 border-slate-900 text-white hover:bg-slate-700'
                      : 'bg-slate-100 border-dashed border-slate-400 text-slate-400 hover:bg-slate-200'
                }`}
                aria-label={`${a.label} key ${slot + 1}`}
              >
                {active ? 'Press…' : code ? formatKey(code) : slot === 0 ? 'Unbound' : '+ Alt'}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 rounded-2xl bg-indigo-50 border-3 border-slate-900 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-brand text-lg uppercase text-slate-900">
          <Keyboard className="w-5 h-5 text-indigo-600 stroke-[2.5]" />
          <span>Keyboard Controls</span>
        </div>
        <button
          type="button"
          onClick={() => {
            padelAudio.playClickPop();
            resetBindings();
            setListening(null);
            setNotice('Controls reset to default.');
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border-2 border-slate-900 text-[11px] font-black uppercase hover:bg-slate-100 active:scale-95"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Defaults
        </button>
      </div>
      <p className="text-[11px] font-bold text-slate-600 leading-snug">
        Click a key, then press the new one. Backspace clears it, Esc cancels. Every shot has its own button: hold to
        charge, release to hit, and hold a direction to aim.
      </p>
      {renderGroup('shots', 'Shots')}
      {renderGroup('move', 'Movement')}
      {notice && (
        <div className="flex items-center justify-between text-[11px] font-bold text-indigo-800 bg-indigo-100 border-2 border-indigo-300 rounded-lg px-2 py-1">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="text-[11px] font-bold text-rose-700">
          No key for: {missing.map((m) => CONTROL_ACTIONS.find((a) => a.id === m)?.label).join(', ')}
        </div>
      )}
      <div className="text-[10px] font-bold text-slate-500">Mouse: left click = drive, right click = smash.</div>
    </div>
  );
};
