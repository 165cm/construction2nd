import React from 'react';
import CropImage from './CropImage';
import { getQuestionDiagram } from '../utils/questionDiagram';
import VisualChoices from './VisualChoices';
import ExplanationRenderer from './ExplanationRenderer';

export default function ExamResultDetails({ question }) {
  const diagram = getQuestionDiagram(question);
  return (
    <div className="mt-3 pt-3 border-t border-slate-700/60 animate-pop">
      <p className="text-xs text-slate-200 font-semibold mb-2 leading-relaxed">{question.question}</p>
      {diagram && <div className="my-3 bg-white rounded-xl p-2 flex justify-center">
        <CropImage cropKey={diagram.cropKey} defaultPath={diagram.path} alt="設問の図" className="max-h-64 object-contain" />
      </div>}
      <VisualChoices key={question.globalId} question={question} />
      <ExplanationRenderer explanation={question.explanation} answerChoice={question.answer} />
      {question.keyPoint && (
        <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">💡 {question.keyPoint}</div>
      )}
    </div>
  );
}
