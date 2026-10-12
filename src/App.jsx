import React, { useState, useEffect } from 'react';
import questionsData from './data/questions.json';
import { loadState, saveState, recordAnswer, toggleBookmark, getInitialState, saveCurrentQuizPosition } from './utils/storage';
import { getInitialResumeQuestion, determineNextQuizQuestion } from './utils/spacedRepetition';
import { isSoundEnabled, setSoundEnabled, playClick } from './utils/sound';
import confetti from 'canvas-confetti';

import Header from './components/Header';
import QuizCard from './components/QuizCard';
import ReviewMode from './components/ReviewMode';
import ExamMode from './components/ExamMode';
import QuestionList from './components/QuestionList';
import StatsModal from './components/StatsModal';
import WiringDiagramModal from './components/WiringDiagramModal';
import LevelUpModal from './components/LevelUpModal';
import Round1CompleteModal from './components/Round1CompleteModal';
import AttributionModal from './components/AttributionModal';
import BottomNav from './components/BottomNav';
import AdminCropEditor from './components/AdminCropEditor';

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [currentMode, setCurrentMode] = useState(() => {
    if (typeof window !== 'undefined' && (window.location.hash === '#admin' || window.location.search.includes('admin'))) {
      return 'admin';
    }
    return 'quiz';
  }); // 'quiz' | 'review' | 'exam' | 'list' | 'admin'

  // Quiz position state: auto-resumes where user left off
  const [quizStep, setQuizStep] = useState(() => {
    const initialState = loadState();
    return getInitialResumeQuestion(questionsData, initialState) || {
      question: questionsData[0],
      index: 0,
      isFirstRound: true,
      round: 1,
      modeDescription: '第1巡：全問走破中',
      progressText: '1 / 50 問'
    };
  });

  const [showRound1CompleteModal, setShowRound1CompleteModal] = useState(false);

  const handleOpenAdmin = () => {
    playClick();
    setCurrentMode('admin');
  };

  // Modals state
  const [isWiringDiagramOpen, setIsWiringDiagramOpen] = useState(false);
  const [wiringHighlightMarker, setWiringHighlightMarker] = useState(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);
  const [levelUpData, setLevelUpData] = useState(null); // { oldLevel, newLevel }

  // Sound toggle handler
  const handleToggleSound = () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    setSoundEnabled(nextVal);
  };

  // Answer handler
  const handleAnswer = ({ questionId, isCorrect, timeSpentSec, category }) => {
    const result = recordAnswer(state, {
      questionId,
      isCorrect,
      timeSpentSec,
      category
    });

    setState(result.nextState);

    // Milestone celebration: User completed all 50 questions for the first time!
    if (result.didCompleteRound1) {
      setShowRound1CompleteModal(true);
      confetti({
        particleCount: 75,
        spread: 90,
        origin: { y: 0.6 }
      });
    }

    if (result.didLevelUp) {
      setLevelUpData({
        oldLevel: result.oldLevel,
        newLevel: result.newLevel
      });
    }
  };

  const resetScrollToTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
  };

  // Next Question in Quick Quiz (determines next based on Round 1 vs Round 2 SRS)
  const handleNextQuizQuestion = () => {
    resetScrollToTop();
    const currentQId = quizStep?.question?.id || null;
    const nextStep = determineNextQuizQuestion(questionsData, state, currentQId);
    if (nextStep) {
      setQuizStep(nextStep);
      saveCurrentQuizPosition(state, {
        questionId: nextStep.question.id,
        index: nextStep.index,
        round: nextStep.round
      });
      setTimeout(resetScrollToTop, 50);
    }
  };

  // Bookmark toggle
  const handleToggleBookmark = (questionId) => {
    setState(prev => toggleBookmark(prev, questionId));
  };

  // Wiring Diagram Open
  const handleOpenWiringDiagram = (marker = null) => {
    setWiringHighlightMarker(marker);
    setIsWiringDiagramOpen(true);
  };

  // Jump to specific question from QuestionList
  const handleSelectQuestion = (questionId) => {
    const idx = questionsData.findIndex(q => q.id === questionId);
    if (idx !== -1) {
      resetScrollToTop();
      const targetQ = questionsData[idx];
      const rec = state.records[targetQ.id];
      const attemptedCount = questionsData.filter(q => state.records[q.id]?.attempts > 0).length;
      const isFirst = attemptedCount < questionsData.length && (state.round || 1) <= 1;
      const newStep = {
        question: targetQ,
        index: idx,
        isFirstRound: isFirst,
        round: state.round || 1,
        modeDescription: isFirst ? '第1巡：全問走破中' : '忘却曲線：間隔反復ループ',
        badge: rec?.status === 'mastered' ? 'マスター 👑' : rec?.status === 'review' ? '要復習 🔥' : '定着中 🌱',
        progressText: `${attemptedCount + 1} / ${questionsData.length} 問`
      };
      setQuizStep(newStep);
      saveCurrentQuizPosition(state, {
        questionId: targetQ.id,
        index: idx,
        round: state.round
      });
      setCurrentMode('quiz');
      setTimeout(resetScrollToTop, 50);
    }
  };

  // Reset Progress
  const handleResetProgress = () => {
    const fresh = getInitialState();
    saveState(fresh);
    setState(fresh);
    const initialStep = getInitialResumeQuestion(questionsData, fresh);
    setQuizStep(initialStep);
    setIsStatsOpen(false);
  };

  // Record mock exam multiple answers
  const handleRecordExamResults = (examDetails) => {
    let curState = state;
    examDetails.forEach(item => {
      const res = recordAnswer(curState, {
        questionId: item.question.id,
        isCorrect: item.isCorrect,
        timeSpentSec: 20,
        category: item.question.category
      });
      curState = res.nextState;
    });
    setState(curState);
  };

  const currentQuestion = quizStep.question || questionsData[0];
  const reviewQuestionsCount = questionsData.filter(q => state.records[q.id]?.status === 'review' || (state.records[q.id]?.wrong > 0 && state.records[q.id]?.status !== 'mastered')).length;

  if (currentMode === 'admin') {
    return <AdminCropEditor onBack={() => setCurrentMode('quiz')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        state={state}
        soundOn={soundOn}
        onToggleSound={handleToggleSound}
        onOpenStats={() => { playClick(); setIsStatsOpen(true); }}
        onOpenAdmin={handleOpenAdmin}
      />

      {/* Main Content Area (Mobile Container) */}
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3">
        {currentMode === 'quiz' && (
          <QuizCard
            key={currentQuestion.id}
            question={currentQuestion}
            record={state.records[currentQuestion.id]}
            isBookmarked={(state.bookmarks || []).includes(currentQuestion.id)}
            onAnswer={handleAnswer}
            onNext={handleNextQuizQuestion}
            onToggleBookmark={handleToggleBookmark}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            totalQuestions={questionsData.length}
            currentIndex={quizStep.index}
            quizStep={quizStep}
            onOpenAttribution={() => setIsAttributionOpen(true)}
          />
        )}

        {currentMode === 'review' && (
          <ReviewMode
            allQuestions={questionsData}
            state={state}
            onAnswer={handleAnswer}
            onToggleBookmark={handleToggleBookmark}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            onSwitchToQuick={() => setCurrentMode('quiz')}
            onOpenAttribution={() => setIsAttributionOpen(true)}
          />
        )}

        {currentMode === 'exam' && (
          <ExamMode
            allQuestions={questionsData}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            onRecordExamResults={handleRecordExamResults}
            onGoToReview={() => setCurrentMode('review')}
            onOpenAttribution={() => setIsAttributionOpen(true)}
          />
        )}

        {currentMode === 'list' && (
          <QuestionList
            allQuestions={questionsData}
            state={state}
            onSelectQuestion={handleSelectQuestion}
            onToggleBookmark={handleToggleBookmark}
            onOpenAttribution={() => setIsAttributionOpen(true)}
          />
        )}
      </main>

      {/* Bottom Thumb Navigation */}
      <BottomNav
        currentMode={currentMode}
        onSelectMode={setCurrentMode}
        reviewCount={reviewQuestionsCount}
        onOpenStats={() => { playClick(); setIsStatsOpen(true); }}
      />

      {/* Wiring Diagram Viewer Modal */}
      <WiringDiagramModal
        isOpen={isWiringDiagramOpen}
        onClose={() => setIsWiringDiagramOpen(false)}
        highlightMarker={wiringHighlightMarker}
      />

      {/* Stats and Achievements Modal */}
      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        state={state}
        allQuestions={questionsData}
        onResetProgress={handleResetProgress}
        onOpenAdmin={handleOpenAdmin}
        onOpenAttribution={() => setIsAttributionOpen(true)}
      />

      {/* Attribution & Copyright Notice Modal */}
      <AttributionModal
        isOpen={isAttributionOpen}
        onClose={() => setIsAttributionOpen(false)}
      />

      {/* Level Up Celebration Modal */}
      <LevelUpModal
        isOpen={!!levelUpData}
        onClose={() => setLevelUpData(null)}
        oldLevel={levelUpData?.oldLevel}
        newLevel={levelUpData?.newLevel}
      />

      {/* Round 1 (50 Questions) Completion Modal */}
      <Round1CompleteModal
        isOpen={showRound1CompleteModal}
        onClose={() => setShowRound1CompleteModal(false)}
        reviewCount={reviewQuestionsCount}
      />
    </div>
  );
}
