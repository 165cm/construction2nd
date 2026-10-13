import React, { useState } from 'react';
import { X, Send, Sparkles, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { OBJECTION_CATEGORIES, saveObjection } from '../utils/objections';
import { playClick, triggerHaptic } from '../utils/sound';

export default function ObjectionModal({
  isOpen,
  onClose,
  question,
  currentExamMeta
}) {
  const [selectedCategory, setSelectedCategory] = useState('choice_text');
  const [comment, setComment] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen || !question) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    playClick();
    triggerHaptic('success');

    const catObj = OBJECTION_CATEGORIES.find(c => c.id === selectedCategory);

    saveObjection({
      examId: currentExamMeta?.id || 'r7_2',
      examName: currentExamMeta?.name || '令和7年度 下期',
      questionId: question.id,
      questionNumber: question.number,
      category: selectedCategory,
      categoryLabel: catObj ? catObj.label : 'その他',
      userComment: comment,
      questionSnapshot: {
        question: question.question,
        choices: question.choices,
        answer: question.answer,
        diagram: question.diagram
      }
    });

    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setComment('');
      onClose();
    }, 2200);
  };

  const handleClose = () => {
    setIsSubmitted(false);
    setComment('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-pop">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-b border-amber-500/30">
          <div className="flex items-center space-x-2">
            <span className="text-xl animate-bounce">⚡️</span>
            <div>
              <h3 className="font-black text-sm text-amber-300 flex items-center gap-1.5">
                <span>この問題に異議あり！</span>
              </h3>
              <p className="text-[10px] text-slate-400">
                第 {question.number} 問（{currentExamMeta?.name || ''}）
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        {isSubmitted ? (
          <div className="p-6 text-center animate-pop">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-500/40 text-3xl">
              ⚖️
            </div>
            <h4 className="font-black text-base text-white mb-1">
              異議申し立てを受理しました！
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
              ツッコミありがとうございます！<br />
              AIと管理者が原本と照合して精査し、アプリへ即座に反映します⚡️
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
            <div className="text-[11px] text-slate-300 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 leading-snug">
              「選択肢の文字が原本と違う！」「正解おかしくない？」などの違和感があれば、5秒でツッコミを入れてください！
            </div>

            {/* Quick Categories */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-400">
                どこに異議がありますか？（タップで選択）
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {OBJECTION_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => { playClick(); setSelectedCategory(cat.id); }}
                    className={`py-2 px-3 rounded-xl border text-left text-xs font-semibold flex items-center space-x-2 transition ${
                      selectedCategory === cat.id
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm shadow-amber-950'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-sm">{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Comment Area */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                <span>ひとことツッコミ（任意）</span>
                <span className="text-[10px] text-slate-500">例: ハの数字が30Aではなく20A</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="気になった点をひとこと教えてください（空欄でも送信できます）"
                rows={2}
                className="w-full p-2.5 text-xs bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/50 flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <span>⚡️ 異議を申し立てる！（送信）</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
