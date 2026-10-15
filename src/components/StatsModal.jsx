import React, { useState, useEffect, lazy, Suspense } from 'react';
import { X, Trophy, Clock, Zap, Flame, Award, BarChart3, RotateCcw, CheckCircle2, Brain, BookOpen, Table } from 'lucide-react';
import { getTodayCount, getStudyStreakDays } from '../utils/storage';
import { downloadLearningBackup, inspectLearningBackup, restoreLearningBackup } from '../utils/backup';
import { needsReview } from '../utils/reviewFilter';
import { playClick } from '../utils/sound';
import { getShuffleChoicesSetting, setShuffleChoicesSetting, getAutoAdvanceMode, setAutoAdvanceMode, AUTO_ADVANCE_MODES } from '../utils/settings';
import { CHEATSHEETS } from '../data/cheatsheets';
import { firebaseEnabled } from '../services/firebaseConfig';
const AccountPanel = lazy(() => import('./AccountPanel'));
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
  const [autoAdvance, setAutoAdvance] = useState(getAutoAdvanceMode);
  // 解答後ポップアップなど、ほかの場所で変えた自動送り設定にも表示を合わせる
  useEffect(() => {
    const sync = () => setAutoAdvance(getAutoAdvanceMode());
    window.addEventListener('auto-advance-setting-changed', sync);
    return () => window.removeEventListener('auto-advance-setting-changed', sync);
  }, []);

  if (!isOpen) return null;

  const attempted = allQuestions.filter(q => state.records[q.id]?.attempts > 0).length;
  const reviewCount = allQuestions.filter(q => needsReview(state.records[q.id])).length;

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
            <h3 className="font-black text-sm text-white">学習記録・設定</h3>
          </div>
          <button
            onClick={() => { playClick(); onClose(); }}
            aria-label="閉じる" className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 bg-slate-800 rounded-lg"
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
                  <span>試験前に確認する公式・数値</span>
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
              <div className="p-4 rounded-2xl bg-slate-800 border border-slate-700">
                <h4 className="font-bold text-sm">この年度の学習状況</h4>
                <p className="mt-2 text-sm text-slate-200">解いた問題 {attempted} / {allQuestions.length}問 · 要復習 {reviewCount}問</p>
                <p className="mt-2 text-xs text-slate-400">2回連続正解は記録上の目印です。日をあけて、根拠を思い出せるか確認しましょう。</p>
              </div>

              {/* Overall Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-sky-500/40">
                  <div className="text-xs text-slate-400">📅 今日解いた数</div>
                  <div className="text-xl font-black text-sky-300 mt-1">
                    {getTodayCount(state)} <span className="text-xs font-normal text-slate-400">問</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-amber-500/40">
                  <div className="text-xs text-slate-400">🗓️ 連続学習日数</div>
                  <div className="text-xl font-black text-amber-300 mt-1">
                    {getStudyStreakDays(state)} <span className="text-xs font-normal text-slate-400">日</span>
                  </div>
                </div>

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
                  <span>分野別の学習記録</span>
                </div>

                <div className="space-y-2.5">
                  {catStats.map(cat => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{cat.name}</span>
                        <span className="text-slate-400 text-[11px]">
                          正答率 <strong className="text-sky-400">{cat.rate}%</strong> ({cat.mastered}/{cat.total}問が2回連続正解)
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

              {firebaseEnabled && <Suspense fallback={<p className="text-xs">アカウント設定を読み込み中…</p>}><AccountPanel /></Suspense>}
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

                <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/80">
                  <div className="text-xs font-bold text-white">⏩ 解答後に自動で次の問題へ進む</div>
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {AUTO_ADVANCE_MODES.map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          playClick();
                          setAutoAdvance(m.id);
                          setAutoAdvanceMode(m.id);
                        }}
                        className={`min-h-[44px] rounded-lg text-[11px] font-bold border transition active:scale-95 ${
                          autoAdvance === m.id
                            ? 'bg-sky-500 text-white border-sky-400 shadow-md shadow-sky-500/30'
                            : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {AUTO_ADVANCE_MODES.find(m => m.id === autoAdvance)?.desc}
                  </p>
                </div>

                {/* 学習記録のバックアップ */}
                <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700/80">
                  <div className="text-xs font-bold text-white">💾 学習記録のバックアップ</div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    機種変更やブラウザのデータ削除に備えて、ファイルに保存できます。
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    <button
                      onClick={() => { playClick(); downloadLearningBackup(); }}
                      className="min-h-[44px] rounded-lg text-xs font-bold border bg-slate-900 text-sky-300 border-slate-700 hover:bg-slate-700 active:scale-95 transition"
                    >
                      ⬇️ 書き出す
                    </button>
                    <label className="min-h-[44px] rounded-lg text-xs font-bold border bg-slate-900 text-emerald-300 border-slate-700 hover:bg-slate-700 active:scale-95 transition flex items-center justify-center cursor-pointer">
                      ⬆️ 読み込む
                      <input
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const result = inspectLearningBackup(String(ev.target.result || ''));
                            if (!result.ok) {
                              alert(`⚠️ 読み込めませんでした：${result.error}`);
                              return;
                            }
                            const date = result.summary.exportedAt ? new Date(result.summary.exportedAt).toLocaleString('ja-JP') : '不明';
                            const ok = window.confirm(
                              `${date} に保存した学習記録（解答 ${result.summary.answered} 問）を読み込みます。\n今この端末にある学習記録は置き換わります。よろしいですか？`
                            );
                            if (!ok) return;
                            restoreLearningBackup(result.backup);
                            window.location.reload();
                          };
                          reader.readAsText(file);
                        }}
                      />
                    </label>
                  </div>
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
