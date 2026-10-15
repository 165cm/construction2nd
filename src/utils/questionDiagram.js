import { cropKeyForDiagram, isCropFromFloorPlan } from './customCrops';

// 選択肢画像とは別に必要な設問の図だけを残す。
export function getQuestionDiagram(question, meta = {}) {
  const examId = question.examId || meta.id;
  if (question.visualChoices?.stemBox) {
    return { path: `/choices/${examId}/${question.id}-stem.webp`, cropKey: `stem_${examId}_${question.id}`, floorPlan: false };
  }
  if (!question.diagram) return null;
  const cropKey = cropKeyForDiagram(question.id, question.diagram, examId);
  const floorPlan = question.id >= 31 && isCropFromFloorPlan(cropKey, meta.floorPlanPage || 15);
  if (question.visualChoices && !floorPlan) return null;
  return { path: question.diagram, cropKey, floorPlan };
}
