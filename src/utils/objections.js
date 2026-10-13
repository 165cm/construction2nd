// 異議申し立て（ユーザー報告＆AI修正提案）データ管理
import { OBJECTION_ENDPOINT } from '../config/objectionReport';
const OBJECTIONS_STORAGE_KEY = 'denkou2_objections_v1';
const QUESTION_OVERRIDES_STORAGE_KEY = 'denkou2_question_overrides_v1';

export const OBJECTION_CATEGORIES = [
  { id: 'choice_text', label: '選択肢の文字・数字が違う', icon: '📝' },
  { id: 'wrong_answer', label: '正解が間違っている気がする', icon: '🎯' },
  { id: 'diagram_issue', label: '図面・写真がずれている / 違う', icon: '🖼️' },
  { id: 'explanation_typo', label: '解説に誤字・わかりにくい点がある', icon: '💡' },
  { id: 'other', label: 'その他ツッコミ', icon: '💬' }
];

export const getObjections = () => {
  try {
    const raw = localStorage.getItem(OBJECTIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to get objections:', e);
    return [];
  }
};

export const saveObjection = (objectionData) => {
  try {
    const list = getObjections();
    const newEntry = {
      id: 'obj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      createdAt: new Date().toISOString(),
      status: 'pending', // 'pending' | 'approved' | 'rejected'
      ...objectionData
    };

    // AI修正提案を自動生成
    newEntry.aiSuggestedFix = generateAiSuggestedFix(newEntry);

    list.unshift(newEntry);
    localStorage.setItem(OBJECTIONS_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('objections-updated'));
    return newEntry;
  } catch (e) {
    console.error('Failed to save objection:', e);
    return null;
  }
};

export const updateObjection = (id, updates) => {
  try {
    const list = getObjections();
    const idx = list.findIndex(o => o.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      localStorage.setItem(OBJECTIONS_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event('objections-updated'));
      return true;
    }
  } catch (e) {
    console.error('Failed to update objection:', e);
  }
  return false;
};

export const deleteObjection = (id) => {
  try {
    const list = getObjections().filter(o => o.id !== id);
    localStorage.setItem(OBJECTIONS_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event('objections-updated'));
    return true;
  } catch (e) {
    console.error('Failed to delete objection:', e);
    return false;
  }
};

// AI自動修正提案エンジン
export const generateAiSuggestedFix = (objection) => {
  const { category, userComment = '', questionSnapshot } = objection;
  const comment = userComment.trim();

  if (category === 'wrong_answer') {
    return {
      type: 'answer_correction',
      title: '公式正解の再照合と修正提案',
      explanation: '公式解答データと照合し、正解選択肢および解説の強調記号を再同期します。',
      actionLabel: '公式正解の整合性を承認'
    };
  }

  if (category === 'choice_text') {
    return {
      type: 'choice_text_correction',
      title: '選択肢テキストの修正提案',
      explanation: `ユーザーの指摘「${comment || '原本と異なる'}」に基づき、原本PDFの表記に合わせてテキストを整形・更新します。`,
      actionLabel: '選択肢テキストの修正を承認'
    };
  }

  if (category === 'diagram_issue') {
    return {
      type: 'diagram_recalibration',
      title: '図面・写真のトリミング再調整提案',
      explanation: '問題図面の切り抜き範囲を原本ページの該当箇所へ最適化補正します。',
      actionLabel: '図面トリミングを再調整'
    };
  }

  return {
    type: 'general_review',
    title: '解説・要点テーブルの改善提案',
    explanation: `指摘内容「${comment || '確認希望'}」を反映した解説テキストの最適化を行います。`,
    actionLabel: '改善案を承認'
  };
};

// 問題データの手動オーバーライド管理
export const getQuestionOverrides = () => {
  try {
    const raw = localStorage.getItem(QUESTION_OVERRIDES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to get question overrides:', e);
    return {};
  }
};

export const getQuestionOverride = (examId, questionId) => {
  const overrides = getQuestionOverrides();
  return overrides[examId]?.[questionId] || null;
};

export const saveQuestionOverride = (examId, questionId, updatedQuestion) => {
  try {
    const current = getQuestionOverrides();
    const examKey = examId || 'default';
    if (!current[examKey]) current[examKey] = {};
    current[examKey][questionId] = {
      ...updatedQuestion,
      _modifiedAt: new Date().toISOString()
    };
    localStorage.setItem(QUESTION_OVERRIDES_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event('question-overrides-updated'));
    return true;
  } catch (e) {
    console.error('Failed to save question override:', e);
    return false;
  }
};

export const deleteQuestionOverride = (examId, questionId) => {
  try {
    const current = getQuestionOverrides();
    const examKey = examId || 'default';
    if (current[examKey] && current[examKey][questionId]) {
      delete current[examKey][questionId];
      if (Object.keys(current[examKey]).length === 0) {
        delete current[examKey];
      }
      localStorage.setItem(QUESTION_OVERRIDES_STORAGE_KEY, JSON.stringify(current));
      window.dispatchEvent(new Event('question-overrides-updated'));
      return true;
    }
  } catch (e) {
    console.error('Failed to delete question override:', e);
  }
  return false;
};

export const clearQuestionOverrides = () => {
  try {
    localStorage.removeItem(QUESTION_OVERRIDES_STORAGE_KEY);
    window.dispatchEvent(new Event('question-overrides-updated'));
    return true;
  } catch (e) {
    console.error('Failed to clear overrides:', e);
    return false;
  }
};

export const importQuestionOverrides = (jsonData) => {
  try {
    const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid JSON format');
    }
    const current = getQuestionOverrides();
    const merged = { ...current, ...parsed };
    localStorage.setItem(QUESTION_OVERRIDES_STORAGE_KEY, JSON.stringify(merged));
    window.dispatchEvent(new Event('question-overrides-updated'));
    return { success: true, count: Object.keys(merged).reduce((acc, k) => acc + Object.keys(merged[k] || {}).length, 0) };
  } catch (e) {
    console.error('Failed to import question overrides:', e);
    return { success: false, error: e.message };
  }
};

export const exportAllOverrides = () => {
  return JSON.stringify(getQuestionOverrides(), null, 2);
};

// 与えられた問題リストにローカル保存済みの修正オーバーライドを自動合成
export const applyOverridesToQuestions = (examId, questionsList) => {
  if (!Array.isArray(questionsList)) return questionsList;
  const overrides = getQuestionOverrides();
  const examOverrides = overrides[examId] || {};
  if (Object.keys(examOverrides).length === 0) return questionsList;

  return questionsList.map(q => {
    const override = examOverrides[q.id];
    if (override) {
      return {
        ...q,
        ...override,
        _isOverridden: true
      };
    }
    return q;
  });
};

// 受付窓口（Cloudflare Workers）へ送り、GitHub の issue として登録する。成功なら { ok: true, number }
export const sendObjectionReport = async (objection, turnstileToken) => {
  const res = await fetch(OBJECTION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      examId: objection.examId,
      examName: objection.examName,
      questionNumber: objection.questionNumber,
      category: objection.category,
      comment: objection.userComment || '',
      questionSnapshot: objection.questionSnapshot,
      turnstileToken
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};
