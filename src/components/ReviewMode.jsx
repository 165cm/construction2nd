import React, { useState, useMemo } from 'react';
import { Flame, Star, CheckCircle, RefreshCw, Trophy, ArrowRight, Sparkles } from 'lucide-react';
import QuizCard from './QuizCard';

export default function ReviewMode({
  allQuestions,
  state,
  onAnswer,
  onToggleBookmark,
  onOpenWiringDiagram,
  onSwitchToQuick
}) {
  const [filterType, setFilterType] = useState('review'); // 'review' | 'bookmark' | 'unmastered'
  const [currentIndex, setCurrentIndex] = useState(0);

  // Filter targeted questions based on user state
  const targetQuestions = useMemo(() => {
    return allQuestions.filter((q) => {
      const rec = state.records[q.id];
      if (filterType === 'bookmark') {
        return (state.bookmarks || []).includes(q.id);
      }
      if (filterType === 'unmastered') {
        return !rec || rec.status !== 'mastered';
      }
      // default 'review': wrong count > 0 or status === 'review'
      return rec && (rec.status === 'review' || rec.wrong > 0 && rec.status !== 'mastered');
    });
  }, [allQuestions, state, filterType]);

  const activeQuestion = targetQuestions[currentIndex] || targetQuestions[0];

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
      setCurrentIndex(0); // loop or finish
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-20">
      {/* Review Mode Banner & Sub-Tabs */}
      <div className="p-3 bg-gradient-to-r from-rose-950/60 to-amber-950/40 border-b border-rose-900/40 mb-3 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
              <Flame size={18} />
            </span>
            <div>
              <h2 className="text-sm font-black text-white">弱点克服・復習特訓</h2>
              <p className="text-[11px] text-rose-300">
                間違えた問題や未完全な問題を効率よく撃破！
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

        {/* Sub filter buttons */}
        <div className="flex gap-1.5 text-xs">
          <button
            onClick={() => { setFilterType('review'); setCurrentIndex(0); }}
            className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              filterType === 'review'
                ? 'bg-rose-500 text-white shadow-md shadow-rose-900/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Flame size={12} />
            <span>要復習のみ ({allQuestions.filter(q => state.records[q.id]?.status === 'review').length})</span>
          </button>
          
          <button
            onClick={() => { setFilterType('bookmark'); setCurrentIndex(0); }}
            className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              filterType === 'bookmark'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-900/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Star size={12} className={filterType === 'bookmark' ? 'fill-slate-950' : ''} />
            <span>クリップ ({state.bookmarks?.length || 0})</span>
          </button>

          <button
            onClick={() => { setFilterType('unmastered'); setCurrentIndex(0); }}
            className={`flex-1 py-1.5 px-2 rounded-lg font-bold transition flex items-center justify-center gap-1 ${
              filterType === 'unmastered'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-900/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Sparkles size={12} />
            <span>未マスター ({allQuestions.filter(q => state.records[q.id]?.status !== 'mastered').length})</span>
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
              : '全50問がすべて完全マスター状態です！本番試験でも合格間違いなしです！'}
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
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 mb-2">
            <span>復習中: {currentIndex + 1} / {targetQuestions.length} 問</span>
            <div className="flex gap-1">
              {targetQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full cursor-pointer transition ${
                    idx === currentIndex
                      ? 'bg-rose-400 scale-125'
                      : state.records[q.id]?.status === 'mastered'
                      ? 'bg-emerald-500'
                      : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <QuizCard
            key={activeQuestion.id}
            question={activeQuestion}
            record={state.records[activeQuestion.id]}
            isBookmarked={(state.bookmarks || []).includes(activeQuestion.id)}
            onAnswer={onAnswer}
            onNext={handleNext}
            onToggleBookmark={onToggleBookmark}
            onOpenWiringDiagram={onOpenWiringDiagram}
            totalQuestions={targetQuestions.length}
            currentIndex={currentIndex}
          />
        </div>
      )}
    </div>
  );
}
