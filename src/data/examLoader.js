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
import sharedCropOverrides from './cropOverrides.json';

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
const normalizeCategory = (category) => CATEGORY_ALIASES[category] || category;

export function getExamMeta(examId) {
  return EXAM_LIST.find(e => e.id === examId) || EXAM_LIST[0];
}

export function getExamQuestions(examId) {
  const meta = getExamMeta(examId);
  const rawList = EXAM_DATA_MAP[examId] || EXAM_DATA_MAP[DEFAULT_EXAM_ID];
  
  // 各問題に examId と globalId（年度をまたいでも一意なID）を付与
  const formattedList = rawList.map(q => {
    const globalId = `${meta.id}_${q.id}`;
    // 31問以降は配線図問題のため、原本配線図ページ（P15）を紐付け
    const isWiring = q.id >= 31;
    const floorPlanPageNum = meta.floorPlanPage || 15;
    return {
      // 問題文が載っている原本ページ（配線図問題でも、問題文側の図や写真を切り抜くときに使う）
      questionPage: getQuestionTextPage(q, floorPlanPageNum),
      ...applySharedImageSetting(meta.id, q),
      category: normalizeCategory(q.category),
      examId: meta.id,
      examName: meta.name,
      globalId,
      fullPage: isWiring
        ? `${meta.pageDir}/page_${floorPlanPageNum}.png`
        : (q.fullPage || `${meta.pageDir}/page_5.png`)
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
