import React, { useState, useMemo } from 'react';
import { Search, Star, CheckCircle, Flame, Sparkles, Filter, ChevronRight } from 'lucide-react';
import { playClick } from '../utils/sound';

export default function QuestionList({
  allQuestions,
  state,
  onSelectQuestion,
  onToggleBookmark
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const categories = [
    'ALL',
    '電気理論・計算',
    '配線設計・機器',
    '材料・工具',
    '施工方法・法令・検査',
    '配線図問題'
  ];

  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(q => {
      // Category check
      if (categoryFilter !== 'ALL' && q.category !== categoryFilter) {
        return false;
      }

      // Status check
      const rec = state.records[q.id];
      if (statusFilter === 'review') {
        if (!rec || rec.status !== 'review') return false;
      } else if (statusFilter === 'mastered') {
        if (!rec || rec.status !== 'mastered') return false;
      } else if (statusFilter === 'bookmark') {
        if (!(state.bookmarks || []).includes(q.id)) return false;
      }

      // Search query check
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = q.question.toLowerCase().includes(query) ||
                          q.categoryTag.toLowerCase().includes(query) ||
                          q.number.toString() === query ||
                          (q.keyPoint && q.keyPoint.toLowerCase().includes(query));
        if (!textMatch) return false;
      }

      return true;
    });
  }, [allQuestions, state, categoryFilter, statusFilter, searchQuery]);

  return (
    <div className="pb-24">
      {/* Search and Filter Section */}
      <div className="sticky top-[74px] z-20 bg-slate-900/95 backdrop-blur-md pt-2 pb-3 border-b border-slate-800 -mx-3 px-3 shadow-md">
        {/* Search Input */}
        <div className="relative mb-2.5">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="キーワード・問番号で検索（例: 許容電流、3路、12）"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Category Filter Chips */}
        <div className="flex overflow-x-auto space-x-1.5 pb-2 no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { playClick(); setCategoryFilter(cat); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition ${
                categoryFilter === cat
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
              }`}
            >
              {cat === 'ALL' ? '全カテゴリ' : cat}
            </button>
          ))}
        </div>

        {/* Status Filter Chips */}
        <div className="flex gap-1.5 text-[11px]">
          <button
            onClick={() => { playClick(); setStatusFilter('ALL'); }}
            className={`flex-1 py-1 rounded-md font-bold transition text-center ${
              statusFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400'
            }`}
          >
            全問 ({allQuestions.length})
          </button>
          <button
            onClick={() => { playClick(); setStatusFilter('review'); }}
            className={`flex-1 py-1 rounded-md font-bold transition text-center flex items-center justify-center gap-1 ${
              statusFilter === 'review' ? 'bg-rose-500 text-white' : 'text-slate-400'
            }`}
          >
            <Flame size={12} />
            <span>要復習 ({allQuestions.filter(q => state.records[q.id]?.status === 'review').length})</span>
          </button>
          <button
            onClick={() => { playClick(); setStatusFilter('mastered'); }}
            className={`flex-1 py-1 rounded-md font-bold transition text-center flex items-center justify-center gap-1 ${
              statusFilter === 'mastered' ? 'bg-emerald-500 text-white' : 'text-slate-400'
            }`}
          >
            <Sparkles size={12} />
            <span>マスター ({allQuestions.filter(q => state.records[q.id]?.status === 'mastered').length})</span>
          </button>
          <button
            onClick={() => { playClick(); setStatusFilter('bookmark'); }}
            className={`flex-1 py-1 rounded-md font-bold transition text-center flex items-center justify-center gap-1 ${
              statusFilter === 'bookmark' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
            }`}
          >
            <Star size={12} className={statusFilter === 'bookmark' ? 'fill-slate-950' : ''} />
            <span>★ ({state.bookmarks?.length || 0})</span>
          </button>
        </div>
      </div>

      {/* Question Item Cards */}
      <div className="space-y-2 mt-3">
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            該当する問題が見つかりませんでした。
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const rec = state.records[q.id];
            const isBookmarked = (state.bookmarks || []).includes(q.id);

            return (
              <div
                key={q.id}
                onClick={() => {
                  playClick();
                  onSelectQuestion(q.id);
                }}
                className="p-3 rounded-2xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 active:scale-[0.99] transition cursor-pointer flex items-center justify-between gap-2 shadow-sm"
              >
                <div className="flex items-start space-x-3 overflow-hidden">
                  <span className="w-8 h-8 rounded-xl bg-slate-700/80 text-sky-400 font-black text-xs flex items-center justify-center shrink-0 border border-slate-600">
                    {q.number}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-900/60 px-1.5 py-0.2 rounded">
                        {q.categoryTag}
                      </span>
                      {rec?.status === 'mastered' && (
                        <span className="text-[10px] font-bold text-emerald-400">👑 マスター</span>
                      )}
                      {rec?.status === 'review' && (
                        <span className="text-[10px] font-bold text-rose-400">🔥 要復習</span>
                      )}
                    </div>

                    <h4 className="text-xs text-slate-200 font-medium truncate leading-tight">
                      {q.question}
                    </h4>

                    {q.keyPoint && (
                      <p className="text-[10px] text-amber-300/80 truncate mt-0.5">
                        💡 {q.keyPoint}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playClick();
                      onToggleBookmark(q.id);
                    }}
                    className={`p-1.5 rounded-lg ${
                      isBookmarked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <Star size={16} className={isBookmarked ? 'fill-amber-400' : ''} />
                  </button>
                  <ChevronRight size={16} className="text-slate-500" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
