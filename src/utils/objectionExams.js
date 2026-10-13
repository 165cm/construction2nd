// 「異議あり」の報告の年度を正しく読む
import { EXAM_LIST } from '../data/examList';
import { getExamQuestions } from '../data/examLoader';
import { getObjections } from './objections';

// 以前の不具合で、報告の年度がほぼ「令和7年度 下期」として保存されていた。
// 報告時の問題文（questionSnapshot）と各年度の問題文を照らし合わせ、正しい年度に読み替える。
export const resolveObjectionExams = (list) => {
  const examQuestions = Object.fromEntries(EXAM_LIST.map(e => [e.id, getExamQuestions(e.id)]));
  return list.map(item => {
    const snapText = item.questionSnapshot?.question;
    if (!snapText) return item;
    const sameAsRecorded = examQuestions[item.examId]?.find(q => q.id === item.questionId)?.question === snapText;
    if (sameAsRecorded) return item;
    const matched = EXAM_LIST.find(e => examQuestions[e.id].find(q => q.id === item.questionId)?.question === snapText);
    return matched ? { ...item, examId: matched.id, examName: matched.name } : item;
  });
};

// 年度を読み替えた報告の一覧
export const getResolvedObjections = () => resolveObjectionExams(getObjections());
