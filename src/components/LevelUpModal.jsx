import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { getTitleForLevel } from '../utils/storage';
import { playLevelUp, triggerHaptic } from '../utils/sound';
import { X, Sparkles } from 'lucide-react';

export default function LevelUpModal({ isOpen, onClose, oldLevel, newLevel }) {
  useEffect(() => {
    if (isOpen) {
      playLevelUp();
      triggerHaptic('levelup');
      confetti({
        particleCount: 30,
        spread: 60,
        origin: { y: 0.1 },
        colors: ['#facc15', '#38bdf8', '#ffffff']
      });

      // Automatically auto-dismiss after 3.5 seconds so it doesn't interrupt learning
      const timer = setTimeout(() => {
        onClose();
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const newTitle = getTitleForLevel(newLevel);

  return (
    <div
      onClick={onClose}
      className="fixed top-14 left-0 right-0 z-50 flex justify-center px-3 pointer-events-none animate-slideDown"
    >
      <div className="pointer-events-auto max-w-sm w-full bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border border-sky-400/60 shadow-2xl rounded-2xl p-3 flex items-center justify-between text-white backdrop-blur-md cursor-pointer active:scale-95 transition">
        <div className="flex items-center space-x-2.5">
          <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 font-black text-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/30">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-[10px] font-bold text-sky-400 tracking-wider">LEVEL UP!</span>
              <strong className="text-xs font-black text-amber-300">レベル {newLevel}</strong>
            </div>
            <div className="text-[11px] font-bold text-slate-200 mt-1 flex items-center gap-1">
              <Sparkles size={11} className="text-amber-400 shrink-0" />
              <span>称号: {newTitle}</span>
            </div>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
