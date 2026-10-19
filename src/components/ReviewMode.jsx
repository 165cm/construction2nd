import React, { useState, useMemo } from 'react';
import { Flame, Star, ArrowRight, Sparkles } from 'lucide-react';
import QuizCard from './QuizCard';
import { needsReview } from '../utils/reviewFilter';
import { getExamMeta } from '../data/examLoader';

const CATEGORIES = [
  'ALL',
  '電気理論・計算',
  '配線設計・機器',
  '材料・工具',
  '施工方法・法令・検査',
  '配線図問題'
];

/**
 * 弱点特訓。
 * 対象は「この年度」か「全年度まとめて」を選べる。分野でも絞り込める。
 * 問題は年度をまたぐので、記録・ブックマークは年度付きのキー（globalId 例: r7_2_12）で引く。
 */
export default function ReviewMode({
  allExamQuestions,
  fullState,
  currentExamId,
  onAnswer,
  onToggleBookmark,
  onOpenWiringDiagram,
  onSwitchToQuick,
  onOpenAttribution,
  allYearsReady = true,
  onLoadAllYears
}) {
  const [scope, setScope] = useState('exam'); // 'exam' | 'all'
  const [filterType, setFilterType] = useState('review'); // 'review' | 'bookmark' | 'unmastered'
  const [category, setCategory] = useState('ALL');
  const [currentIndex, setCurrentIndex] = useState(0);

  const records = fullState.records || {};
  const bookmarks = fullState.bookmarks || [];
  const recOf = (q) => records[q.globalId];

  const scopedQuestions = (s, c) => allExamQuestions.filter(q =>
    (s === 'all' || q.examId === currentExamId) && (c === 'ALL' || q.category === c)
  );

  const matchesFilter = (q, filter) => {
    const rec = recOf(q);
    if (filter === 'bookmark') {
      return bookmarks.includes(q.globalId);
    }
    if (filter === 'unmastered') {
      return !rec || rec.status !== 'mastered';
    }
    // default 'review': wrong count > 0 or status === 'review'
    return needsReview(rec);
  };
  const computeIds = (s, filter, c) => scopedQuestions(s, c).filter(q => matchesFilter(q, filter)).map(q => q.globalId);

  // 出題リストは「始めた時点」で固定する。
  // 解いた直後にマスター等で条件から外れても、解説を読んでいる途中で問題が入れ替わらないようにする。
  // リストを最後まで解いたら、その時点の条件で作り直す。
  const [sessionIds, setSessionIds] = useState(() => computeIds('exam', 'review', 'ALL'));
  const [loopCount, setLoopCount] = useState(0);

  const targetQuestions = useMemo(
    () => sessionIds.map(id => allExamQuestions.find(q => q.globalId === id)).filter(Boolean),
    [sessionIds, allExamQuestions]
  );

  const applySelection = (nextScope, nextFilter, nextCategory) => {
    setScope(nextScope);
    setFilterType(nextFilter);
    setCategory(nextCategory);
    setSessionIds(computeIds(nextScope, nextFilter, nextCategory));
    setCurrentIndex(0);
    setLoopCount(c => c + 1);
  };

  const activeQuestion = targetQuestions[currentIndex] || targetQuestions[0];
  const activeExamMeta = activeQuestion ? getExamMeta(activeQuestion.examId) : getExamMeta(currentExamId);

  const handleNext = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    if (currentIndex < targetQuestions.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      // 1周終わったら、最新の状態で対象を選び直す（マスターした問題は外れる）
      setSessionIds(computeIds(scope, filterType, category));
      setCurrentIndex(0);
      setLoopCount(c => c + 1);
    }
  };

  // ボタンに出す件数（いまの対象範囲・分野での件数）
  const pool = scopedQuestions(scope, category);
  const reviewCount = pool.filter(q => needsReview(recOf(q))).length;
  const bookmarkCount = pool.filter(q => bookmarks.includes(q.globalId)).length;
  const unmasteredCount = pool.filter(q => recOf(q)?.status !== 'mastered').length;

  const scopeBtn = (active) => `flex-1 min-h-[44px] px-2 rounded-lg text-xs font-black transition border ${
    active ? 'bg-white text-slate-950 border-white shadow-md' : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-800'
  }`;

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Review Mode Banner & Sub-Tabs */}
      <div className="p-3 bg-gradient-to-r from-rose-950/60 to-amber-950/40 border-b border-rose-900/40 mb-3 rounded-2xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
              <Flame size={18} />
            </span>
            <div>
              <h2 className="text-sm font-black text-white">弱点克服・復習特訓</h2>
              <p className="text-[11px] text-rose-300">
                間違えた問題や、まだ2回連続正解していない問題を復習。
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-slate-400">対象問題数</span>
            <div className="text-sm font-black text-rose-400">
              {targetQuestions.length} 問
            </div>
          </div>
        </div>

        {/* 対象範囲：この年度／全年度 */}
        <div className="flex gap-1.5">
          <button onClick={() => applySelection('exam', filterType, category)} className={scopeBtn(scope === 'exam')}>
            📘 この年度（{getExamMeta(currentExamId).badge}）
          </button>
          <button onClick={() => allYearsReady ? applySelection('all', filterType, category) : onLoadAllYears?.()} className={scopeBtn(scope === 'all')}>
            📚 全年度まとめて
          </button>
        </div>

        {/* 分野で絞り込み */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => applySelection(scope, filterType, c)}
              className={`shrink-0 px-3 py-2 rounded-full text-[11px] font-bold border transition ${
                category === c
                  ? 'bg-sky-500 text-white border-sky-400'
                  : 'bg-slate-900/70 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {c === 'ALL' ? 'すべての分野' : c}
            </button>
          ))}
        </div>

        {/* Sub filter buttons */}
        <div className="flex gap-1.5 text-xs">
          <button
            onClick={() => applySelection(scope, 'review', category)}
            className={`flex-1 min-h-[44px] px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              filterType === 'review'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-900/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Flame size={12} />
            <span>要復習 ({reviewCount})</span>
          </button>

          <button
            onClick={() => applySelection(scope, 'bookmark', category)}
            className={`flex-1 min-h-[44px] px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              filterType === 'bookmark'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-900/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Star size={12} className={filterType === 'bookmark' ? 'fill-slate-950' : ''} />
            <span>クリップ ({bookmarkCount})</span>
          </button>

          <button
            onClick={() => applySelection(scope, 'unmastered', category)}
            className={`flex-1 min-h-[44px] px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              filterType === 'unmastered'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-900/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles size={12} />
            <span>未マスター ({unmasteredCount})</span>
          </button>
        </div>
      </div>

      {/* When no questions match filter */}
      {targetQuestions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-slate-800/40 rounded-3xl border border-slate-700/60 my-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mb-4 border border-emerald-500/40">
            🎉
          </div>
          <h3 className="text-base font-black text-white mb-2">
            対象の問題はありません！
          </h3>
          <p className="text-xs text-slate-300 max-w-xs leading-relaxed mb-6">
            {filterType === 'review'
              ? '素晴らしい！現在、間違えたままの問題はありません。通常モードでさらに問題を解くか、本番模擬試験で腕試しをしましょう！'
              : filterType === 'bookmark'
              ? 'ブックマークされた問題はありません。解いている途中で気になった問題に★をつけてみましょう。'
              : `対象の${pool.length}問はすべて2回連続正解済みです。日をあけた解き直しや別の回で、根拠も説明できるか確かめましょう。`}
          </p>

          <button
            onClick={onSwitchToQuick}
            className="py-3 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-sky-600/30"
          >
            <span>通常モードで問題を解く</span>
            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div>
          {/* Progress tracker within current review set */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 mb-2 gap-2">
            <span className="shrink-0">
              復習中: {currentIndex + 1} / {targetQuestions.length} 問
              {scope === 'all' && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  {activeExamMeta.badge}
                </span>
              )}
            </span>
            <div className="flex flex-wrap justify-end gap-1 max-w-[60%]">
              {targetQuestions.map((q, idx) => (
                <div
                  key={q.globalId}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full cursor-pointer transition ${
                    idx === currentIndex
                      ? 'bg-rose-400 scale-125'
                      : recOf(q)?.status === 'mastered'
                      ? 'bg-emerald-500'
                      : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <QuizCard
            key={`${activeQuestion.globalId}_${loopCount}`}
            question={activeQuestion}
            record={recOf(activeQuestion)}
            isBookmarked={bookmarks.includes(activeQuestion.globalId)}
            onAnswer={onAnswer}
            onNext={handleNext}
            onToggleBookmark={onToggleBookmark}
            onOpenWiringDiagram={onOpenWiringDiagram}
            totalQuestions={targetQuestions.length}
            currentIndex={currentIndex}
            onOpenAttribution={onOpenAttribution}
            currentExamMeta={activeExamMeta}
          />
        </div>
      )}
    </div>
  );
}
