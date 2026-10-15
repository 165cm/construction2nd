// Spaced Repetition Engine based on Ebbinghaus Forgetting Curve & Leitner Box System

export const BOX_LEVELS = {
  1: { level: 1, name: '要復習', badge: '要復習 🔥', interval: 3, desc: '間違えた問題。復習モードで確認' },
  2: { level: 2, name: '初期定着', badge: '定着中 🌱', interval: 8, desc: '1回正解。約8問後に忘却防止チェック' },
  3: { level: 3, name: '中期定着', badge: '安定 🌿', interval: 20, desc: '2回連続正解。約20問後に長期定着確認' },
  4: { level: 4, name: '3回以上連続正解', badge: 'マスター 👑', interval: 50, desc: '3回以上連続正解。日をあけて再確認' }
};

/**
 * Updates a question record using Leitner Box & Spaced Repetition intervals
 */
export const updateSpacedRepetitionRecord = (prevRecord = {}, isCorrect, currentTotalAnswered, timeSpentSec = 20, category = '') => {
  const current = {
    attempts: 0,
    correct: 0,
    wrong: 0,
    consecutiveCorrect: 0,
    bestTimeSec: 999,
    box: 1,
    interval: 3,
    answeredAtCount: 0,
    lastAnsweredAt: 0,
    status: 'unattempted',
    ...prevRecord
  };

  current.attempts += 1;
  current.answeredAtCount = currentTotalAnswered;
  current.lastAnsweredAt = Date.now();
  if (category) current.category = category;

  if (isCorrect) {
    current.correct += 1;
    current.consecutiveCorrect += 1;
    if (timeSpentSec < current.bestTimeSec) {
      current.bestTimeSec = Math.round(timeSpentSec * 10) / 10;
    }

    // Advance box: Box 1 -> Box 2 -> Box 3 -> Box 4 (max)
    const nextBox = Math.min(4, (current.box || 1) + 1);
    current.box = nextBox;
    current.interval = BOX_LEVELS[nextBox].interval;

    // Mastery criteria: 2回連続正解（Box 3 以上）。間違えた後の1回正解ではマスターにしない
    if (nextBox >= 3 || current.consecutiveCorrect >= 2) {
      current.status = 'mastered';
    } else {
      current.status = 'correct';
    }
  } else {
    current.wrong += 1;
    current.consecutiveCorrect = 0;
    // Scientific rule: On failure, memory lapses -> reset to Box 1 for immediate short-term retrieval
    current.box = 1;
    current.interval = BOX_LEVELS[1].interval; // 3 questions
    current.status = 'review';
  }

  return current;
};

/**
 * Gets the initial question to resume upon app startup or refresh:
 * - In Round 1: Resumes from where left off (if Q10 answered, resumes at Q11).
 * - In Round 2+: Picks the highest priority review question via Spaced Repetition.
 */
export const getInitialResumeQuestion = (allQuestions, state) => {
  if (!allQuestions || allQuestions.length === 0) return null;

  const records = state.records || {};
  const attemptedCount = allQuestions.filter(q => records[q.id]?.attempts > 0).length;
  const isFirstRound = attemptedCount < allQuestions.length && (state.round || 1) <= 1;

  if (isFirstRound) {
    // 1. If state.currentQuestionId is saved and NOT attempted yet, resume directly
    if (state.currentQuestionId) {
      const savedQ = allQuestions.find(q => q.id === state.currentQuestionId);
      const isUnattempted = savedQ && (!records[savedQ.id] || records[savedQ.id].attempts === 0);
      if (isUnattempted) {
        const qIdx = allQuestions.findIndex(q => q.id === savedQ.id);
        return {
          question: savedQ,
          index: qIdx >= 0 ? qIdx : 0,
          isFirstRound: true,
          round: 1,
          modeDescription: '第1巡：全問走破中',
          progressText: `${attemptedCount + 1} / ${allQuestions.length} 問`
        };
      }

      // If saved question was ALREADY answered (e.g. user quit after answering Q10 without hitting next),
      // advance to the next unattempted question!
      const savedIdx = allQuestions.findIndex(q => q.id === state.currentQuestionId);
      if (savedIdx !== -1) {
        for (let i = savedIdx + 1; i < allQuestions.length; i++) {
          const q = allQuestions[i];
          if (!records[q.id] || records[q.id].attempts === 0) {
            return {
              question: q,
              index: i,
              isFirstRound: true,
              round: 1,
              modeDescription: '第1巡：全問走破中',
              progressText: `${attemptedCount + 1} / ${allQuestions.length} 問`
            };
          }
        }
      }
    }

    // 2. Otherwise find the first unattempted question in 1..50
    const firstUnattemptedIdx = allQuestions.findIndex(q => !records[q.id] || records[q.id].attempts === 0);
    if (firstUnattemptedIdx !== -1) {
      return {
        question: allQuestions[firstUnattemptedIdx],
        index: firstUnattemptedIdx,
        isFirstRound: true,
        round: 1,
        modeDescription: '第1巡：全問走破中',
        progressText: `${attemptedCount + 1} / ${allQuestions.length} 問`
      };
    }
  }

  // Round 2 or all attempted: use adaptive spaced repetition
  return determineNextQuizQuestion(allQuestions, state, state.currentQuestionId);
};

/**
 * Determines the next question according to the user's progress:
 * Phase 1 (1周目): Sequential first pass (問1〜問50) with instant resume.
 * Phase 2 (2周目以降): Adaptive Spaced Repetition review priority queue.
 */
