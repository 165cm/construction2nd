import React, { useState } from 'react';
import { getAssetUrl } from '../utils/asset';

// 原本の四肢を表示。名称や意味をalt・titleにも先出ししない。
export default function VisualChoices({ question }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!question.visualChoices) return null;
  const source = getAssetUrl(`/choices/${question.examId}/${question.id}.webp`);
  const pageDir = question.examId === 'r8_1' ? '/pages' : `/pages/${question.examId}`;
  return (
    <section className="mb-4 rounded-xl border border-slate-600 bg-slate-900 p-2" aria-label="原本の選択肢">
      <p className="text-xs text-slate-300 mb-2">図・写真を見て、下のイ・ロ・ハ・ニから選んでください。</p>
      {!failed && (
        <div className="overflow-x-auto rounded-lg bg-white" tabIndex={expanded ? 0 : undefined}>
          <img src={source} alt="原本の選択肢イ・ロ・ハ・ニ" onError={() => setFailed(true)}
            className={expanded ? 'max-w-none' : 'w-full h-auto'} style={expanded ? { width: 'max(100%, 900px)' } : undefined} />
        </div>
      )}
      {failed && <p className="text-xs text-amber-300">選択肢の画像を読み込めませんでした。原本ページで確認してください。</p>}
      <div className="flex items-center gap-3 text-xs mt-1">
        {!failed && <button type="button" className="min-h-[44px] text-sky-300 underline"
          onClick={() => setExpanded(!expanded)}>{expanded ? '全体表示に戻す' : '拡大して見る（横スクロール）'}</button>}
        <a className="min-h-[44px] inline-flex items-center text-slate-300 underline" href={getAssetUrl(`${pageDir}/page_${question.visualChoices.page}.webp`)} target="_blank" rel="noreferrer">原本ページ</a>
      </div>
    </section>
  );
}
