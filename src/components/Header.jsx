import React from 'react';
import { Volume2, VolumeX, Flame, Zap, Trophy, Clock, ChevronRight } from 'lucide-react';
import { getTitleForLevel, calculateExpForLevel, computeRemainingPlayTime } from '../utils/storage';

export default function Header({
  state,
  soundOn,
  onToggleSound,
  onOpenStats
}) {
  const levelTitle = getTitleForLevel(state.level);
  const expRequired = calculateExpForLevel(state.level);
  const expPercent = Math.min(100, Math.round((state.exp / expRequired) * 100));

  const timeEstimate = computeRemainingPlayTime(state, 50);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white px-3 py-2.5 shadow-md">
      {/* Top row: Title, Badges, Sound */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-sky-500/20">
            ⚡
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight leading-tight flex items-center gap-1.5">
              <span>電工2種サクサク道場</span>
              <span className="text-[10px] font-bold bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded border border-sky-500/30">
                令和8年上期
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 leading-none mt-0.5">
              {levelTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* Streak indicator if active */}
          {state.streak > 0 && (
            <div className="flex items-center space-x-1 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded-full text-xs font-bold animate-pulse">
              <Flame size={14} className="text-amber-400 fill-amber-400" />
              <span>{state.streak} 連勝!</span>
            </div>
          )}

          {/* Stats Button */}
          <button
            onClick={onOpenStats}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 rounded-lg active:scale-95 border border-slate-700/60"
            title="成績と実績"
          >
            <Trophy size={16} className="text-amber-400" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 rounded-lg active:scale-95 border border-slate-700/60"
            title={soundOn ? '消音にする' : '音声を有効化'}
          >
            {soundOn ? (
              <Volume2 size={16} className="text-sky-400" />
            ) : (
              <VolumeX size={16} className="text-slate-500" />
            )}
          </button>
        </div>
      </div>

      {/* Level & EXP Progress Row */}
      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center gap-1 text-xs font-black text-sky-400 min-w-[52px]">
          <span className="bg-sky-500/20 border border-sky-400/30 px-1.5 py-0.5 rounded text-[11px]">
            Lv.{state.level}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1 leading-none">
            <span>EXP</span>
            <span>{state.exp} / {expRequired} ({expPercent}%)</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-all duration-300 rounded-full"
              style={{ width: `${expPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Prominent Estimated Remaining Play Time Banner */}
      <div
        onClick={onOpenStats}
        className="mt-2.5 p-2 rounded-xl bg-gradient-to-r from-slate-800/90 to-sky-950/40 border border-sky-500/30 flex items-center justify-between cursor-pointer active:scale-[0.99] transition shadow-sm"
      >
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-md bg-sky-500/20 text-sky-400 flex items-center justify-center">
            <Clock size={14} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 leading-none">
              <span>全問制覇まで推計:</span>
              <strong className="text-volt-electric font-bold text-xs">
                {timeEstimate.formattedText}
              </strong>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
              <span>マスター: <strong>{timeEstimate.masteredCount}</strong> / 50問 ({timeEstimate.progressPercent}%)</span>
              <span className="text-slate-500">|</span>
              <span>1問平均: <strong>{timeEstimate.avgSeconds}秒</strong></span>
            </div>
          </div>
        </div>
        <div className="flex items-center text-slate-400 text-xs">
          <ChevronRight size={16} />
        </div>
      </div>
    </header>
  );
}
