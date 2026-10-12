import React, { useState, useEffect, useRef } from 'react';
import { Star, FileText, CheckCircle2, XCircle, ArrowRight, RotateCcw, ZoomIn, Sparkles, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCorrect, playWrong, playCombo, playClick, triggerHaptic } from '../utils/sound';
import { getAssetUrl } from '../utils/asset';

export default function QuizCard({
  question,
  record,
  isBookmarked,
  onAnswer,
  onNext,
  onToggleBookmark,
  onOpenWiringDiagram,
  totalQuestions = 50,
  currentIndex = 0
}) {
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [showImageZoom, setShowImageZoom] = useState(false);
  const cardTopRef = useRef(null);

  // Reset state and scroll to top when question changes
  useEffect(() => {
    setSelectedChoice(null);
    setIsAnswered(false);
    setStartTime(Date.now());
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (cardTopRef.current) {
      cardTopRef.current.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [question.id]);

  const handleSelectChoice = (choiceId) => {
    if (isAnswered) return;
    
    playClick();
    const timeSpent = Math.max(1, (Date.now() - startTime) / 1000);
    const isCorrect = choiceId === question.answer;
    
    setSelectedChoice(choiceId);
    setIsAnswered(true);

    if (isCorrect) {
      playCorrect();
      triggerHaptic('success');
      // Confetti burst on correct answer
      confetti({
        particleCount: 45,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#38bdf8', '#0ea5e9', '#facc15', '#ffffff']
      });
    } else {
      playWrong();
      triggerHaptic('error');
    }

    onAnswer({
      questionId: question.id,
      isCorrect,
      timeSpentSec: timeSpent,
      category: question.category
    });
  };

  const getStatusBadge = () => {
    if (!record || record.status === 'unattempted') {
      return <span className="bg-slate-700/60 text-slate-300 text-[10px] px-2 py-0.5 rounded font-medium">未挑戦</span>;
    }
    if (record.status === 'mastered') {
      return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded font-bold">完全マスター 👑</span>;
    }
    if (record.status === 'review') {
      return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] px-2 py-0.5 rounded font-bold">要復習 🔥</span>;
    }
    return <span className="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] px-2 py-0.5 rounded font-medium">正解済 ✨</span>;
  };

  const areChoicesShort = question.choices.every(
    (c) => (c.text || '').length <= 13
  );

  return (
    <div ref={cardTopRef} className="flex flex-col min-h-[calc(100vh-140px)] pb-24">
      {/* Top Question Info Bar */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-black text-sky-400 bg-sky-950/60 border border-sky-500/40 px-2 py-0.5 rounded-lg text-sm">
            第 {question.number} 問
          </span>
          <span className="text-slate-400 text-[11px] font-medium bg-slate-800/80 px-2 py-0.5 rounded">
            {question.category} ({question.categoryTag})
          </span>
          {getStatusBadge()}
        </div>

        <button
          onClick={() => {
            playClick();
            onToggleBookmark(question.id);
          }}
          className={`p-1.5 rounded-lg border transition ${
            isBookmarked
              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
              : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
          }`}
          title="ブックマーク"
        >
          <Star size={16} className={isBookmarked ? 'fill-amber-400' : ''} />
        </button>
      </div>

      {/* Wiring Diagram Quick Button (For Q31-Q50) */}
      {question.category === '配線図問題' && (
        <button
          onClick={() => {
            playClick();
            onOpenWiringDiagram(question.wiringMark);
          }}
          className="mb-3.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-between shadow-lg shadow-sky-900/40 active:scale-[0.98] transition border border-sky-400/40 animate-pulseGlow"
        >
          <div className="flex items-center space-x-2">
            <FileText size={16} />
            <span>📄 配線図（15頁）を開く</span>
            {question.wiringMark && (
              <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded text-[11px] font-black">
                {question.wiringMark} を確認
              </span>
            )}
          </div>
          <span className="text-sky-200 text-[11px]">タップで図面表示 ➔</span>
        </button>
      )}

      {/* Question Body Card */}
      <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700/80 shadow-md mb-4">
        <h2 className="text-base font-semibold leading-relaxed text-slate-100 select-text">
          {question.question}
        </h2>

        {/* Diagram Image if available */}
        {question.diagram && (
          <div className="mt-3 relative group">
            <div
              onClick={() => setShowImageZoom(true)}
              className="bg-white rounded-xl p-2 cursor-pointer flex items-center justify-center border border-slate-600 shadow-inner overflow-hidden max-h-56"
            >
              <img
                src={getAssetUrl(question.diagram)}
                alt="問題の図・写真"
                className="max-h-52 object-contain"
              />
            </div>
            <button
              onClick={() => setShowImageZoom(true)}
              className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white text-[11px] px-2 py-1 rounded-md flex items-center gap-1 border border-slate-700"
            >
              <ZoomIn size={12} />
              <span>拡大</span>
            </button>
          </div>
        )}
      </div>

      {/* Choices Grid (2 columns if short, 1 column if long) */}
      <div className={`${areChoicesShort ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'} mb-5`}>
        {question.choices.map((choice) => {
          const isSelected = selectedChoice === choice.id;
          const isCorrect = choice.id === question.answer;

          let btnClass = 'bg-slate-800/90 text-slate-200 border-slate-700/80 hover:border-slate-600 active:scale-[0.99]';
          let badgeClass = 'bg-slate-700 text-slate-300';

          if (isAnswered) {
            if (isCorrect) {
              btnClass = 'bg-emerald-950/70 text-emerald-100 border-emerald-500 shadow-lg shadow-emerald-950/50';
              badgeClass = 'bg-emerald-500 text-slate-950 font-bold';
            } else if (isSelected && !isCorrect) {
              btnClass = 'bg-rose-950/70 text-rose-100 border-rose-500 shadow-lg shadow-rose-950/50';
              badgeClass = 'bg-rose-500 text-white font-bold';
            } else {
              btnClass = 'bg-slate-900/50 text-slate-500 border-slate-800 opacity-60';
              badgeClass = 'bg-slate-800 text-slate-500';
            }
          }

          return (
            <button
              key={choice.id}
              disabled={isAnswered}
              onClick={() => handleSelectChoice(choice.id)}
              className={`w-full ${
                areChoicesShort
                  ? 'p-3 min-h-[52px] items-center space-x-2.5'
                  : 'p-3.5 items-start space-x-3'
              } rounded-xl border text-left flex transition font-medium relative ${btnClass}`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0 font-black transition ${badgeClass}`}>
                {choice.id}
              </span>
              <span className={`flex-1 ${areChoicesShort ? 'text-xs sm:text-sm font-semibold' : 'text-sm pt-0.5'} leading-tight select-text`}>
                {choice.text}
              </span>
              {isAnswered && isCorrect && (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0 animate-pop" />
              )}
              {isAnswered && isSelected && !isCorrect && (
                <XCircle size={18} className="text-rose-400 shrink-0 animate-pop" />
              )}
            </button>
          );
        })}
      </div>

      {/* Answer & Explanation Card */}
      {isAnswered && (
        <div className="rounded-2xl border p-4 mb-4 animate-pop bg-slate-800/95 border-slate-700/80 shadow-xl">
          {/* Result Banner */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/70">
            <div className="flex items-center space-x-2">
              {selectedChoice === question.answer ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div>
                    <span className="text-emerald-400 font-black text-sm">正解！ お見事です！</span>
                    <span className="text-slate-400 text-xs ml-2">+100〜130 EXP</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                    ✕
                  </div>
                  <div>
                    <span className="text-rose-400 font-black text-sm">不正解… 復習リストに追加</span>
                    <span className="text-slate-400 text-xs ml-2">+20 EXP (学び)</span>
                  </div>
                </>
              )}
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400">正解：</span>
              <strong className="text-base text-emerald-400 font-black ml-1">
                【{question.answer}】
              </strong>
            </div>
          </div>

          {/* Detailed Explanation */}
          <div className="space-y-3 selectable-text">
            <div>
              <h4 className="text-xs font-bold text-sky-400 mb-1 flex items-center gap-1">
                <span>📖 詳しい解説</span>
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {question.explanation}
              </p>
            </div>

            {/* Key takeaway point */}
            {question.keyPoint && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200">
                <div className="flex items-center space-x-1.5 text-xs font-bold mb-1 text-amber-300">
                  <Sparkles size={14} />
                  <span>⚡ 試験直前！重要暗記ポイント</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-100">
                  {question.keyPoint}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-slate-700/70 flex gap-2">
            <button
              onClick={() => {
                playClick();
                setSelectedChoice(null);
                setIsAnswered(false);
                setStartTime(Date.now());
              }}
              className="py-3 px-4 rounded-xl bg-slate-700/80 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <RotateCcw size={14} />
              <span>もう一度</span>
            </button>

            <button
              onClick={() => {
                playClick();
                onNext();
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white text-sm font-black flex items-center justify-center gap-1.5 shadow-lg shadow-sky-600/30 active:scale-[0.98] transition"
            >
              <span>次の問題へ進む</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {showImageZoom && question.diagram && (
        <div
          onClick={() => setShowImageZoom(false)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
        >
          <div className="max-w-md w-full bg-white p-3 rounded-2xl shadow-2xl relative">
            <img
              src={getAssetUrl(question.diagram)}
              alt="拡大図"
              className="w-full object-contain max-h-[75vh]"
            />
            <button
              onClick={() => setShowImageZoom(false)}
              className="mt-3 w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
