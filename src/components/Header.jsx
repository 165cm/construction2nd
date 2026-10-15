import React from 'react';
import { Volume2, VolumeX, BarChart3, ChevronDown } from 'lucide-react';
import { getTodayCount } from '../utils/storage';

export default function Header({ state, soundOn, onToggleSound, onOpenStats, currentExamMeta, onOpenExamSelect }) {
  const today = getTodayCount(state);
  return <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white">
    <div className="max-w-lg mx-auto flex items-center justify-between px-3 py-2 gap-2">
      <button onClick={onOpenExamSelect} className="min-h-[44px] px-3 rounded-xl bg-slate-800 flex items-center gap-2 text-sm font-bold" title="試験年度を選ぶ">
        <span>電工2種</span><span className="text-sky-300">{currentExamMeta?.badge || '令8上'}</span><ChevronDown size={14} />
      </button>
      <span className="text-xs text-slate-300">今日 <strong className="text-sky-300">{today}</strong>問</span>
      <div className="flex gap-1">
        <button onClick={onOpenStats} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800" title="学習記録と設定"><BarChart3 size={18} /></button>
        <button onClick={onToggleSound} className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-slate-800" title={soundOn ? '消音にする' : '音声を有効化'}>{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      </div>
    </div>
  </header>;
}
