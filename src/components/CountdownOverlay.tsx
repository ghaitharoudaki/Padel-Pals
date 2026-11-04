import React, { useEffect, useState } from 'react';
import { padelAudio } from '../game/audio';

interface CountdownOverlayProps {
  onComplete: () => void;
  p1Name?: string;
  p2Name?: string;
  gameMode?: string;
}

export const CountdownOverlay: React.FC<CountdownOverlayProps> = ({
  onComplete,
  p1Name = 'Player 1',
  p2Name = 'Opponent',
  gameMode = '2v2',
}) => {
  const [count, setCount] = useState<number>(3);
  const [text, setText] = useState<string>('3');

  useEffect(() => {
    // Play tick on start
    padelAudio.playHoverTick();

    const timer1 = setTimeout(() => {
      setCount(2);
      setText('2');
      padelAudio.playHoverTick();
    }, 1000);

    const timer2 = setTimeout(() => {
      setCount(1);
      setText('1');
      padelAudio.playHoverTick();
    }, 2000);

    const timer3 = setTimeout(() => {
      setCount(0);
      setText('VAMOS! 🔥');
      padelAudio.playRefereeWhistle('start');
    }, 3000);

    const timer4 = setTimeout(() => {
      onComplete();
    }, 3800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
    };
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-50 pointer-events-none flex flex-col items-center justify-center select-none font-sans bg-slate-950/20">
      {/* Versus Banner Header */}
      <div className="mb-6 flex items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
        <span
          className="bg-blue-600 text-white font-brand text-2xl sm:text-3xl px-5 py-2 rounded-2xl border-4 border-slate-900 -rotate-2"
          style={{ boxShadow: '4px 4px 0px #0f172a' }}
        >
          {p1Name.toUpperCase()}
        </span>
        <span
          className="bg-amber-400 text-slate-950 font-black text-xl px-3 py-1 rounded-xl border-3 border-slate-900 rotate-2"
          style={{ boxShadow: '3px 3px 0px #0f172a' }}
        >
          VS
        </span>
        <span
          className="bg-rose-600 text-white font-brand text-2xl sm:text-3xl px-5 py-2 rounded-2xl border-4 border-slate-900 rotate-2"
          style={{ boxShadow: '4px 4px 0px #0f172a' }}
        >
          {p2Name.toUpperCase()}
        </span>
      </div>

      {/* Big Animated Countdown Number */}
      <div
        key={text}
        className="animate-countdown-pop font-brand text-8xl sm:text-9xl text-amber-400 select-none tracking-wider uppercase leading-none drop-shadow-2xl"
        style={{
          WebkitTextStroke: '6px #0f172a',
          filter: 'drop-shadow(8px 8px 0px #0f172a)',
        }}
      >
        {text}
      </div>

      <div className="mt-4">
        <span
          className="inline-block bg-slate-900 text-cyan-300 font-black text-sm uppercase px-4 py-1.5 rounded-xl border-2 border-slate-700 tracking-widest"
          style={{ boxShadow: '3px 3px 0px rgba(0,0,0,0.5)' }}
        >
          {count > 0 ? `${gameMode.toUpperCase()} MATCH STARTING` : 'GET READY TO SERVE!'}
        </span>
      </div>
    </div>
  );
};
