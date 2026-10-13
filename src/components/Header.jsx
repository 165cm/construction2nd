import React from 'react';
import { Volume2, VolumeX, Flame, Trophy, Clock, Crop, ChevronDown } from 'lucide-react';
import { getTitleForLevel, calculateExpForLevel, computeRemainingPlayTime } from '../utils/storage';

export default function Header({
  state,
  soundOn,
  onToggleSound,
  onOpenStats,
  onOpenAdmin,
  currentExamMeta,
  onOpenExamSelect
}) {
  const levelTitle = getTitleForLevel(state.level);
  const expRequired = calculateExpForLevel(state.level);
  const expPercent = Math.min(100, Math.round((state.exp / expRequired) * 100));
  const timeEstimate = computeRemainingPlayTime(state, 50);

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 text-white shadow-md">
      {/* Compact Main Bar (Height ~48px) */}
      <div className="flex items-center justify-between px-3 py-2">
        {/* Left: App Title + Exam Badge + Level */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-sky-500 to-amber-400 flex items-center justify-center text-slate-950 font-black text-xs shadow-md shadow-sky-500/20">
            ⚡
          </div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-xs sm:text-sm font-black tracking-tight leading-none text-slate-100 hidden xxs:inline">
              電工2種
            </h1>

            {/* Exam selector pill */}
            <button
              onClick={onOpenExamSelect}
              className="flex items-center space-x-0.5 text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/40 transition active:scale-95 shadow-sm"
              title="タップして試験年度を切り替え"
            >
              <span>{currentExamMeta?.badge || '令8上'}</span>
              <ChevronDown size={11} className="text-sky-400" />
            </button>

            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Lv.{state.level}
            </span>
          </div>
        </div>

        {/* Right: Streak + Time Pill + Action Buttons */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0">
          {/* Streak indicator if active */}
          {state.streak > 0 && (
            <div className="flex items-center space-x-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
              <Flame size={12} className="text-amber-400 fill-amber-400" />
              <span>{state.streak}</span>
            </div>
          )}

          {/* Time Estimate Pill (Compact, Tappable to open stats) */}
          <button
            onClick={onOpenStats}
            className="hidden xs:flex items-center space-x-1 bg-slate-800/90 hover:bg-slate-700/80 text-slate-300 px-1.5 py-0.5 rounded-lg border border-slate-700/60 text-[10px] transition"
            title={`全問制覇まで推計: ${timeEstimate.formattedText} (タップで詳細)`}
          >
            <Clock size={11} className="text-sky-400" />
            <span className="font-semibold text-sky-300">{timeEstimate.formattedText}</span>
          </button>

          {/* Stats Button */}
          <button
            onClick={onOpenStats}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg active:scale-95 border border-slate-700/60 transition"
            title="成績と実績"
          >
            <Trophy size={14} className="text-amber-400" />
          </button>

          {/* Admin Crop Editor Button */}
          <button
            onClick={onOpenAdmin}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg active:scale-95 border border-slate-700/60 transition"
            title="画像トリミング調整（管理者）"
          >
            <Crop size={14} className="text-rose-400" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 rounded-lg active:scale-95 border border-slate-700/60 transition"
            title={soundOn ? '消音にする' : '音声を有効化'}
          >
            {soundOn ? (
              <Volume2 size={14} className="text-sky-400" />
            ) : (
              <VolumeX size={14} className="text-slate-500" />
            )}
          </button>
        </div>
      </div>

      {/* Slim EXP Progress Line (Height 2px, zero vertical space wasted) */}
      <div
        className="w-full h-0.5 bg-slate-800/80 overflow-hidden relative"
        title={`EXP: ${state.exp} / ${expRequired} (${expPercent}%) - ${levelTitle}`}
      >
        <div
          className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-amber-300 transition-all duration-300 rounded-full"
          style={{ width: `${expPercent}%` }}
        />
      </div>
    </header>
  );
}
