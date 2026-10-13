// 管理画面で直した内容を「公開サイト（全端末）」へ反映するためのデータ作りと、未反映の件数の計算
//
// 管理画面の保存は、まず管理者のこのブラウザだけに残る。全端末に反映するには、
// 「反映用データ」をコピーしてAIに渡し、次の2つの共有ファイルに書き込んでもらう（→ PR → 公開）。
//   - src/data/cropOverrides.json   … 画像の切り抜き位置と、画像あり／なし（showImage）
//   - src/data/questionOverrides.json … 問題文・選択肢・正解・解説などの修正
import { exportAllCropsData, getSharedOverrides } from './customCrops';
import { getQuestionOverrides } from './objections';
import { EXAM_LIST } from '../data/examList';
import { getSharedExamQuestions, getSharedQuestionOverrides, QUESTION_TEXT_FIELDS } from '../data/examLoader';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 切り抜き位置の比較に使う項目（ラベルは見た目に関係しないので比べない）
const CROP_COMPARE_FIELDS = ['page', 'x', 'y', 'w', 'h', 'showImage'];
const pickCrop = (entry) => Object.fromEntries(CROP_COMPARE_FIELDS.map((f) => [f, entry?.[f] ?? null]));

// questionOverrides.json に書く内容（共有ファイルの今の内容＋このブラウザの修正のうち、公開中の内容と違う項目）
export const buildSharedQuestionOverrides = () => {
  const merged = JSON.parse(JSON.stringify(getSharedQuestionOverrides()));
  const local = getQuestionOverrides();
  EXAM_LIST.forEach((exam) => {
    const byQuestion = local[exam.id];
    if (!byQuestion) return;
    const sharedQuestions = getSharedExamQuestions(exam.id);
    Object.entries(byQuestion).forEach(([qid, override]) => {
      const base = sharedQuestions.find((q) => String(q.id) === String(qid));
      if (!base || !override) return;
      const diff = {};
      QUESTION_TEXT_FIELDS.forEach((f) => {
        if (override[f] !== undefined && !same(override[f], base[f])) diff[f] = override[f];
      });
      if (Object.keys(diff).length === 0) return;
      merged[exam.id] = merged[exam.id] || {};
      merged[exam.id][String(qid)] = { ...(merged[exam.id][String(qid)] || {}), ...diff };
    });
  });
  return merged;
};

// cropOverrides.json に書く内容。
// 画像あり／なし（showImage）は、公開中の状態と違う時だけ書く（問題文だけ直した問題に余計な設定を付けない）
const buildSharedCropOverrides = () => {
  const crops = JSON.parse(exportAllCropsData());
  const sharedCrops = getSharedOverrides();
  const sharedDiagramByKey = {};
  EXAM_LIST.forEach((exam) => {
    getSharedExamQuestions(exam.id).forEach((q) => {
      const key = exam.id === 'r8_1' ? String(q.id) : `${exam.id}_${q.id}`;
      sharedDiagramByKey[key] = Boolean(q.diagram);
    });
  });
  Object.keys(crops).forEach((key) => {
    const entry = crops[key];
    if (typeof entry.showImage !== 'boolean' || sharedCrops[key]?.showImage !== undefined) return;
    if (sharedDiagramByKey[key] === entry.showImage) {
      delete entry.showImage;
      if (typeof entry.page !== 'number') delete crops[key];
    }
  });
  return crops;
};

// AIに渡す「反映用データ」
export const buildPublishBundle = () => ({
  _説明: 'cropOverrides の中身を src/data/cropOverrides.json に、questionOverrides の中身を src/data/questionOverrides.json に、それぞれそのまま上書き保存してください。',
  cropOverrides: buildSharedCropOverrides(),
  questionOverrides: buildSharedQuestionOverrides()
});

// 公開サイトにまだ反映されていない変更の件数（切り抜き・画像あり／なし、問題文の修正）
export const countUnpublishedChanges = () => {
  const bundle = buildPublishBundle();
  const sharedCrops = getSharedOverrides();
  let crops = 0;
  Object.entries(bundle.cropOverrides).forEach(([key, entry]) => {
    if (!same(pickCrop(entry), pickCrop(sharedCrops[key]))) crops += 1;
  });

  const sharedQuestions = getSharedQuestionOverrides();
  let questions = 0;
  Object.entries(bundle.questionOverrides).forEach(([examId, byQuestion]) => {
    Object.entries(byQuestion || {}).forEach(([qid, fix]) => {
      if (!same(fix, sharedQuestions?.[examId]?.[qid])) questions += 1;
    });
  });

  return { crops, questions, total: crops + questions };
};
