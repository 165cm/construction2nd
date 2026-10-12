import React, { useState, useEffect } from 'react';
import questionsData from './data/questions.json';
import { loadState, saveState, recordAnswer, toggleBookmark, getInitialState } from './utils/storage';
import { isSoundEnabled, setSoundEnabled, playClick } from './utils/sound';

import Header from './components/Header';
import QuizCard from './components/QuizCard';
import ReviewMode from './components/ReviewMode';
import ExamMode from './components/ExamMode';
import QuestionList from './components/QuestionList';
import StatsModal from './components/StatsModal';
import WiringDiagramModal from './components/WiringDiagramModal';
import LevelUpModal from './components/LevelUpModal';
import BottomNav from './components/BottomNav';

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [currentMode, setCurrentMode] = useState('quiz'); // 'quiz' | 'review' | 'exam' | 'list'
  const [quizIndex, setQuizIndex] = useState(0);

  // Modals state
  const [isWiringDiagramOpen, setIsWiringDiagramOpen] = useState(false);
  const [wiringHighlightMarker, setWiringHighlightMarker] = useState(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
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

    if (result.didLevelUp) {
      setLevelUpData({
        oldLevel: result.oldLevel,
        newLevel: result.newLevel
      });
    }
  };

  // Next Question in Quick Quiz
  const handleNextQuizQuestion = () => {
    if (quizIndex < questionsData.length - 1) {
      setQuizIndex(i => i + 1);
    } else {
      setQuizIndex(0); // loop to beginning
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
      setQuizIndex(idx);
      setCurrentMode('quiz');
    }
  };

  // Reset Progress
  const handleResetProgress = () => {
    const fresh = getInitialState();
    saveState(fresh);
    setState(fresh);
    setQuizIndex(0);
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

  const currentQuestion = questionsData[quizIndex] || questionsData[0];
  const reviewQuestionsCount = questionsData.filter(q => state.records[q.id]?.status === 'review').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        state={state}
        soundOn={soundOn}
        onToggleSound={handleToggleSound}
        onOpenStats={() => { playClick(); setIsStatsOpen(true); }}
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
            currentIndex={quizIndex}
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
          />
        )}

        {currentMode === 'exam' && (
          <ExamMode
            allQuestions={questionsData}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            onRecordExamResults={handleRecordExamResults}
            onGoToReview={() => setCurrentMode('review')}
          />
        )}

        {currentMode === 'list' && (
          <QuestionList
            allQuestions={questionsData}
            state={state}
            onSelectQuestion={handleSelectQuestion}
            onToggleBookmark={handleToggleBookmark}
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
      />

      {/* Level Up Celebration Modal */}
      <LevelUpModal
        isOpen={!!levelUpData}
        onClose={() => setLevelUpData(null)}
        oldLevel={levelUpData?.oldLevel}
        newLevel={levelUpData?.newLevel}
      />
    </div>
  );
}
