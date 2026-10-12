import React from 'react';
import { X, Scale, ExternalLink, ShieldCheck, BookOpen } from 'lucide-react';
import { ATTRIBUTION_CONFIG } from '../data/attribution';
import { playClick } from '../utils/sound';

export default function AttributionModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-pop">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-slate-800/50 shrink-0">
          <div className="flex items-center space-x-2">
            <Scale className="text-sky-400" size={18} />
            <h3 className="font-black text-sm text-white">著作権・過去問の出典について</h3>
          </div>
          <button
            onClick={() => { playClick(); onClose(); }}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-300 leading-relaxed">
          {/* Summary Box */}
          <div className="p-3.5 rounded-2xl bg-sky-950/40 border border-sky-500/30 text-sky-200">
            <div className="flex items-center gap-1.5 font-black text-sky-300 text-xs mb-1">
              <ShieldCheck size={15} />
              <span>電気技術者試験センターの留意事項への準拠</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              当アプリは、一般財団法人 電気技術者試験センターが公表する過去問題利用ガイドラインに則り、適正に出典・著作権・利用目的・改変内容を明記して運用しています。
            </p>
          </div>

          {/* 1. 出典 */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              <span>出典の明記</span>
            </h4>
            <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 font-medium">
              {ATTRIBUTION_CONFIG.sourceCredit}
            </div>
          </div>

          {/* 2. 著作権 */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              <span>著作権について</span>
            </h4>
            <p className="text-slate-300 text-[11px]">
              {ATTRIBUTION_CONFIG.copyrightNotice}
            </p>
          </div>

          {/* 3. 使用目的 */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>使用目的（教育目的）</span>
            </h4>
            <p className="text-slate-300 text-[11px]">
              {ATTRIBUTION_CONFIG.purposeNotice}
            </p>
          </div>

          {/* 4. 改変に関する明記 */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-white flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
              <span>問題の改変・表示調整について</span>
            </h4>
            <p className="text-slate-300 text-[11px]">
              {ATTRIBUTION_CONFIG.modificationNotice}
            </p>
          </div>

          {/* Official Link */}
          <div className="pt-2">
            <a
              href={ATTRIBUTION_CONFIG.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 flex items-center justify-between text-sky-400 hover:text-sky-300 transition"
            >
              <div className="flex items-center gap-2">
                <BookOpen size={14} />
                <span className="font-bold text-[11px]">
                  電気技術者試験センター 公式サイト（Q&A・利用留意事項）
                </span>
              </div>
              <ExternalLink size={13} className="shrink-0" />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-800/40 text-center shrink-0">
          <button
            onClick={() => { playClick(); onClose(); }}
            className="w-full py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs active:scale-95 transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
