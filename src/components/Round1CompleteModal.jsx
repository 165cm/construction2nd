import React from 'react';
import { Sparkles, Brain, CheckCircle2, ArrowRight } from 'lucide-react';
import { playClick } from '../utils/sound';

export default function Round1CompleteModal({ isOpen, onClose, reviewCount = 0 }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-pop">
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-sky-500/40 rounded-3xl w-full max-w-sm p-5 text-center shadow-2xl relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-20 bg-sky-500/20 blur-2xl pointer-events-none rounded-full" />

        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-amber-400 to-sky-400 flex items-center justify-center text-3xl shadow-lg shadow-sky-500/30">
          🎉
        </div>

        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300">
          全50問 第1巡 走破完了！
        </span>

        <h3 className="text-lg font-black text-white mt-2.5 mb-1.5">
          おめでとうございます！
        </h3>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          令和8年度上期の全50問へのファーストアタックが完了しました。
        </p>

        {/* Scientific Explanation Box */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 text-left mb-4 space-y-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-sky-400">
            <Brain size={16} />
            <span>ここからの学習方式（間隔反復 SRS）</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            エビングハウスの忘却曲線に基づき、あなたの記憶が薄れる直前の最適なタイミングで再出題します。
          </p>
          <ul className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-slate-700/50">
            <li className="flex items-start gap-1.5">
              <span className="text-rose-400 font-bold shrink-0">① 要復習 🔥:</span>
              <span>間違えた問題（{reviewCount}問）を最優先（3問以内）で再特訓</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-amber-400 font-bold shrink-0">② 間隔伸長 🌱:</span>
              <span>正解するごとに再出題の間隔（8問→20問→50問）が拡大</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-emerald-400 font-bold shrink-0">③ 完全マスター 👑:</span>
              <span>定着した問題は出題を控え、未マスター問題へ集中</span>
            </li>
          </ul>
        </div>

        <button
          onClick={() => {
            playClick();
            onClose();
          }}
          className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 active:scale-95 transition"
        >
          <span>忘却曲線 復習ループへ突入！</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
