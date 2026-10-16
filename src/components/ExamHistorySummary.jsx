import React from 'react';
import { EXAM_LIST } from '../data/examList';

export default function ExamHistorySummary({ histories = {} }) {
  const rows = EXAM_LIST.flatMap(exam => (histories[exam.id] || []).map(result => ({ exam, result })))
    .sort((a, b) => b.result.finishedAt - a.result.finishedAt);
  if (!rows.length) return null;
  return <section className="rounded-xl bg-slate-800 p-3 space-y-2" aria-label="模試の履歴">
    <h4 className="text-sm font-bold">模試の履歴</h4>
    <p className="text-xs text-slate-400">点数は利用期限後も確認できます。問題・解説の振り返りは、利用可能な年度の模試画面から開けます。</p>
    <ul className="space-y-2 max-h-64 overflow-y-auto">
      {rows.map(({exam, result}) => <li key={`${exam.id}:${result.id}`} className="border-t border-slate-700 pt-2 text-xs">
        <div className="flex justify-between gap-2"><span>{exam.name}</span><strong>{result.score}点</strong></div>
        <p className="text-slate-400 mt-1">{new Date(result.finishedAt).toLocaleString('ja-JP')} · 正解 {result.correctCount}/{result.totalCount}問 · {Math.floor(result.timeSpent / 60)}分{result.timeSpent % 60}秒</p>
      </li>)}
    </ul>
  </section>;
}
