import React from 'react';
import { X, CheckCircle2, Calendar, BookOpen, Sparkles, ChevronRight } from 'lucide-react';
import { EXAM_LIST } from '../data/examList';
import { playClick } from '../utils/sound';

export default function ExamSelectModal({
  isOpen,
  onClose,
  currentExamId,
  onSelectExam,
  state
}) {
  if (!isOpen) return null;

  const handleSelect = (examId) => {
    playClick();
    onSelectExam(examId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-pop">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/60">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📚</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">過去問の年度を選択</h2>
              <p className="text-[11px] text-slate-400">直近の学科筆記試験 全50問を収録</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 active:scale-95 transition"
            title="閉じる"
          >
            <X size={18} />
          </button>
        </div>

        {/* Exam List Body */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider px-1">
            収録過去問（全問無料サクサク学習）
          </div>

          {EXAM_LIST.map((exam) => {
            const isSelected = exam.id === currentExamId;
            return (
              <button
                key={exam.id}
                onClick={() => handleSelect(exam.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-sky-500/15 border-sky-400/80 shadow-md shadow-sky-500/10'
                    : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                    isSelected
                      ? 'bg-sky-500 text-white shadow'
                      : 'bg-slate-700 text-slate-300'
                  }`}>
                    {exam.badge}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-slate-100">{exam.name}</span>
                      {isSelected && (
                        <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-400/30 px-1.5 py-0.2 rounded font-bold">
                          選択中
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center space-x-1">
                        <Calendar size={11} className="text-slate-500" />
                        <span>{exam.examDate}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <BookOpen size={11} className="text-slate-500" />
                        <span>全{exam.questionCount}問</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  {isSelected ? (
                    <CheckCircle2 size={20} className="text-sky-400" />
                  ) : (
                    <ChevronRight size={18} className="text-slate-500" />
                  )}
                </div>
              </button>
            );
          })}

          {/* Premium Upcoming Notice */}
          <div className="mt-4 p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30">
            <div className="flex items-center space-x-2 text-amber-300 text-xs font-bold mb-1">
              <Sparkles size={14} className="text-amber-400" />
              <span>直近5回分 プレミアムパッケージ（準備中）</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              令和7年度・令和5年度を含む直近5回分の完全網羅版＆弱点AI自動克服モードを順次追加予定！
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-slate-800/60 border-t border-slate-700/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-lg active:scale-95 transition"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
