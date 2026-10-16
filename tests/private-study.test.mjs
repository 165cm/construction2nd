import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({ define: { 'import.meta.env.VITE_PRIVATE_CONTENT': JSON.stringify('true') }, server: { middlewareMode:true,hmr:false,ws:false }, appType:'custom' });
globalThis.localStorage = { getItem:()=>null };
try {
  const store = await server.ssrLoadModule('/src/services/privateStudyStore.js');
  const { getExamQuestions, loadCurrentExamId } = await server.ssrLoadModule('/src/data/examLoader.js');
  const { getAssetUrl } = await server.ssrLoadModule('/src/utils/asset.js');
  assert.equal(getExamQuestions('r8_1').length, 50);
  assert.equal(getExamQuestions('r7_2').length, 0);
  assert.equal(getAssetUrl('/pages/r7_2/page_15.webp'), '');
  const generation = store.privateGeneration();
  const questions = [{ id:1, examId:'r7_2', question:'protected' }];
  const url = URL.createObjectURL(new Blob(['test']));
  assert.equal(store.publishPrivateExam({examId:'r7_2',questions,crops:{}},new Map([['pages/r7_2/page_15.webp',url]]),generation),true);
  assert.equal(getExamQuestions('r7_2')[0].question,'protected');
  assert.equal(getAssetUrl('/pages/r7_2/page_15.webp'),url);
  globalThis.localStorage = { getItem:()=> 'r7_2' };
  assert.equal(loadCurrentExamId(),'r8_1');
  store.clearPrivateStudy();
  assert.equal(getExamQuestions('r7_2').length,0);
  assert.equal(getAssetUrl('/pages/r7_2/page_15.webp'),'');
  assert.equal(store.publishPrivateExam({examId:'r7_2',questions},new Map(),generation),false);
  const { default: App } = await server.ssrLoadModule('/src/App.jsx');
  assert.match(renderToStaticMarkup(React.createElement(App)), /ログイン・料金・利用期限を確認/);
  console.log('PASS: paid content unavailable until loaded, free exam retained, assets in memory, stale generation rejected');
} finally { await server.close(); }
