import React from 'react';
import VisualChoices from './VisualChoices';
import ExplanationRenderer from './ExplanationRenderer';

export default function ExamResultDetails({ question }) {
  return (
    <div className="mt-3 pt-3 border-t border-slate-700/60 animate-pop">
      <p className="text-xs text-slate-200 font-semibold mb-2 leading-relaxed">{question.question}</p>
      <VisualChoices key={question.globalId} question={question} />
      <ExplanationRenderer explanation={question.explanation} answerChoice={question.answer} />
      {question.keyPoint && (
        <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">💡 {question.keyPoint}</div>
      )}
    </div>
  );
}
