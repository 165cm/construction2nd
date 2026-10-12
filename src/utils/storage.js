// Storage and gamification state manager
import { updateSpacedRepetitionRecord } from './spacedRepetition';

const STORAGE_KEY = 'denkou2_mastery_state_v1';

export const LEVEL_TITLES = [
  { minLevel: 1, maxLevel: 4, title: '電工たまご 🐣', desc: '基礎を学び始めた見習い' },
  { minLevel: 5, maxLevel: 9, title: '駆け出し電気工 🛠️', desc: '基本回路を理解し始めた' },
  { minLevel: 10, maxLevel: 19, title: '一人前電工 ⚡', desc: '過去問の要点を掴んでいる' },
  { minLevel: 20, maxLevel: 34, title: '敏腕スペシャリスト 🔥', desc: '配線図もスラスラ解ける' },
  { minLevel: 35, maxLevel: 49, title: '電気工事マイスター 🏆', desc: '学科試験合格圏内確実！' },
  { minLevel: 50, maxLevel: 999, title: '電工神 (全問制覇) 👑', desc: 'もはや迷いなし！満点合格レベル' }
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
  { id: 'all_master', icon: '👑', name: '全問完全マスター', desc: '全50問をすべてマスターした' },
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
    currentQuestionId: 1,
    currentQuizIndex: 0,
    round: 1
  };
};

export const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getInitialState();
    const parsed = JSON.parse(raw);
    const initial = getInitialState();
    const state = { ...initial, ...parsed };
    state.records = state.records || {};

    const attemptedCount = Object.values(state.records).filter(r => r && r.attempts > 0).length;
    if (!state.round) {
      state.round = attemptedCount >= 50 ? 2 : 1;
    }

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

export const saveCurrentQuizPosition = (state, { questionId, index, round }) => {
  const next = {
    ...state,
    currentQuestionId: questionId,
    currentQuizIndex: index !== undefined ? index : state.currentQuizIndex,
    round: round !== undefined ? round : state.round
  };
  saveState(next);
  return next;
};

export const calculateExpForLevel = (level) => {
  // Base EXP curve: Lv 1 -> 2 needs 150 exp, Lv 2 -> 3 needs 200 exp, etc.
  return Math.floor(100 + (level - 1) * 60);
};

// Record an answer and compute gamification updates with Leitner / SRS integration
export const recordAnswer = (prevState, { questionId, isCorrect, timeSpentSec, category }) => {
  const state = JSON.parse(JSON.stringify(prevState));
  const prevRecord = state.records[questionId] || {};
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

    // EXP Calculation: Base + Combo Bonus + Speed Bonus
    earnedExp += 100;
    if (state.streak >= 2) {
      earnedExp += Math.min(state.streak * 20, 150); // combo bonus
    }
    if (timeSpentSec <= 8) {
      earnedExp += 30; // speed bonus
    }

    // Badge triggers
    if (!state.badges.includes('first_spark')) {
      newBadges.push('first_spark');
    }
    if (timeSpentSec <= 8 && !state.badges.includes('speedy')) {
      newBadges.push('speedy');
    }
    if (state.streak >= 3 && !state.badges.includes('combo_3')) {
      newBadges.push('combo_3');
    }
    if (state.streak >= 5 && !state.badges.includes('combo_5')) {
      newBadges.push('combo_5');
    }
    if (state.streak >= 10 && !state.badges.includes('combo_10')) {
      newBadges.push('combo_10');
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

  // Check all mastered
  const masteredCount = Object.values(state.records).filter(r => r.status === 'mastered').length;
  if (masteredCount >= 50 && !state.badges.includes('all_master')) {
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
  state.records[questionId] = currentRecord;

  // Check Round 1 completion:
  const prevAttemptedCount = Object.values(prevState.records || {}).filter(r => r && r.attempts > 0).length;
  const newAttemptedCount = Object.values(state.records).filter(r => r && r.attempts > 0).length;
  const didCompleteRound1 = prevAttemptedCount < 50 && newAttemptedCount >= 50;
  if (newAttemptedCount >= 50 && (state.round || 1) <= 1) {
    state.round = 2;
  }

  state.currentQuestionId = questionId;

  // Recent History
  state.recentHistory = [
    { questionId, isCorrect, timestamp: Date.now() },
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
