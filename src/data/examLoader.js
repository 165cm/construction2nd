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

import { applyOverridesToQuestions, getQuestionOverrides } from '../utils/objections';
import sharedCropOverrides from './cropOverrides.json';
import sharedQuestionOverrides from './questionOverrides.json';

// 全端末に反映する問題文の修正（questionOverrides.json）で書き換えてよい項目
export const QUESTION_TEXT_FIELDS = ['question', 'choices', 'answer', 'explanation', 'keyPoint', 'category', 'categoryTag'];

// 共有ファイル（questionOverrides.json）の問題文の修正を合成する
const applySharedQuestionOverride = (examId, q) => {
  const fix = sharedQuestionOverrides?.[examId]?.[String(q.id)];
  if (!fix) return q;
  const next = { ...q };
  QUESTION_TEXT_FIELDS.forEach((f) => {
    if (fix[f] !== undefined) next[f] = fix[f];
  });
  return next;
};

export const getSharedQuestionOverrides = () => sharedQuestionOverrides || {};

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 管理者のブラウザ内の修正のうち「元データのままの値」で、その後に共有ファイルで直された項目か。
// 管理画面で別の項目を直して保存すると、触っていない項目も元データのまま一緒に保存される。
// その古い値で、あとから公開した修正（questionOverrides.json）を上書きしないために使う
export const isOutdatedLocalValue = (examId, questionId, field, value) => {
  const sharedValue = sharedQuestionOverrides?.[examId]?.[String(questionId)]?.[field];
  if (sharedValue === undefined || sameValue(value, sharedValue)) return false;
  const raw = (EXAM_DATA_MAP[examId] || []).find((q) => String(q.id) === String(questionId));
  return Boolean(raw) && sameValue(value, raw[field]);
};

// 共有ファイル（cropOverrides.json）の showImage で、問題の「画像あり／テキスト問題」を全端末にそろえる
const applySharedImageSetting = (examId, q) => {
  const key = examId === 'r8_1' ? String(q.id) : `${examId}_${q.id}`;
  const entry = sharedCropOverrides[key];
  const showImage = entry?.showImage;
  // 「画像あり」は切り抜き座標がそろっている時だけ（座標が無いと表示する画像が無いため）
  if (showImage === true && !q.diagram && typeof entry.page === 'number') {
    const diagram = examId === 'r8_1' ? `/crops/q${q.id}_diagram.png` : `/crops/${examId}/q${q.id}_diagram.png`;
    return { ...q, diagram };
  }
  if (showImage === false && q.diagram) {
    return { ...q, diagram: null };
  }
  return q;
};

// 問題文の原本ページ番号。データの fullPage が配線図ページを指している配線図問題は、
// 通常の出題レイアウト（問31〜40: P11、問41〜45: P12、問46〜50: P13）から求める
const getQuestionTextPage = (q, floorPlanPageNum) => {
  const m = (q.fullPage || '').match(/page_(\d+)\.png/);
  const raw = m ? parseInt(m[1], 10) : null;
  if (raw && raw !== floorPlanPageNum) return raw;
  if (q.id >= 46) return 13;
  if (q.id >= 41) return 12;
  if (q.id >= 31) return 11;
  return raw || 5;
};

// 年度によって分野名の書き方が違うため、アプリ共通の5分野にそろえる
// （そろえないと、分野別の成績・問題一覧の分野絞り込み・弱点特訓の分野絞り込みで0件になる）
const CATEGORY_ALIASES = {
  '配電理論・配線設計': '配線設計・機器',
  '配線器具・材料・工具': '材料・工具'
};
export const normalizeCategory = (category) => CATEGORY_ALIASES[category] || category;

export function getExamMeta(examId) {
  return EXAM_LIST.find(e => e.id === examId) || EXAM_LIST[0];
}

// 公開サイトの全端末で同じになる問題データ（元データ＋共有ファイルの修正。管理者のブラウザ内の修正は含まない）
export function getSharedExamQuestions(examId) {
  const meta = getExamMeta(examId);
  const rawList = EXAM_DATA_MAP[examId] || EXAM_DATA_MAP[DEFAULT_EXAM_ID];
  
  // 各問題に examId と globalId（年度をまたいでも一意なID）を付与
  const formattedList = rawList.map(q => {
    const globalId = `${meta.id}_${q.id}`;
    // 31問以降は配線図問題のため、原本配線図ページ（P15）を紐付け
    const isWiring = q.id >= 31;
    const floorPlanPageNum = meta.floorPlanPage || 15;
    // 共有ファイルの「画像あり／なし」と問題文の修正を反映
    const base = applySharedQuestionOverride(meta.id, applySharedImageSetting(meta.id, q));
    return {
      // 問題文が載っている原本ページ（配線図問題でも、問題文側の図や写真を切り抜くときに使う）
      questionPage: getQuestionTextPage(q, floorPlanPageNum),
      ...base,
      category: normalizeCategory(base.category),
      examId: meta.id,
      examName: meta.name,
      globalId,
      fullPage: isWiring
        ? `${meta.pageDir}/page_${floorPlanPageNum}.png`
        : (q.fullPage || `${meta.pageDir}/page_5.png`)
    };
  });

  return formattedList;
}

export function getExamQuestions(examId) {
  const meta = getExamMeta(examId);
  // 管理者画面等で保存されたローカルオーバーライド（この端末だけの手動修正）を合成反映
  const shared = getSharedExamQuestions(examId);
  const localFixes = getQuestionOverrides()[meta.id] || {};
  return applyOverridesToQuestions(meta.id, shared).map((q, i) => {
    const local = localFixes[q.id];
    if (!local) return q;
    // 元データのままの古い値は、共有ファイルの修正を優先する
    const next = { ...q };
    QUESTION_TEXT_FIELDS.forEach((f) => {
      if (local[f] !== undefined && isOutdatedLocalValue(meta.id, q.id, f, local[f])) next[f] = shared[i][f];
    });
    return next;
  });
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