export const determineNextQuizQuestion = (allQuestions, state, currentQuestionId = null) => {
  if (!allQuestions || allQuestions.length === 0) return null;

  const records = state.records || {};
  const currentTotal = state.totalAnswered || 0;

  // Check how many questions have been attempted in total
  const attemptedCount = allQuestions.filter(q => records[q.id]?.attempts > 0).length;
  const isFirstRound = attemptedCount < allQuestions.length && (state.round || 1) <= 1;

  // =========================================================================
  // 【第1巡：初回一周フェーズ】（問1から順に解き、途中中断しても次から再開）
  // =========================================================================
  if (isFirstRound) {
    let startIdx = 0;
    if (currentQuestionId) {
      const curIdx = allQuestions.findIndex(q => q.id === currentQuestionId);
      if (curIdx !== -1) {
        startIdx = curIdx + 1;
      }
    } else if (state.currentQuizIndex !== undefined) {
      startIdx = state.currentQuizIndex;
    }

    // Look forward from startIdx for the next unattempted question
    for (let i = startIdx; i < allQuestions.length; i++) {
      const q = allQuestions[i];
      if (!records[q.id] || records[q.id].attempts === 0) {
        return {
          question: q,
          index: i,
          isFirstRound: true,
          round: 1,
          modeDescription: '第1巡：全問走破中',
          progressText: `${attemptedCount + 1} / ${allQuestions.length} 問`
        };
      }
    }

    // Wrap around in case user jumped around via list
    for (let i = 0; i < startIdx; i++) {
      const q = allQuestions[i];
      if (!records[q.id] || records[q.id].attempts === 0) {
        return {
          question: q,
          index: i,
          isFirstRound: true,
          round: 1,
          modeDescription: '第1巡：全問走破中',
          progressText: `${attemptedCount + 1} / ${allQuestions.length} 問`
        };
      }
    }
  }

  // =========================================================================
  // 【第2巡以降：適応型 間隔反復（忘却曲線）フェーズ】
  // =========================================================================
  // Candidate pool: avoid showing the exact same question immediately if pool > 1
  const candidatePool = allQuestions.length > 1 && currentQuestionId
    ? allQuestions.filter(q => q.id !== currentQuestionId)
    : allQuestions;

  // Calculate Spaced Repetition Priority Score for each question
  const scored = candidatePool.map(q => {
    const rec = records[q.id] || {
      attempts: 0,
      correct: 0,
      wrong: 0,
      consecutiveCorrect: 0,
      box: 1,
      interval: 3,
      status: 'unattempted',
      answeredAtCount: 0
    };

    const box = rec.box || (rec.status === 'mastered' ? 4 : rec.status === 'review' ? 1 : 2);
    const interval = rec.interval || BOX_LEVELS[box]?.interval || 3;
    const questionsElapsed = Math.max(0, currentTotal - (rec.answeredAtCount || 0));

    // Priority 1: URGENT REVIEW (Mistakes / Box 1)
    // Wrong questions must be reinforced quickly before the memory trace fades
    if (rec.status === 'review' || box === 1) {
      // Overdue factor: when questionsElapsed >= 3, served immediately
      const overdueScore = questionsElapsed >= interval ? 800 + questionsElapsed * 20 : 400 + questionsElapsed * 50;
      const penalty = (rec.wrong || 1) * 30;
      return {
        question: q,
        score: overdueScore + penalty,
        box,
        reason: 'urgent_review',
        badge: '要復習 🔥'
      };
    }

    // Priority 2: SPACED REPETITION DUE (Interval elapsed for Box 2 or Box 3)
    if (questionsElapsed >= interval) {
      const boxUrgency = (5 - box) * 80; // Box 2 -> 240, Box 3 -> 160, Box 4 -> 80
      const overdueAmount = questionsElapsed - interval;
      return {
        question: q,
        score: 300 + boxUrgency + Math.min(overdueAmount * 10, 150),
        box,
        reason: 'spaced_due',
        badge: BOX_LEVELS[box]?.badge || '定着中 🌱'
      };
    }

    // Priority 3: UNMASTERED (Box < 4), not yet due but advancing
    if (box < 4) {
      const progressFraction = Math.min(1, questionsElapsed / interval);
      return {
        question: q,
        score: 100 + progressFraction * 80 + (5 - box) * 20,
        box,
        reason: 'unmastered',
        badge: BOX_LEVELS[box]?.badge || '定着中 🌱'
      };
    }

    // Priority 4: FULLY MASTERED (Box 4)
    // Long-term maintenance check only when no urgent questions remain
    const maintenanceOverdue = Math.max(0, questionsElapsed - interval);
    return {
      question: q,
      score: 10 + Math.min(maintenanceOverdue * 2, 50),
      box: 4,
      reason: 'mastered_maintenance',
      badge: 'マスター 👑'
    };
  });

  // Sort by score descending (highest priority first)
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const qIndex = allQuestions.findIndex(q => q.id === best.question.id);

  return {
    question: best.question,
    index: qIndex >= 0 ? qIndex : 0,
    isFirstRound: false,
    round: Math.max(2, state.round || 2),
    box: best.box,
    badge: best.badge,
    reason: best.reason,
    modeDescription: '忘却曲線：間隔反復ループ'
  };
};

/**
 * Summarizes the count of questions currently in each Leitner Box
 */
export const getLeitnerBoxCounts = (allQuestions, state) => {
  const records = state.records || {};
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, unattempted: 0 };

  allQuestions.forEach(q => {
    const rec = records[q.id];
    if (!rec || rec.attempts === 0) {
      counts.unattempted += 1;
    } else {
      const box = rec.box || (rec.status === 'mastered' ? 4 : rec.status === 'review' ? 1 : 2);
      counts[box] = (counts[box] || 0) + 1;
    }
  });

  return counts;
};
