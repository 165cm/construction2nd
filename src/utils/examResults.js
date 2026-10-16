import { storageSafeState } from './paidHistory';
import { recordAnswer, saveState } from './storage';

// 結果と問題ごとの解答記録を同じ保存値へまとめ、採点途中の部分保存を防ぐ。
export function recordExamResult(state, examId, result) {
  const history = Array.isArray(state.examResults?.[examId]) ? state.examResults[examId] : [];
  if (history.some(item => item.id === result.id)) return { nextState: state, saved: saveState(state) };
  let nextState = state;
  for (const item of result.details) {
    if (item.userAnswer === undefined || item.userAnswer === null) continue;
    nextState = recordAnswer(nextState, {
      examId, questionId: item.question.id, isCorrect: item.isCorrect,
      timeSpentSec: null, category: item.question.category, totalQuestions: result.totalCount,
      persist: false
    }).nextState;
  }
  nextState = {
    ...nextState,
    totalTimeSpentSec: nextState.totalTimeSpentSec + result.timeSpent,
    examResults: { ...nextState.examResults, [examId]: [result, ...history].slice(0, 10) }
  };
  nextState = storageSafeState(nextState);
  return { nextState, saved: saveState(nextState) };
}
