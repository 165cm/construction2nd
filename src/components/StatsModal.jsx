import React, { useState } from 'react';
import { X, Trophy, Clock, Zap, Flame, Award, BarChart3, RotateCcw, CheckCircle2, Brain, BookOpen, Table } from 'lucide-react';
import { BADGES_DEF, getTitleForLevel, calculateExpForLevel, computeRemainingPlayTime } from '../utils/storage';
import { getLeitnerBoxCounts } from '../utils/spacedRepetition';
import { playClick } from '../utils/sound';
import { getShuffleChoicesSetting, setShuffleChoicesSetting } from '../utils/settings';
import { CHEATSHEETS } from '../data/cheatsheets';
import CheatsheetAccordion from './CheatsheetAccordion';

export default function StatsModal({
  isOpen,
  onClose,
  state,
  allQuestions,
  onResetProgress,
  onOpenAdmin,
  onOpenAttribution
}) {
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'cheatsheets'
  const [isShuffle, setIsShuffle] = useState(getShuffleChoicesSetting);

  if (!isOpen) return null;

  const levelTitle = getTitleForLevel(state.level);
  const expRequired = calculateExpForLevel(state.level);
  const timeEstimate = computeRemainingPlayTime(state, allQuestions.length);
  const boxCounts = getLeitnerBoxCounts(allQuestions, state);

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

  const allCheatsheetsList = Object.values(CHEATSHEETS);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-pop">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-800/50 shrink-0">
          <div className="flex items-center space-x-2">
            <Trophy className="text-amber-400" size={20} />
            <h3 className="font-black text-sm text-white">成績分析 ＆ 暗記早見表</h3>
          </div>
          <button
            onClick={() => { playClick(); onClose(); }}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => { playClick(); setActiveTab('stats'); }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'stats'
                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <BarChart3 size={14} />
            <span>学習成績・進捗</span>
          </button>

          <button
            type="button"
            onClick={() => { playClick(); setActiveTab('cheatsheets'); }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'cheatsheets'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Table size={14} className="text-amber-400" />
            <span>暗記早見表 (16選)</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeTab === 'cheatsheets' ? (
            /* Cheatsheets Tab */
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-950/40 to-slate-900 border border-amber-500/30">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-300 mb-1">
                  <BookOpen size={14} />
                  <span>試験直前！丸暗記チートシート集</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  第二種電気工事士の筆記試験で合否を分ける重要数値・公式・分類ルールの一覧です。気になる項目をタップして確認しましょう。
                </p>
              </div>

              <CheatsheetAccordion cheatsheets={allCheatsheetsList} />
            </div>
          ) : (
            /* Stats Tab */
            <>
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
                      {timeEstimate.masteredCount} / {allQuestions.length}問
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
                      {timeEstimate.avgSeconds}秒/問
                    </div>
                  </div>
                </div>
              </div>

              {/* Leitner Box Progress Card */}
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
                    <Brain size={15} className="text-purple-400" />
                    <span>定着度ステップ（ライトナーBox）</span>
                  </div>
                  <span className="text-[10px] text-purple-300 font-bold bg-purple-950/80 px-2 py-0.5 rounded border border-purple-500/30">
                    忘却曲線SRS
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-tight mb-3">
                  連続正解するほど出題間隔が伸び、長期記憶に定着します。
                </p>

                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-rose-500/30">
                    <div className="text-[10px] text-rose-400 font-bold leading-tight">要復習🔥</div>
                    <div className="text-base font-black text-white mt-1">{boxCounts.box1}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">3問以内</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-sky-500/30">
                    <div className="text-[10px] text-sky-400 font-bold leading-tight">定着中🌱</div>
                    <div className="text-base font-black text-white mt-1">{boxCounts.box2}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">約8問後</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-teal-500/30">
                    <div className="text-[10px] text-teal-300 font-bold leading-tight">安定🌿</div>
                    <div className="text-base font-black text-white mt-1">{boxCounts.box3}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">約20問後</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900/80 border border-emerald-500/40 bg-emerald-950/20">
                    <div className="text-[10px] text-emerald-300 font-bold leading-tight">マスター👑</div>
                    <div className="text-base font-black text-emerald-400 mt-1">{boxCounts.box4}</div>
                    <div className="text-[9px] text-emerald-300/70 mt-0.5">完了</div>
                  </div>
                </div>
              </div>

              {/* Overall Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                  <div className="text-xs text-slate-400">総解答数</div>
                  <div className="text-xl font-black text-white mt-1">
                    {state.totalAnswered} <span className="text-xs font-normal text-slate-400">問</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                  <div className="text-xs text-slate-400">総合正答率</div>
                  <div className="text-xl font-black text-emerald-400 mt-1">
                    {accuracy} <span className="text-xs font-normal text-slate-400">%</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                  <div className="text-xs text-slate-400">最高連勝記録</div>
                  <div className="text-xl font-black text-amber-400 mt-1 flex items-center gap-1">
                    <Flame size={18} className="fill-amber-400" />
                    <span>{state.maxStreak}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/70">
                  <div className="text-xs text-slate-400">ブックマーク</div>
                  <div className="text-xl font-black text-sky-400 mt-1">
                    {(state.bookmarks || []).length} <span className="text-xs font-normal text-slate-400">問</span>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70 space-y-3">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
                  <BarChart3 size={15} className="text-sky-400" />
                  <span>分野別・習得度</span>
                </div>

                <div className="space-y-2.5">
                  {catStats.map(cat => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{cat.name}</span>
                        <span className="text-slate-400 text-[11px]">
                          正答率 <strong className="text-sky-400">{cat.rate}%</strong> ({cat.mastered}/{cat.total}問習得)
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-sky-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.round((cat.mastered / cat.total) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Achievements / Badges Section */}
              <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/70 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-200">
                    <Award size={15} className="text-amber-400" />
                    <span>獲得バッジ・実績</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-400">
                    {state.badges.length} / {BADGES_DEF.length} 達成
                  </span>
                </div>

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

              {/* Learning Settings & Options */}
              <div className="pt-3 border-t border-slate-700/60 flex flex-col gap-2">
                <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>🔀 選択肢シャッフル（暗記防止）</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${isShuffle ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-slate-700 text-slate-400'}`}>
                        {isShuffle ? 'ON（推奨）' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      選択肢の位置（並び順）をランダム化し、位置覚えを防いで実戦力をつけます。
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      playClick();
                      const next = !isShuffle;
                      setIsShuffle(next);
                      setShuffleChoicesSetting(next);
                    }}
                    className={`w-11 h-6 rounded-full transition relative shrink-0 ml-2 ${
                      isShuffle ? 'bg-sky-500 shadow-md shadow-sky-500/30' : 'bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition absolute top-1 ${
                        isShuffle ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {onOpenAttribution && (
                  <button
                    onClick={() => {
                      onOpenAttribution();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition"
                  >
                    <span>⚖️ 著作権・過去問の出典について</span>
                  </button>
                )}

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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
