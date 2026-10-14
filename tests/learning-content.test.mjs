import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { getSharedExamQuestions } = await server.ssrLoadModule('/src/data/examLoader.js');
  const { default: QuizCard } = await server.ssrLoadModule('/src/components/QuizCard.jsx');
  const { default: ExamMode } = await server.ssrLoadModule('/src/components/ExamMode.jsx');
  const { default: Explanation } = await server.ssrLoadModule('/src/components/ExplanationRenderer.jsx');
  const { CHEATSHEETS, QUESTION_CHEATSHEET_MAP, getCheatsheetsForQuestion } = await server.ssrLoadModule('/src/data/cheatsheets.js');
  const { getAutoAdvanceMode } = await server.ssrLoadModule('/src/utils/settings.js');
  const official = JSON.parse(fs.readFileSync('docs/audits/official-answers.json'));
  let count = 0, visuals = 0;
  for (const exam of ['r6_1','r6_2','r7_1','r7_2','r8_1']) {
    const questions = getSharedExamQuestions(exam);
    assert.equal(questions.length, 50);
    for (const q of questions) {
      count++;
      assert.equal(q.answer, official[exam][q.id - 1], `${q.globalId}: official answer`);
      assert.deepEqual(q.choices.map(c => c.id), ['イ','ロ','ハ','ニ']);
      assert.ok(q.question && q.explanation && q.keyPoint);
      assert.doesNotMatch(q.question + q.choices.map(c => c.text).join(''), /正解【|正解は|★|→正解/);
      // 実際の出題コンポーネントに秘密文字列を渡し、解答前の本文・alt等に出ないことを確認。
      const hidden = { ...q, explanation: 'SECRET_EXPLANATION', keyPoint: 'SECRET_KEYPOINT', categoryTag: 'SECRET_TAG' };
      const before = renderToStaticMarkup(React.createElement(QuizCard, { question: hidden, record: {}, currentExamMeta: { id: exam }, quizStep: {} }));
      assert.doesNotMatch(before, /SECRET_/);
      values.set('denkou2_exam_session_v1', JSON.stringify({ [exam]: { deadline: Date.now() + 7200000, answers: {}, currentIdx: 0, fixedOrder: true } }));
      const examHtml = renderToStaticMarkup(React.createElement(ExamMode, { allQuestions: [hidden], currentExamMeta: { id: exam } }));
      assert.doesNotMatch(examHtml, /SECRET_/);
      if (q.visualChoices) assert.match(examHtml, new RegExp(`choices/${exam}/${q.id}.webp`));
      const after = renderToStaticMarkup(React.createElement(Explanation, { explanation: q.explanation, answerChoice: q.answer }));
      assert.ok(after.replace(/<[^>]+>/g, '').length > 15, `${q.globalId}: visible explanation`);
      let columns = null;
      for (const line of q.explanation.split('\n')) {
        if (!line.startsWith('|')) { columns = null; continue; }
        const length = line.split('|').length;
        columns ??= length;
        assert.equal(length, columns, `${q.globalId}: table columns`);
      }
      if (q.visualChoices) {
        visuals++;
        assert.deepEqual(q.choices.map(c => c.text), ['図のイ','図のロ','図のハ','図のニ']);
        assert.ok(fs.existsSync(`public/choices/${exam}/${q.id}.webp`));
        assert.match(before, new RegExp(`choices/${exam}/${q.id}.webp`));
      }
      for (const sheet of getCheatsheetsForQuestion(q)) assert.ok(CHEATSHEETS[sheet.id]);
    }
  }
  assert.equal(count, 250); assert.equal(visuals, 62);
  for (const ids of Object.values(QUESTION_CHEATSHEET_MAP)) for (const id of ids) assert.ok(CHEATSHEETS[id], id);
  assert.equal(getAutoAdvanceMode(), 'off');
  values.set('denkou2_auto_advance_v1', 'correct_only'); assert.equal(getAutoAdvanceMode(), 'correct_only');
  assert.match(renderToStaticMarkup(React.createElement(Explanation, { explanation: '| 消えない解説 | 2160 kJ |' })), /2160 kJ/);
  console.log('PASS: 250 official answers, 250 quiz + 250 exam pre-answer screens and explanations, 62 visual choices, table structure, sheet IDs, saved settings, one-row explanation.');
} finally { await server.close(); }
