// Storage and gamification state manager
import { updateSpacedRepetitionRecord } from './spacedRepetition';

const STORAGE_KEY = 'denkou2_mastery_state_v1';
// 記録の形式の版。
// 2 = 年度ごとに記録を分ける形式（records のキーが "r8_1_12" のような年度付き）
// 3 = マスター判定を「2回連続正解」にそろえた（旧判定のマスターを補正済み）
const STATE_SCHEMA_VERSION = 3;
const CURRENT_EXAM_STORAGE_KEY = 'denkou2_current_exam_id';
const FALLBACK_EXAM_ID = 'r8_1';

// 年度をまたいでも重ならない記録キー（例: r7_2 の問12 → "r7_2_12"）
export const recordKey = (examId, questionId) => `${examId}_${questionId}`;

export const LEVEL_TITLES = [
  { minLevel: 1, maxLevel: 4, title: '電工たまご 🐣', desc: '基礎を学び始めた見習い' },
  { minLevel: 5, maxLevel: 9, title: '駆け出し電気工 🛠️', desc: '基本回路を理解し始めた' },
  { minLevel: 10, maxLevel: 19, title: '一人前電工 ⚡', desc: '過去問の要点を掴んでいる' },
  { minLevel: 20, maxLevel: 34, title: '敏腕スペシャリスト 🔥', desc: '配線図もスラスラ解ける' },
  { minLevel: 35, maxLevel: 49, title: '電気工事マイスター 🏆', desc: '学習を積み重ねています。模擬試験でも確認しよう' },
  { minLevel: 50, maxLevel: 999, title: '電工神 (全問制覇) 👑', desc: '学習経験を重ねた証。別の回にも挑戦しよう' }
];

export const BADGES_DEF = [
  { id: 'first_spark', icon: '⚡', name: '初電通', desc: '初めて問題に正解した' },
  { id: 'speedy', icon: '⏱️', name: '電光石火', desc: '8秒以内に素早く正解した' },
  { id: 'combo_3', icon: '🔥', name: '3連続正解', desc: '3問連続で正解した' },
  { id: 'combo_5', icon: '💥', name: 'コンボマスター', desc: '5問連続で正解した' },
  { id: 'combo_10', icon: '🌟', name: '神ストリーク', desc: '10問連続で正解した' },
  { id: 'revenge', icon: '🛡️', name: 'リベンジ達成', desc: '間違えた問題を復習して正解した' },
  { id: 'calc_master', icon: '🧮', name: '計算の達人', desc: '計算問題を5問以上正解した' },
  { id: 'diagram_master', icon: '📐', name: '配線図マスター', desc: '配線図問題を10問以上正解した' },
  { id: 'level_10', icon: '🎖️', name: '一人前電工', desc: 'レベル10に到達した' },
  { id: 'all_master', icon: '👑', name: '全問完全マスター', desc: 'いずれかの年度の全問をすべてマスターした' },
];

export const getTitleForLevel = (level) => {
  const found = LEVEL_TITLES.find(t => level >= t.minLevel && level <= t.maxLevel);
  return found ? found.title : '電工たまご 🐣';
};

export const getInitialState = () => {
  return {
    records: {}, // questionId -> { attempts, correct, wrong, consecutiveCorrect, status, box, interval, ... }
    bookmarks: [],
    exp: 0,
    level: 1,
    streak: 0,
    maxStreak: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    totalTimeSpentSec: 0,
    responseTimes: [], // array of last 30 question response times in seconds
    badges: [],
    recentHistory: [], // last 20 answers
    // 年度ごとの進み具合: examId -> { round, currentQuestionId, currentQuizIndex }
    examProgress: {},
    // 日ごとの解答数: 'YYYY-MM-DD'（端末の日付）-> 解いた問題数（直近120日分）
    dailyLog: {},
    schemaVersion: STATE_SCHEMA_VERSION
  };
};

const readCurrentExamId = () => {
  try {
    return localStorage.getItem(CURRENT_EXAM_STORAGE_KEY) || FALLBACK_EXAM_ID;
  } catch (e) {
    return FALLBACK_EXAM_ID;
  }
};

