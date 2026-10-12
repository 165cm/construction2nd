import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { getTitleForLevel } from '../utils/storage';
import { playLevelUp, triggerHaptic, playClick } from '../utils/sound';

export default function LevelUpModal({ isOpen, onClose, oldLevel, newLevel }) {
  useEffect(() => {
    if (isOpen) {
      playLevelUp();
      triggerHaptic('levelup');
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 },
        colors: ['#facc15', '#38bdf8', '#a855f7', '#ffffff']
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const newTitle = getTitleForLevel(newLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-pop">
      <div className="w-full max-w-sm rounded-3xl p-6 bg-gradient-to-b from-sky-900 to-slate-900 border border-sky-400/50 shadow-2xl text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-400 text-slate-950 font-black text-3xl flex items-center justify-center mb-4 shadow-xl shadow-amber-400/30 animate-bounce">
          ⚡
        </div>

        <span className="text-xs font-bold uppercase tracking-widest text-sky-400">
          LEVEL UP!
        </span>

        <h2 className="text-2xl font-black text-white mt-1 mb-2">
          レベル {newLevel} に到達！
        </h2>

        <div className="p-3 my-4 rounded-2xl bg-slate-800/80 border border-sky-500/30">
          <div className="text-[11px] text-slate-400">新しい称号</div>
          <div className="text-base font-black text-amber-300 mt-0.5">
            {newTitle}
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-6">
          過去問の理解度が着実にアップしています！この調子で全問マスターを目指しましょう！
        </p>

        <button
          onClick={() => { playClick(); onClose(); }}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-sm shadow-lg shadow-sky-600/40 active:scale-95 transition"
        >
          特訓を続ける ➔
        </button>
      </div>
    </div>
  );
}
