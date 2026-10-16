import { privateContentMode, isPaidExam, paidExamIds, getPrivateExam, subscribePrivateStudy, getPrivateVersion, privateGeneration } from './services/privateStudyStore';
import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore, lazy, Suspense } from 'react';
import { getExamQuestions, getExamMeta, loadCurrentExamId, saveCurrentExamId } from './data/examLoader';
import { EXAM_LIST } from './data/examList';
import { loadState, saveState, recordAnswer, toggleBookmark, getInitialState, saveCurrentQuizPosition, getExamView, recordKey, getTodayCount } from './utils/storage';
import { getInitialResumeQuestion, determineNextQuizQuestion } from './utils/spacedRepetition';
import { isSoundEnabled, setSoundEnabled, playClick } from './utils/sound';
import { prefetchHdPage, getActiveCropCoords, cropKeyForDiagram } from './utils/customCrops';


import { needsReview } from './utils/reviewFilter';
import SaveWarning from './components/SaveWarning';
import { recordExamResult } from './utils/examResults';
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
  const privateVersion = useSyncExternalStore(subscribePrivateStudy, getPrivateVersion, getPrivateVersion);
  const [contentBusy, setContentBusy] = useState(false);
  const [contentMessage, setContentMessage] = useState('');
  const selectionRequest = useRef(0);
  useEffect(() => {
    if (!privateContentMode) return;
    let disposed = false, stop;
    import('./services/privateStudyLifecycle').then(({ watchPrivateStudy }) => {
      if (!disposed) stop = watchPrivateStudy();
    }).catch(() => setContentMessage('ログイン接続を確認してください'));
    return () => { disposed = true; stop?.(); };
  }, []);
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
    [currentExamId, overridesVersion, privateVersion]
  );

  // 全年度の問題（弱点特訓の「全年度まとめて」で使う）
  const allExamQuestions = useMemo(
    () => EXAM_LIST.flatMap(e => getExamQuestions(e.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overridesVersion, privateVersion]
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
  const handleRecordExamResults = (result) => {
    const update = recordExamResult(state, currentExamId, result);
    setState(update.nextState);
    return update.saved;
  };

  // Exam Selection Handler
  const selectLoadedExam = (examId) => {
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

  const handleSelectExam = async (examId) => {
    const requestId = ++selectionRequest.current;
    setContentMessage('');
    if (privateContentMode && isPaidExam(examId)) {
      setContentBusy(true);
      try {
        const { loadPaidExam } = await import('./services/privateStudy');
        await loadPaidExam(examId, { report: (done, total) => {
          if (requestId === selectionRequest.current) setContentMessage(`教材画像を準備中… ${done}/${total}`);
        } });
      } catch (error) { if (requestId === selectionRequest.current) setContentMessage(error.message); return; }
      finally { if (requestId === selectionRequest.current) setContentBusy(false); }
    } else setContentBusy(false);
    if (requestId !== selectionRequest.current) return;
    setContentMessage('');
    selectLoadedExam(examId);
  };
  const loadAllPaidExams = async () => {
    setContentBusy(true); setContentMessage('全年度の教材を読み込み中…');
    try {
      const { loadPaidExam } = await import('./services/privateStudy');
      for (const id of paidExamIds) await loadPaidExam(id);
      setContentMessage('全年度の復習を利用できます');
    } catch (error) { setContentMessage(error.message); }
    finally { setContentBusy(false); }
  };

  const accessLost = privateContentMode && isPaidExam(currentExamId) && !getPrivateExam(currentExamId);
  useEffect(() => {
    if (!accessLost) return;
    selectionRequest.current++;
    setIsWiringDiagramOpen(false);
    setContentBusy(false);
    setContentMessage('利用状態が変わりました。無料問題に戻りました。有料年度は再度選んで確認してください。');
    setCurrentMode('quiz');
    selectLoadedExam('r8_1');
  }, [accessLost, privateVersion]);

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

  if (currentMode === 'admin' && !privateContentMode) {
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

  if (accessLost) return <div role="status" className="p-4 text-slate-200">利用状態を確認中…</div>;

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

      <SaveWarning />
      {privateContentMode && <div className="w-full max-w-md mx-auto px-3 pt-2 text-xs">
        {contentMessage && <p role="status" className="p-3 rounded-xl bg-slate-800 text-amber-200">{contentMessage}</p>}
        <button className="min-h-[44px] text-sky-300 underline" onClick={() => setIsStatsOpen(true)}>ログイン・料金・利用期限を確認</button>
        {currentMode === 'review' && paidExamIds.some(id => !getPrivateExam(id)) && <div>
          <p className="text-slate-400">全年度の復習には、有料教材の読み込みが必要です。画像のため通信量が多くなります。</p>
          <button disabled={contentBusy} className="min-h-[44px] text-sky-300 underline disabled:opacity-50" onClick={loadAllPaidExams}>全年度の教材を読み込む</button>
        </div>}
      </div>}

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
            key={`${currentExamId}:${privateGeneration()}`}
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
            resultHistory={state.examResults?.[currentExamId] || []}
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
        key={privateGeneration()}
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