// 旧判定では「正解→不正解→正解」のような連続していない2回正解でもマスターになっていた。
// 新しい判定（2回連続正解＝Box 3 以上）に合わない記録は「定着中」に戻す。
// 1つの年度の問題数（収録している年度はすべて50問）
const ALL_MASTER_QUESTION_COUNT = 50;

const normalizeLegacyRecord = (rec) => {
  if (!rec || rec.status !== 'mastered') return rec;
  if ((rec.box || 1) >= 3 || (rec.consecutiveCorrect || 0) >= 2) return rec;
  return { ...rec, status: 'correct' };
};

// 旧形式（問題番号だけのキー）の記録を、年度付きキーへ引き継ぐ。
// 旧形式では年度の区別が無かったため、最後に選んでいた年度の記録として扱う。
const migrateLegacyState = (parsed) => {
  const examId = readCurrentExamId();
  const isLegacyKey = (k) => /^\d+$/.test(String(k));

  const records = {};
  Object.entries(parsed.records || {}).forEach(([k, v]) => {
    records[isLegacyKey(k) ? recordKey(examId, k) : k] = v;
  });

  const bookmarks = [...new Set((parsed.bookmarks || []).map((id) => (isLegacyKey(id) ? recordKey(examId, id) : id)))];

  const examProgress = { ...(parsed.examProgress || {}) };
  if (!examProgress[examId]) {
    const attempted = Object.values(parsed.records || {}).filter((r) => r && r.attempts > 0).length;
    examProgress[examId] = {
      round: parsed.round || (attempted >= 50 ? 2 : 1),
      currentQuestionId: parsed.currentQuestionId ?? null,
      currentQuizIndex: parsed.currentQuizIndex ?? 0
    };
  }

  const recentHistory = (parsed.recentHistory || []).map((h) =>
    h && isLegacyKey(h.questionId) ? { ...h, questionId: recordKey(examId, h.questionId) } : h
  );

  const next = { ...parsed, records, bookmarks, examProgress, recentHistory, schemaVersion: STATE_SCHEMA_VERSION };
  delete next.round;
  delete next.currentQuestionId;
  delete next.currentQuizIndex;
  return next;
};

/**
 * 1つの年度だけを取り出した「年度ビュー」を返す。
 * records / bookmarks は問題番号（q.id）で引ける形になり、round・中断位置もその年度のもの。
 * レベル・EXP・バッジなどは全年度共通のまま。
 */
export const getExamView = (state, examId) => {
  const prefix = `${examId}_`;
  const records = {};
  Object.entries(state.records || {}).forEach(([k, v]) => {
    if (!k.startsWith(prefix)) return;
    const local = k.slice(prefix.length);
    if (/^\d+$/.test(local)) records[Number(local)] = v;
  });
  const bookmarks = (state.bookmarks || [])
    .filter((id) => typeof id === 'string' && id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)))
    .map((id) => Number(id.slice(prefix.length)));
  const progress = (state.examProgress || {})[examId] || {};
  return {
    ...state,
    records,
    bookmarks,
    round: progress.round || 1,
    currentQuestionId: progress.currentQuestionId ?? null,
    currentQuizIndex: progress.currentQuizIndex ?? 0
  };
};

export const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialState();
    let parsed = JSON.parse(raw);
    const version = parsed.schemaVersion || 1;
    const needsMigration = version < STATE_SCHEMA_VERSION;
    if (version < 2) {
      parsed = migrateLegacyState(parsed);
    }
    if (version < 3) {
      parsed = {
        ...parsed,
        records: Object.fromEntries(Object.entries(parsed.records || {}).map(([k, v]) => [k, normalizeLegacyRecord(v)]))
      };
      // 補正の結果、どの年度でも全問マスターになっていなければ「全問完全マスター」バッジも外す
      if ((parsed.badges || []).includes('all_master')) {
        const masteredByExam = {};
        Object.entries(parsed.records).forEach(([k, r]) => {
          const m = k.match(/^(.+)_\d+$/);
          if (m && r?.status === 'mastered') masteredByExam[m[1]] = (masteredByExam[m[1]] || 0) + 1;
        });
        const stillAllMastered = Object.values(masteredByExam).some((n) => n >= ALL_MASTER_QUESTION_COUNT);
        if (!stillAllMastered) parsed = { ...parsed, badges: parsed.badges.filter((b) => b !== 'all_master') };
      }
    }
    parsed.schemaVersion = STATE_SCHEMA_VERSION;
    const initial = getInitialState();
    const state = { ...initial, ...parsed };
    state.records = state.records || {};
    state.examProgress = state.examProgress || {};
    if (needsMigration) saveState(state);

    return state;
  } catch (e) {
    console.error('Failed to load state:', e);
    return getInitialState();
  }
};

