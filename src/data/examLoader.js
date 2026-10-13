import { EXAM_LIST, DEFAULT_EXAM_ID } from './examList';
import r7_2 from './exams/r7_2.json';
import r7_1 from './exams/r7_1.json';
import r6_2 from './exams/r6_2.json';
import r6_1 from './exams/r6_1.json';
import r8_1 from './exams/r8_1.json';

const EXAM_DATA_MAP = {
  r7_2,
  r7_1,
  r6_2,
  r6_1,
  r8_1
};

import { applyOverridesToQuestions } from '../utils/objections';

export function getExamMeta(examId) {
  return EXAM_LIST.find(e => e.id === examId) || EXAM_LIST[0];
}

export function getExamQuestions(examId) {
  const meta = getExamMeta(examId);
  const rawList = EXAM_DATA_MAP[examId] || EXAM_DATA_MAP[DEFAULT_EXAM_ID];
  
  // 各問題に examId と globalId（年度をまたいでも一意なID）を付与
  const formattedList = rawList.map(q => {
    const globalId = `${meta.id}_${q.id}`;
    return {
      ...q,
      examId: meta.id,
      examName: meta.name,
      globalId,
      // 画像パスの年度補正（fullPage が /pages/ 始まりの相対パスのとき）
      fullPage: q.fullPage || `${meta.pageDir}/page_5.png`
    };
  });

  // 管理者画面等で保存されたローカルオーバーライド（手動修正/AI承認済みデータ）を合成反映
  return applyOverridesToQuestions(meta.id, formattedList);
}

const STORAGE_EXAM_KEY = 'denkou2_current_exam_id';

export function loadCurrentExamId() {
  try {
    const saved = localStorage.getItem(STORAGE_EXAM_KEY);
    if (saved && EXAM_DATA_MAP[saved]) {
      return saved;
    }
  } catch (e) {
    // ignore
  }
  return DEFAULT_EXAM_ID;
}

export function saveCurrentExamId(examId) {
  try {
    localStorage.setItem(STORAGE_EXAM_KEY, examId);
  } catch (e) {
    // ignore
  }
}
