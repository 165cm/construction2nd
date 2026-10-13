import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { OBJECTION_CATEGORIES, saveObjection, updateObjection, sendObjectionReport } from '../utils/objections';
import { isObjectionSendingEnabled, TURNSTILE_SITE_KEY } from '../config/objectionReport';
import { loadTurnstile } from '../utils/turnstile';
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
  // 送信の状態: 'idle' | 'sending' | 'sent'（GitHub に登録できた）| 'local'（この端末だけに保存）| 'error'
  const [sendStatus, setSendStatus] = useState('idle');
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef(null);
  const sendingEnabled = isObjectionSendingEnabled();

  // ロボット確認（Turnstile）を表示する。多くの場合は操作不要で自動的に終わる
  useEffect(() => {
    if (!isOpen || !sendingEnabled || isSubmitted) return undefined;
    let widgetId = null;
    let cancelled = false;
    setTurnstileToken(null);
    setTurnstileError(false);
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !turnstileRef.current) return;
        widgetId = ts.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          size: 'flexible',
          theme: 'dark',
          language: 'ja',
          callback: (token) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback': () => setTurnstileError(true)
        });
      })
      .catch(() => setTurnstileError(true));
    return () => {
      cancelled = true;
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [isOpen, sendingEnabled, isSubmitted]);

  if (!isOpen || !question) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sendStatus === 'sending') return;
    playClick();
    triggerHaptic('success');

    const catObj = OBJECTION_CATEGORIES.find(c => c.id === selectedCategory);

    const saved = saveObjection({
      // 問題データ自身が持つ年度を最優先（画面から渡される年度情報が無くても取り違えない）
      examId: question.examId || currentExamMeta?.id || 'r8_1',
      examName: question.examName || currentExamMeta?.name || '令和8年度 上期',
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

    // 送信先が設定されていれば、受付窓口へ送って GitHub の issue にする（失敗してもこの端末には保存済み）
    let status = 'local';
    if (sendingEnabled && saved) {
      setSendStatus('sending');
      try {
        const result = await sendObjectionReport(saved, turnstileToken);
        updateObjection(saved.id, { sentAt: new Date().toISOString(), issueNumber: result.number });
        status = 'sent';
      } catch (err) {
        console.error('Failed to send objection:', err);
        status = 'error';
      }
    }
    setSendStatus(status);
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      setSendStatus('idle');
      setComment('');
      onClose();
    }, status === 'error' ? 4000 : 2200);
  };

  const handleClose = () => {
    setIsSubmitted(false);
    setSendStatus('idle');
    setComment('');
    onClose();
  };

  // 送信ボタンを押せるか（送信先があるときは、ロボット確認が済んでから）
  const canSubmit = sendStatus !== 'sending' && (!sendingEnabled || Boolean(turnstileToken) || turnstileError);

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
                第 {question.number} 問（{question.examName || currentExamMeta?.name || ''}）
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
              {sendStatus === 'error' ? '送信できませんでした' : '異議申し立てを受理しました！'}
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
              {sendStatus === 'sent' && (<>ツッコミありがとうございます！<br />原本と照らし合わせて確認し、必要があれば修正します⚡️</>)}
              {sendStatus === 'local' && (<>ツッコミありがとうございます！<br />この端末に記録しました。</>)}
              {sendStatus === 'error' && (<>通信がうまくいきませんでした。時間をおいてもう一度お試しください。<br />（内容はこの端末に記録しました）</>)}
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

            {sendingEnabled && (
              <div className="space-y-1">
                <div ref={turnstileRef} className="min-h-[1px]" />
                <p className="text-[10px] text-slate-500 leading-snug">
                  ※ 報告は修正のため公開の場（GitHub）に記録されます。お名前など個人情報は書かないでください。
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full min-h-[44px] py-3 rounded-xl disabled:opacity-50 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/50 flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <span>
                {sendStatus === 'sending'
                  ? '送信中…'
                  : sendingEnabled && !turnstileToken && !turnstileError
                    ? 'ロボット確認中…'
                    : '⚡️ 異議を申し立てる！（送信）'}
              </span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
