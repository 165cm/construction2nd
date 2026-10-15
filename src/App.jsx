import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { getExamQuestions, getExamMeta, loadCurrentExamId, saveCurrentExamId } from './data/examLoader';
import { EXAM_LIST } from './data/examList';
import { loadState, saveState, recordAnswer, toggleBookmark, getInitialState, saveCurrentQuizPosition, getExamView, recordKey, getTodayCount } from './utils/storage';
import { getInitialResumeQuestion, determineNextQuizQuestion } from './utils/spacedRepetition';
import { isSoundEnabled, setSoundEnabled, playClick } from './utils/sound';
import { prefetchHdPage, getActiveCropCoords, cropKeyForDiagram } from './utils/customCrops';


import { needsReview } from './utils/reviewFilter';
import Header from './components/Header';
import QuizCard from './components/QuizCard';
import ReviewMode from './components/ReviewMode';
import ExamMode from './components/ExamMode';
import QuestionList from './components/QuestionList';
import StatsModal from './components/StatsModal';
import WiringDiagramModal from './components/WiringDiagramModal';


import AttributionModal from './components/AttributionModal';
import ExamSelectModal from './components/ExamSelectModal';
import BottomNav from './components/BottomNav';
// 管理画面は管理者しか使わないので、開いた時だけ読み込む（一般の利用者の最初の読み込みを軽くする）
const AdminHub = lazy(() => import('./components/AdminHub'));

