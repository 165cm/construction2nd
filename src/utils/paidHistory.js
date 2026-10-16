import { privateContentMode, isPaidExam } from '../services/privateStudyStore';

export function compactExamResult(result) {
  return {
    id: result.id, finishedAt: result.finishedAt, score: result.score,
    correctCount: result.correctCount, totalCount: result.totalCount,
    isPassed: result.isPassed, timeSpent: result.timeSpent,
    contentFormat: 'references-v1',
    details: result.details.map(item => ({ question: { id: item.question.id }, userAnswer: item.userAnswer ?? null, isCorrect: item.isCorrect }))
  };
}
export function stripPaidHistory(state) {
  if (!state?.examResults) return state;
  return { ...state, examResults: Object.fromEntries(Object.entries(state.examResults).map(([examId, results]) => [examId,
    isPaidExam(examId) && Array.isArray(results) ? results.map(compactExamResult) : results
  ])) };
}
export const storageSafeState = state => privateContentMode ? stripPaidHistory(state) : state;
export function hydrateExamResult(result, questions) {
  if (!result || result.contentFormat !== 'references-v1') return result;
  const byId = new Map(questions.map(q => [q.id, q]));
  return { ...result, details: result.details.map(item => ({ ...item, question: byId.get(item.question.id) || {
    id:item.question.id, question:'この問題の教材を再取得してください', explanation:'', choices:[], category:'教材未取得'
  } })) };
}
export function sanitizeBackupValue(key, value) {
  if (!privateContentMode || key !== 'denkou2_mastery_state_v1' || typeof value !== 'string') return value;
  return JSON.stringify(stripPaidHistory(JSON.parse(value)));
}
