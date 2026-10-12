import React from 'react';
import { X, Trophy, Clock, Zap, Flame, Award, BarChart3, RotateCcw, CheckCircle2 } from 'lucide-react';
import { BADGES_DEF, getTitleForLevel, calculateExpForLevel, computeRemainingPlayTime } from '../utils/storage';
import { playClick } from '../utils/sound';

export default function StatsModal({
  isOpen,
  onClose,
  state,
  allQuestions,
  onResetProgress,
  onOpenAdmin
}) {
  if (!isOpen) return null;

  const levelTitle = getTitleForLevel(state.level);
  const expRequired = calculateExpForLevel(state.level);
  const timeEstimate = computeRemainingPlayTime(state, 50);

  const accuracy = state.totalAnswered > 0
    ? Math.round((state.totalCorrect / state.totalAnswered) * 100)
    : 0;

  // Category stats calculation
  const categories = [
    '電気理論・計算',
    '配線設計・機器',
    '材料・工具',
    '施工方法・法令・検査',
    '配線図問題'
  ];

  const catStats = categories.map(cat => {
    const qList = allQuestions.filter(q => q.category === cat);
    let correct = 0;
    let attempts = 0;
    let mastered = 0;
    qList.forEach(q => {
      const rec = state.records[q.id];
      if (rec) {
        attempts += rec.attempts;
        correct += rec.correct;
        if (rec.status === 'mastered') mastered += 1;
      }
    });
    const rate = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    return {
      name: cat,
      total: qList.length,
      mastered,
      rate,
      attempts
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-pop">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <Trophy className="text-amber-400" size={20} />
            <h3 className="font-black text-sm text-white">学習実績＆進捗分析</h3>
          </div>
          <button
            onClick={() => { playClick(); onClose(); }}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Estimated Play Time Card (Highlighted) */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-950/90 to-slate-800 border border-sky-500/40 shadow-lg">
            <div className="flex items-center space-x-2 text-sky-400 text-xs font-bold mb-1">
              <Clock size={16} />
              <span>全問正答までに必要な推定残り時間</span>
            </div>
            
            <div className="text-2xl font-black text-white my-1 flex items-baseline gap-2">
              <span className="text-volt-electric">{timeEstimate.formattedText}</span>
            </div>

            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden my-2 border border-slate-700">
              <div
                className="bg-gradient-to-r from-sky-500 to-volt-electric h-full transition-all duration-500"
                style={{ width: `${timeEstimate.progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-700/60 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400">マスター済</span>
                <div className="font-black text-emerald-400 text-sm">
                  {timeEstimate.masteredCount} / 50問
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400">残り未マスター</span>
                <div className="font-black text-rose-400 text-sm">
                  {timeEstimate.remainingCount} 問
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-400">あなたの平均速度</span>
                <div className="font-black text-sky-400 text-sm">
                  約 {timeEstimate.avgSeconds} 秒/問
                </div>
              </div>
            </div>
          </div>

          {/* Level & Rank Card */}
          <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 font-black text-lg flex items-center justify-center shadow-md">
                Lv.{state.level}
              </div>
              <div>
                <div className="text-xs text-slate-400">現在の電工称号</div>
                <div className="font-black text-sm text-amber-300">{levelTitle}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  次レベルまであと {expRequired - state.exp} EXP
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-400">最高連勝記録</div>
              <div className="text-base font-black text-amber-400 flex items-center gap-1 justify-end">
                <Flame size={14} className="fill-amber-400" />
                <span>{state.maxStreak} 連勝</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400">総解答回数</span>
              <div className="text-sm font-black text-white mt-0.5">
                {state.totalAnswered} 回
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400">総合正答率</span>
              <div className="text-sm font-black text-emerald-400 mt-0.5">
                {accuracy}%
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <span className="text-[10px] text-slate-400">総学習時間</span>
              <div className="text-sm font-black text-sky-400 mt-0.5">
                {Math.floor(state.totalTimeSpentSec / 60)} 分
              </div>
            </div>
          </div>

          {/* Category Mastery Breakdown */}
          <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700/80">
            <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center gap-1.5">
              <BarChart3 size={14} className="text-sky-400" />
              <span>分野別マスター進捗</span>
            </h4>
            
            <div className="space-y-2">
              {catStats.map(cat => (
                <div key={cat.name} className="text-xs">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-300">{cat.name}</span>
                    <span className="text-slate-400">
                      {cat.mastered} / {cat.total}問 ({Math.round((cat.mastered / cat.total) * 100)}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-400 h-full rounded-full transition-all"
                      style={{ width: `${(cat.mastered / cat.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Achievements / Badges Section */}
          <div className="p-3.5 rounded-2xl bg-slate-800/70 border border-slate-700/80">
            <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Award size={14} className="text-amber-400" />
                <span>実績バッジコレクション</span>
              </div>
              <span className="text-[11px] text-amber-400 font-bold">
                {state.badges.length} / {BADGES_DEF.length} 達成
              </span>
            </h4>

            <div className="grid grid-cols-2 gap-2">
              {BADGES_DEF.map(badge => {
                const isUnlocked = state.badges.includes(badge.id);
                return (
                  <div
                    key={badge.id}
                    className={`p-2.5 rounded-xl border flex items-start space-x-2 transition ${
                      isUnlocked
                        ? 'bg-amber-500/10 border-amber-500/40 text-slate-200'
                        : 'bg-slate-800/30 border-slate-800 text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="text-xl shrink-0">{badge.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold leading-tight ${isUnlocked ? 'text-amber-300' : 'text-slate-400'}`}>
                        {badge.name}
                      </div>
                      <div className="text-[10px] text-slate-400 leading-tight mt-0.5 truncate">
                        {badge.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Admin Tools & Reset */}
          <div className="pt-3 border-t border-slate-700/60 flex flex-col gap-2">
            {onOpenAdmin && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAdmin();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <span>🛠️ 問題画像のトリミング調整（管理者画面）</span>
              </button>
            )}

            {/* Reset progress */}
            <div className="text-center pt-1">
              <button
                onClick={() => {
                  if (window.confirm('学習記録と実績をすべて初期化しますか？この操作は取り消せません。')) {
                    onResetProgress();
                  }
                }}
                className="text-[11px] text-slate-500 hover:text-rose-400 underline py-1"
              >
                学習データをリセットする
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