export const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
};

export const saveCurrentQuizPosition = (state, { examId, questionId, index, round }) => {
  const prev = (state.examProgress || {})[examId] || {};
  const next = {
    ...state,
    examProgress: {
      ...(state.examProgress || {}),
      [examId]: {
        ...prev,
        currentQuestionId: questionId,
        currentQuizIndex: index !== undefined ? index : prev.currentQuizIndex,
        round: round !== undefined ? Math.max(round, prev.round || 1) : prev.round || 1
      }
    }
  };
  saveState(next);
  return next;
};

export const calculateExpForLevel = (level) => {
  // 10問程度集中して解いた節目（約1,000 EXP）でレベルアップする設計
  return Math.floor(1000 + (level - 1) * 500);
};

// Record an answer and compute gamification updates with Leitner / SRS integration
// examId と questionId（問題番号）から年度付きキーで記録する。totalQuestions はその年度の問題数。
export const recordAnswer = (prevState, { examId, questionId, isCorrect, timeSpentSec, category, totalQuestions = 50 }) => {
  const state = JSON.parse(JSON.stringify(prevState));
  const key = recordKey(examId, questionId);
  const examPrefix = `${examId}_`;
  const prevRecord = state.records[key] || {};
  const wasReview = prevRecord.status === 'review';

  state.totalAnswered += 1;
  state.totalTimeSpentSec += Math.round(timeSpentSec);

  // Update spaced repetition / Leitner record
  const currentRecord = updateSpacedRepetitionRecord(
    prevRecord,
    isCorrect,
    state.totalAnswered,
    timeSpentSec,
    category
  );

  // Keep last 30 response times for rolling average
  state.responseTimes = [...(state.responseTimes || []).slice(-29), Math.max(2, Math.round(timeSpentSec))];

  let earnedExp = 0;
  let newBadges = [];

  if (isCorrect) {
    state.totalCorrect += 1;
    state.streak += 1;
    if (state.streak > state.maxStreak) {
      state.maxStreak = state.streak;
    }

    earnedExp += 100; // 記録互換用。速度や連続正解では加点しない

    // Badge triggers
    if (!state.badges.includes('first_spark')) {
      newBadges.push('first_spark');
    }
    if (wasReview && !state.badges.includes('revenge')) {
      newBadges.push('revenge');
    }

  } else {
    state.streak = 0; // reset streak
    earnedExp += 20; // consolation EXP for learning!
  }

  // Check Category Badges
  const allRecords = Object.values(state.records);
  const correctCalc = allRecords.filter(r => r.category === '電気理論・計算' && r.correct > 0).length;
  if (category === '電気理論・計算' && isCorrect && correctCalc >= 5 && !state.badges.includes('calc_master')) {
    newBadges.push('calc_master');
  }
  const correctDiagram = allRecords.filter(r => r.category === '配線図問題' && r.correct > 0).length;
  if (category === '配線図問題' && isCorrect && correctDiagram >= 10 && !state.badges.includes('diagram_master')) {
    newBadges.push('diagram_master');
  }

  // Check all mastered (この年度の全問)
  const examRecordsAfter = Object.entries({ ...state.records, [key]: currentRecord })
    .filter(([k]) => k.startsWith(examPrefix))
    .map(([, r]) => r);
  const masteredCount = examRecordsAfter.filter(r => r.status === 'mastered').length;
  if (masteredCount >= totalQuestions && !state.badges.includes('all_master')) {
    newBadges.push('all_master');
  }

  // Level Up Check
  state.exp += earnedExp;
  let didLevelUp = false;
  let prevLevel = state.level;
  let expRequired = calculateExpForLevel(state.level);
  while (state.exp >= expRequired) {
    state.exp -= expRequired;
    state.level += 1;
    didLevelUp = true;
    expRequired = calculateExpForLevel(state.level);
  }

  if (state.level >= 10 && !state.badges.includes('level_10')) {
    newBadges.push('level_10');
  }

  state.badges = [...state.badges, ...newBadges];
  state.records[key] = currentRecord;

  // Check Round 1 completion (この年度の全問を1回ずつ解いたか)
  const countAttempted = (records) => Object.entries(records || {})
    .filter(([k, r]) => k.startsWith(examPrefix) && r && r.attempts > 0).length;
  const prevAttemptedCount = countAttempted(prevState.records);
  const newAttemptedCount = countAttempted(state.records);
  const didCompleteRound1 = prevAttemptedCount < totalQuestions && newAttemptedCount >= totalQuestions;

  state.examProgress = state.examProgress || {};
  const progress = { ...(state.examProgress[examId] || {}) };
  if (newAttemptedCount >= totalQuestions && (progress.round || 1) <= 1) {
    progress.round = 2;
  }
  progress.currentQuestionId = questionId;
  state.examProgress[examId] = progress;

  // 日ごとの解答数（今日解いた数・連続学習日数に使う）
  const today = toDateKey(new Date());
  const dailyLog = { ...(state.dailyLog || {}) };
  dailyLog[today] = (dailyLog[today] || 0) + 1;
  state.dailyLog = Object.fromEntries(Object.entries(dailyLog).sort(([a], [b]) => a.localeCompare(b)).slice(-120));

  // Recent History
  state.recentHistory = [
    { questionId: key, isCorrect, timestamp: Date.now() },
    ...(state.recentHistory || []).slice(0, 19)
  ];

  saveState(state);

  return {
    nextState: state,
    earnedExp,
    didLevelUp,
    oldLevel: prevLevel,
    newLevel: state.level,
    newBadges,
    currentRecord,
    didCompleteRound1
  };
};

