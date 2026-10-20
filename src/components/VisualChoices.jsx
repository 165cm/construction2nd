import React, { useState } from 'react';
import AssetImage from './AssetImage';

// 原本の四肢を表示。名称や意味をalt・titleにも先出ししない。
export default function VisualChoices({ question }) {
  const [expanded, setExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  if (!question.visualChoices) return null;
  const source = `/choices/${question.examId}/${question.id}.webp`;
  const pageDir = question.examId === 'r8_1' ? '/pages' : `/pages/${question.examId}`;
  return (
    <section className="mb-4 rounded-xl border border-slate-600 bg-slate-900 p-2" aria-label="原本の選択肢">
      <p className="text-xs text-slate-300 mb-2">図・写真を見て、下のイ・ロ・ハ・ニから選んでください。</p>
        <div className="overflow-x-auto rounded-lg bg-white" tabIndex={expanded ? 0 : undefined}>
          <AssetImage path={source} alt="原本の選択肢イ・ロ・ハ・ニ"
            className={expanded ? 'max-w-none' : 'w-full h-auto'} style={expanded ? { width: 'max(100%, 900px)' } : undefined} />
        </div>

      <div className="flex items-center gap-3 text-xs mt-1">
        <button type="button" className="min-h-[44px] text-sky-300 underline"
          onClick={() => setExpanded(!expanded)}>{expanded ? '全体表示に戻す' : '拡大して見る（横スクロール）'}</button>
        <button type="button" className="min-h-[44px] text-slate-300 underline" onClick={() => setShowOriginal(v => !v)}>{showOriginal ? '原本ページを閉じる' : '原本ページ'}</button>
      </div>
      {showOriginal && <AssetImage path={pageDir + '/page_' + question.visualChoices.page + '.webp'} alt="原本ページ" className="w-full h-auto" />}
    </section>
  );
}