export default function App() {
  const [currentExamId, setCurrentExamId] = useState(() => loadCurrentExamId());
  const currentExamMeta = useMemo(() => getExamMeta(currentExamId), [currentExamId]);
  // 管理画面で問題文を修正したら、再読み込みなしで反映する
  const [overridesVersion, setOverridesVersion] = useState(0);
  useEffect(() => {
    const onOverridesUpdated = () => setOverridesVersion(v => v + 1);
    window.addEventListener('question-overrides-updated', onOverridesUpdated);
    return () => window.removeEventListener('question-overrides-updated', onOverridesUpdated);
  }, []);
  const questionsData = useMemo(
    () => getExamQuestions(currentExamId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentExamId, overridesVersion]
  );

  // 全年度の問題（弱点特訓の「全年度まとめて」で使う）
  const allExamQuestions = useMemo(
    () => EXAM_LIST.flatMap(e => getExamQuestions(e.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overridesVersion]
  );

  const [state, setState] = useState(() => loadState());
  // 選択中の年度だけの学習記録（records・bookmarks は問題番号で引ける）
  const examState = useMemo(() => getExamView(state, currentExamId), [state, currentExamId]);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [currentMode, setCurrentMode] = useState(() => {
    if (typeof window !== 'undefined' && (window.location.hash === '#admin' || window.location.search.includes('admin'))) {
      return 'admin';
    }
    return 'quiz';
  }); // 'quiz' | 'review' | 'exam' | 'list' | 'admin'

  // URLハッシュ（#admin）の同期
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setCurrentMode('admin');
      } else if (currentMode === 'admin') {
        setCurrentMode('quiz');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentMode]);

  // Quiz position state: auto-resumes where user left off
  const [quizStep, setQuizStep] = useState(() => {
    const initialExamId = loadCurrentExamId();
    const initialQuestions = getExamQuestions(initialExamId);
    return getInitialResumeQuestion(initialQuestions, getExamView(loadState(), initialExamId)) || {
      question: initialQuestions[0],
      index: 0,
      isFirstRound: true,
      round: 1,
      modeDescription: '第1巡：全問走破中',
      progressText: `1 / ${initialQuestions.length} 問`
    };
  });

  const [isExamSelectOpen, setIsExamSelectOpen] = useState(false);

  const handleOpenAdmin = () => {
    playClick();
    setCurrentMode('admin');
  };

  // Modals state
  const [isWiringDiagramOpen, setIsWiringDiagramOpen] = useState(false);
  const [wiringHighlightMarker, setWiringHighlightMarker] = useState(null);
  const [wiringExamId, setWiringExamId] = useState(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);


  // Sound toggle handler
  const handleToggleSound = () => {
    const nextVal = !soundOn;
    setSoundOn(nextVal);
    setSoundEnabled(nextVal);
  };

  // Answer handler
  // examId は解いた問題の年度（弱点特訓の「全年度まとめて」では選択中の年度と違うことがある）
  const handleAnswer = ({ examId = currentExamId, questionId, isCorrect, timeSpentSec, category }) => {
    const result = recordAnswer(state, {
      examId,
      questionId,
      isCorrect,
      timeSpentSec,
      category,
      totalQuestions: getExamMeta(examId).questionCount || questionsData.length
    });

    setState(result.nextState);


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
    const nextStep = determineNextQuizQuestion(questionsData, examState, currentQId);
    if (nextStep) {
      setQuizStep(nextStep);
      setState(saveCurrentQuizPosition(state, {
        examId: currentExamId,
        questionId: nextStep.question.id,
        index: nextStep.index,
        round: nextStep.round
      }));
      setTimeout(resetScrollToTop, 50);
    }
  };

  // Bookmark toggle
  const handleToggleBookmark = (questionId, examId = currentExamId) => {
    setState(prev => toggleBookmark(prev, recordKey(examId, questionId)));
  };

  // Wiring Diagram Open
  const handleOpenWiringDiagram = (marker = null, examId = currentExamId) => {
    setWiringHighlightMarker(marker);
    setWiringExamId(examId);
    setIsWiringDiagramOpen(true);
  };

  // Jump to specific question from QuestionList
  const handleSelectQuestion = (questionId) => {
    const idx = questionsData.findIndex(q => q.id === questionId);
    if (idx !== -1) {
      resetScrollToTop();
      const targetQ = questionsData[idx];
      const rec = examState.records[targetQ.id];
      const attemptedCount = questionsData.filter(q => examState.records[q.id]?.attempts > 0).length;
      const isFirst = attemptedCount < questionsData.length && (examState.round || 1) <= 1;
      const newStep = {
        question: targetQ,
        index: idx,
        isFirstRound: isFirst,
        round: examState.round || 1,
        modeDescription: isFirst ? '第1巡：全問走破中' : '忘却曲線：間隔反復ループ',
        badge: rec?.status === 'mastered' ? 'マスター 👑' : rec?.status === 'review' ? '要復習 🔥' : '定着中 🌱',
        progressText: `${attemptedCount + 1} / ${questionsData.length} 問`
      };
      setQuizStep(newStep);
      setState(saveCurrentQuizPosition(state, {
        examId: currentExamId,
        questionId: targetQ.id,
        index: idx,
        round: examState.round
      }));
      setCurrentMode('quiz');
      setTimeout(resetScrollToTop, 50);
    }
  };

  // Reset Progress
  const handleResetProgress = () => {
    const fresh = getInitialState();
    saveState(fresh);
    setState(fresh);
    const initialStep = getInitialResumeQuestion(questionsData, getExamView(fresh, currentExamId));
    setQuizStep(initialStep);
    setIsStatsOpen(false);
  };

  // Record mock exam multiple answers（回答した問題だけを学習記録に残す。未回答は記録しない）
  const handleRecordExamResults = (examDetails) => {
    let curState = state;

    examDetails
      .filter(item => item.userAnswer !== undefined && item.userAnswer !== null)
      .forEach(item => {
        const res = recordAnswer(curState, {
          examId: currentExamId,
          questionId: item.question.id,
          isCorrect: item.isCorrect,
          timeSpentSec: 20,
          category: item.question.category,
          totalQuestions: questionsData.length
        });
        curState = res.nextState;

      });
    setState(curState);

  };

  // Exam Selection Handler
  const handleSelectExam = (examId) => {
    saveCurrentExamId(examId);
    setCurrentExamId(examId);
    const newQuestions = getExamQuestions(examId);
    // 選んだ年度の続きから再開する
    setQuizStep(getInitialResumeQuestion(newQuestions, getExamView(state, examId)) || {
      question: newQuestions[0],
      index: 0,
      isFirstRound: true,
      round: 1,
      modeDescription: '第1巡：全問走破中',
      progressText: `1 / ${newQuestions.length} 問`
    });
    resetScrollToTop();
  };

  // 管理画面で問題を修正した時も、表示中の問題に最新の内容を使う
  const currentQuestion = questionsData.find(q => q.id === quizStep.question?.id) || quizStep.question || questionsData[0];
  // 高画質のページ画像を先に読み込んでおき、表示を速くする
  // - 配線図の問題（問31〜）に近づいたら配線図のページ
  // - 次の問題に図があれば、その図のページ
  useEffect(() => {
    if (!currentQuestion) return undefined;
    const timer = setTimeout(() => {
      const pageDir = currentExamMeta?.pageDir || '/pages';
      if (currentQuestion.id >= 25) prefetchHdPage(pageDir, currentExamMeta?.floorPlanPage || 15);
      const next = questionsData[(quizStep.index ?? 0) + 1];
      if (next?.diagram) {
        const coords = getActiveCropCoords(cropKeyForDiagram(next.id, next.diagram, currentExamId));
        if (coords) prefetchHdPage(coords.pageDir || pageDir, coords.page);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [currentQuestion, currentExamMeta, currentExamId, questionsData, quizStep.index]);

  const reviewQuestionsCount = questionsData.filter(q => needsReview(examState.records[q.id])).length;

  if (currentMode === 'admin') {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center text-sm">
          管理画面を読み込み中…
        </div>
      }>
        <AdminHub
          onBack={() => {
            setCurrentMode('quiz');
            if (typeof window !== 'undefined' && window.location.hash === '#admin') {
              window.history.pushState('', document.title, window.location.pathname + window.location.search);
            }
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        state={examState}
        totalQuestions={questionsData.length}
        soundOn={soundOn}
        onToggleSound={handleToggleSound}
        onOpenStats={() => { playClick(); setIsStatsOpen(true); }}
        onOpenAdmin={handleOpenAdmin}
        currentExamMeta={currentExamMeta}
        onOpenExamSelect={() => { playClick(); setIsExamSelectOpen(true); }}
      />

      {/* Main Content Area (Mobile Container) */}
      <main className="flex-1 w-full max-w-md mx-auto px-3 pt-3 pb-24">
        {currentMode === 'quiz' && <section className="mb-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs" aria-label="今日の学習">
          <div className="flex justify-between items-center gap-2"><strong>今日の目安：10問</strong><span>{Math.min(10, getTodayCount(state))} / 10問</span></div>
          <p className="text-slate-400 mt-2">{getTodayCount(state) >= 10 ? '10問おつかれさまでした。解説を確認したら、復習するか今日はここまで。' : '答えを選んだら、解説で根拠を確認しましょう。'}</p>
          {reviewQuestionsCount > 0 && <button className="mt-2 min-h-[44px] text-sky-300 underline" onClick={() => setCurrentMode('review')}>要復習 {reviewQuestionsCount}問を解く</button>}
        </section>}
        {currentMode === 'quiz' && (
          <QuizCard
            key={`${currentExamId}_${currentQuestion.id}`}
            question={currentQuestion}
            record={examState.records[currentQuestion.id]}
            isBookmarked={(examState.bookmarks || []).includes(currentQuestion.id)}
            onAnswer={handleAnswer}
            onNext={handleNextQuizQuestion}
            onToggleBookmark={handleToggleBookmark}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            totalQuestions={questionsData.length}
            currentIndex={quizStep.index}
            quizStep={quizStep}
            onOpenAttribution={() => setIsAttributionOpen(true)}
            currentExamMeta={currentExamMeta}
          />
        )}

        {currentMode === 'review' && (
          <ReviewMode
            key={currentExamId}
            allExamQuestions={allExamQuestions}
            fullState={state}
            currentExamId={currentExamId}
            onAnswer={handleAnswer}
            onToggleBookmark={handleToggleBookmark}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            onSwitchToQuick={() => setCurrentMode('quiz')}
            onOpenAttribution={() => setIsAttributionOpen(true)}
          />
        )}

        {currentMode === 'exam' && (
          <ExamMode
            key={currentExamId}
            allQuestions={questionsData}
            onOpenWiringDiagram={handleOpenWiringDiagram}
            onRecordExamResults={handleRecordExamResults}
            onGoToReview={() => setCurrentMode('review')}
            onOpenAttribution={() => setIsAttributionOpen(true)}
            currentExamMeta={currentExamMeta}
          />
        )}

        {currentMode === 'list' && (
          <QuestionList
            allQuestions={questionsData}
            state={examState}
            onSelectQuestion={handleSelectQuestion}
            onToggleBookmark={handleToggleBookmark}
            onOpenAttribution={() => setIsAttributionOpen(true)}
            currentExamMeta={currentExamMeta}
            onOpenExamSelect={() => { playClick(); setIsExamSelectOpen(true); }}
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
        currentExamMeta={getExamMeta(wiringExamId || currentExamId)}
      />

      {/* Stats and Achievements Modal */}
      <StatsModal
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        state={examState}
        allQuestions={questionsData}
        onResetProgress={handleResetProgress}
        onOpenAdmin={handleOpenAdmin}
        onOpenAttribution={() => setIsAttributionOpen(true)}
      />

      {/* Attribution & Copyright Notice Modal */}
      <AttributionModal
        isOpen={isAttributionOpen}
        onClose={() => setIsAttributionOpen(false)}
        currentExamMeta={currentExamMeta}
      />

      {/* Exam Selection Modal */}
      <ExamSelectModal
        isOpen={isExamSelectOpen}
        onClose={() => setIsExamSelectOpen(false)}
        currentExamId={currentExamId}
        onSelectExam={handleSelectExam}
        state={state}
      />


    </div>
  );
}
