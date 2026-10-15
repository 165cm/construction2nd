import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const values = new Map();
let failWrites = false;
let writes = 0;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { writes++; if (failWrites) throw new Error('quota'); values.set(key, value); }
};
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { getInitialState, recordAnswer } = await server.ssrLoadModule('/src/utils/storage.js');
  const { recordExamResult } = await server.ssrLoadModule('/src/utils/examResults.js');
  const { hasUnsavedChanges, retryPendingSaves } = await server.ssrLoadModule('/src/utils/saveRecovery.js');
  const { getSharedExamQuestions } = await server.ssrLoadModule('/src/data/examLoader.js');
  const { default: ExamMode } = await server.ssrLoadModule('/src/components/ExamMode.jsx');
  const questions = getSharedExamQuestions('r8_1');
  const deadline = Date.now() + 7200000;
  const result = { id: `r8_1:${deadline}`, finishedAt: Date.now(), score: 2, correctCount: 1, totalCount: 50, timeSpent: 75, isPassed: false,
    details: questions.map((question, i) => ({ question, userAnswer: i === 0 ? question.answer : null, isCorrect: i === 0 })) };
  writes = 0;
  const saved = recordExamResult(getInitialState(), 'r8_1', result);
  assert.equal(writes, 1, '採点結果と解答記録を一度に保存');
  assert.equal(saved.nextState.totalAnswered, 1, '空欄は解答数に含めない');
  assert.equal(saved.nextState.totalTimeSpentSec, 75);
  assert.deepEqual(saved.nextState.responseTimes, [], '架空の20秒を回答速度へ混ぜない');
  const twice = recordExamResult(saved.nextState, 'r8_1', result);
  assert.equal(twice.nextState.totalAnswered, 1);
  assert.equal(twice.nextState.examResults.r8_1.length, 1);
  const reload = JSON.parse(values.get('denkou2_mastery_state_v1'));
  // 採点後のセッション消去が失敗しても結果があれば再採点しない。
  values.set('denkou2_exam_session_v1', JSON.stringify({ r8_1: { deadline, currentIdx: 0, answers: { 1: questions[0].answer } } }));
  const html = renderToStaticMarkup(React.createElement(ExamMode, { allQuestions: questions, currentExamMeta: { id: 'r8_1' }, resultHistory: reload.examResults.r8_1 }));
  assert.match(html, /全問の解答結果一覧/);
  assert.doesNotMatch(html, /採点する/);
  failWrites = true;
  const unsaved = recordExamResult(saved.nextState, 'r8_1', { ...result, id: 'second' });
  assert.equal(unsaved.saved, false);
  assert.equal(hasUnsavedChanges(), true);
  // 失敗後にさらに学習しても、再試行では最新値を保存する。
  const latest = recordAnswer(unsaved.nextState, { examId: 'r8_1', questionId: 2, isCorrect: false, timeSpentSec: 9 }).nextState;
  failWrites = false;
  assert.equal(retryPendingSaves(), true);
  assert.equal(hasUnsavedChanges(), false);
  assert.equal(JSON.parse(values.get('denkou2_mastery_state_v1')).totalAnswered, latest.totalAnswered);
  let historyState = latest;
  for (let i = 0; i < 12; i++) historyState = recordExamResult(historyState, 'r8_1', { ...result, id: `history-${i}` }).nextState;
  assert.equal(historyState.examResults.r8_1.length, 10);
  assert.equal(historyState.examResults.r8_1[0].id, 'history-11');
  console.log('PASS: atomic exam save, idempotency, reload, unanswered, timing, failed save recovery, history limit');
} finally { await server.close(); }