// 端末の日付で 'YYYY-MM-DD'
export const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// 今日解いた問題数
export const getTodayCount = (state, now = new Date()) => (state.dailyLog || {})[toDateKey(now)] || 0;

// 連続学習日数（今日まだ解いていなくても、昨日まで続いていれば途切れていない扱い）
export const getStudyStreakDays = (state, now = new Date()) => {
  const log = state.dailyLog || {};
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!log[toDateKey(day)]) day.setDate(day.getDate() - 1);
  let count = 0;
  while (log[toDateKey(day)] > 0) {
    count += 1;
    day.setDate(day.getDate() - 1);
  }
  return count;
};

export const toggleBookmark = (prevState, questionId) => {
  const state = { ...prevState };
  const list = state.bookmarks || [];
  if (list.includes(questionId)) {
    state.bookmarks = list.filter(id => id !== questionId);
  } else {
    state.bookmarks = [...list, questionId];
  }
  saveState(state);
  return state;
};

// Compute remaining play time estimate for 100% completion
export const computeRemainingPlayTime = (state, totalQuestionsCount = 50) => {
  const records = state.records || {};
  const masteredCount = Object.values(records).filter(r => r.status === 'mastered').length;
  const remainingCount = Math.max(0, totalQuestionsCount - masteredCount);

  // Compute average time per question from actual session history
  const recentTimes = state.responseTimes && state.responseTimes.length > 0
    ? state.responseTimes
    : [20]; // 20 seconds default baseline
  
  const sum = recentTimes.reduce((a, b) => a + b, 0);
  const avgSeconds = Math.round(sum / recentTimes.length);

  // Retry factor: average user might need 1.25 attempts per remaining question
  const estimatedSeconds = Math.round(remainingCount * avgSeconds * 1.2);
  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;

  return {
    masteredCount,
    remainingCount,
    avgSeconds,
    estimatedSeconds,
    formattedText: remainingCount === 0 
      ? '🎉 全問完全制覇達成！' 
      : `あと約 ${minutes}分 ${seconds > 0 ? seconds + '秒' : ''}`,
    progressPercent: Math.round((masteredCount / totalQuestionsCount) * 100)
  };
};
