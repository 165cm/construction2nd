import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Star, FileText, CheckCircle2, XCircle, ArrowRight, RotateCcw, ZoomIn, Sparkles, BookOpen, Shuffle, HelpCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCorrect, playWrong, playClick, triggerHaptic } from '../utils/sound';
import { cropKeyForDiagram, isCropFromFloorPlan } from '../utils/customCrops';
import { getShuffleChoicesSetting, setShuffleChoicesSetting, getAutoAdvanceMode, setAutoAdvanceMode, AUTO_ADVANCE_MODES } from '../utils/settings';
import CropImage from './CropImage';
import VisualChoices from './VisualChoices';
import ExamInstructions from './ExamInstructions';
import ExplanationRenderer from './ExplanationRenderer';
import CheatsheetAccordion from './CheatsheetAccordion';
import ObjectionModal from './ObjectionModal';
import { getCheatsheetsForQuestion } from '../data/cheatsheets';
import { getShortSourceLabel } from '../data/attribution';

const AUTO_ADVANCE_TIME_MS = 3000;

// 「わからない」を選んだ時の印（選択肢の イ・ロ・ハ・ニ とは別）
const UNKNOWN_CHOICE = '?';

export default function QuizCard({
  question,
  record,
  isBookmarked,
  onAnswer,
  onNext,
  onToggleBookmark,
  onOpenWiringDiagram,
  totalQuestions = 50,
  currentIndex = 0,
  quizStep,
  onOpenAttribution,
  currentExamMeta
}) {
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const isUnknownAnswer = selectedChoice === UNKNOWN_CHOICE;
  // 「もう一度」で解き直し中（学習記録・EXPには数えない）
  const [isRetry, setIsRetry] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [isObjectionOpen, setIsObjectionOpen] = useState(false);
  const [, setCropsVersion] = useState(0);

  // Auto-advance & floating popup state
  const [showPopup, setShowPopup] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(AUTO_ADVANCE_TIME_MS);
  // 自動送りの設定（いつも／正解の時だけ／オフ）と、今回の解答でカウントダウンするか
  const [autoAdvanceMode, setAutoAdvanceModeState] = useState(getAutoAdvanceMode);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const timerRef = useRef(null);
  const explanationRef = useRef(null);

  // Choices shuffle logic (Defaults to true: randomizes choice button order while keeping choice IDs and correct answers consistent)
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(getShuffleChoicesSetting);

  useEffect(() => {
    const handleAutoAdvanceChange = () => setAutoAdvanceModeState(getAutoAdvanceMode());
    window.addEventListener('auto-advance-setting-changed', handleAutoAdvanceChange);
    return () => window.removeEventListener('auto-advance-setting-changed', handleAutoAdvanceChange);
  }, []);

  // 自動送りの設定をその場で切り替える（いつも → 正解の時だけ → オフ → …）
  const handleCycleAutoAdvance = () => {
    playClick();
    const ids = ['always', 'correct_only', 'off'];
    const next = ids[(ids.indexOf(autoAdvanceMode) + 1) % ids.length];
    setAutoAdvanceMode(next);
    setAutoAdvanceModeState(next);
    const answeredCorrectly = selectedChoice === question.answer;
    const shouldCount = next === 'always' || (next === 'correct_only' && answeredCorrectly);
    setTimeLeftMs(AUTO_ADVANCE_TIME_MS);
    setIsCountingDown(shouldCount);
  };

  useEffect(() => {
    const handleSettingChange = () => setIsShuffleEnabled(getShuffleChoicesSetting());
    window.addEventListener('shuffle-setting-changed', handleSettingChange);
    return () => window.removeEventListener('shuffle-setting-changed', handleSettingChange);
  }, []);

  const handleToggleShuffle = () => {
    playClick();
    const nextVal = !isShuffleEnabled;
    setIsShuffleEnabled(nextVal);
    setShuffleChoicesSetting(nextVal);
  };

  const displayedChoices = useMemo(() => {
    if (!question?.choices) return [];
    if (!isShuffleEnabled) return question.choices;
    // Stable pseudo-random shuffle per question attempt
    const arr = [...question.choices];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [question.id, question.choices, isShuffleEnabled]);

  // Re-render when admin updates crop coordinates
  useEffect(() => {
    const handleCropUpdate = () => setCropsVersion(v => v + 1);
    window.addEventListener('custom-crops-updated', handleCropUpdate);
    return () => window.removeEventListener('custom-crops-updated', handleCropUpdate);
  }, []);

  // Ensure absolute top scroll on question change (handles iOS Safari layout shifts)
  useEffect(() => {
    setSelectedChoice(null);
    setIsAnswered(false);
    setIsRetry(false);
    setShowPopup(false);
    setIsCountingDown(false);
    setTimeLeftMs(AUTO_ADVANCE_TIME_MS);
    setStartTime(Date.now());

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollToTop();
    const r1 = requestAnimationFrame(scrollToTop);
    const t1 = setTimeout(scrollToTop, 50);
    const t2 = setTimeout(scrollToTop, 200);

    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [question.globalId || question.id]);

  // Handle 3-second auto-advance countdown after answer
  useEffect(() => {
    if (!showPopup || !isCountingDown) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const intervalStep = 50;
    timerRef.current = setInterval(() => {
      setTimeLeftMs((prev) => {
        if (prev <= intervalStep) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          // Auto advance to next question
          handleAutoNext();
          return 0;
        }
        return prev - intervalStep;
      });
    }, intervalStep);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [showPopup, isCountingDown]);

  const handleAutoNext = () => {
    setShowPopup(false);
    onNext();
  };

  const handleManualNext = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShowPopup(false);
    playClick();
    onNext();
  };

  const handleReadExplanation = () => {
    // Cancel the timer immediately so user can read at their leisure
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShowPopup(false);
    playClick();

    setTimeout(() => {
      if (explanationRef.current) {
        explanationRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const handleSelectChoice = (choiceId) => {
    if (isAnswered) return;
    
    playClick();
    const timeSpent = Math.max(1, (Date.now() - startTime) / 1000);
    const isCorrect = choiceId === question.answer;
    const isUnknown = choiceId === UNKNOWN_CHOICE;
    
    setSelectedChoice(choiceId);
    setIsAnswered(true);
    setShowPopup(true);
    setTimeLeftMs(AUTO_ADVANCE_TIME_MS);
    setIsCountingDown(autoAdvanceMode === 'always' || (autoAdvanceMode === 'correct_only' && isCorrect));

    if (isCorrect) {
      playCorrect();
      triggerHaptic('success');
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#38bdf8', '#0ea5e9', '#facc15', '#ffffff']
      });
    } else if (!isUnknown) {
      playWrong();
      triggerHaptic('error');
    }

    // 解き直しは記録しない（回答回数・EXPの二重加算やマスター判定のずれを防ぐ）
    if (isRetry) return;

    onAnswer({
      examId: question.examId,
      questionId: question.id,
      isCorrect,
      timeSpentSec: timeSpent,
      category: question.category
    });
  };

  const getStatusBadge = () => {
    if (!record || record.status === 'unattempted') {
      return <span className="bg-slate-700/60 text-slate-300 text-[10px] px-2 py-0.5 rounded font-medium">未挑戦</span>;
    }
    if (record.status === 'mastered' || record.box === 4) {
      return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded font-bold">2回連続正解 👑</span>;
    }
    if (record.status === 'review' || record.box === 1) {
      return <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] px-2 py-0.5 rounded font-bold animate-pulse">要復習 🔥</span>;
    }
    if (record.box === 3) {
      return <span className="bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] px-2 py-0.5 rounded font-medium">安定 🌿</span>;
    }
    return <span className="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] px-2 py-0.5 rounded font-medium">定着中 🌱</span>;
  };

  const areChoicesShort = question.choices.every(
    (c) => (c.text || '').length <= 13
  );

  const progressPercent = Math.max(0, Math.min(100, (timeLeftMs / AUTO_ADVANCE_TIME_MS) * 100));
  const remainingSeconds = Math.ceil(timeLeftMs / 1000);

  return (
    <div className="flex flex-col min-h-[calc(100vh-120px)] pb-28">
      {/* Quiz Progress & SRS Mode Status Banner */}
      {quizStep?.isFirstRound ? (
        <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-900/90 to-sky-950/60 border border-sky-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="text-sky-400 font-black">第1巡（全問走破中）</span>
            <span className="text-slate-400 text-[10px]">| 自動保存</span>
          </div>
          <span className="font-mono font-black text-sky-300 bg-sky-950/80 border border-sky-400/40 px-2 py-0.5 rounded-lg text-xs">
            {quizStep?.progressText || `${currentIndex + 1} / ${totalQuestions} 問`}
          </span>
        </div>
      ) : (
        <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-slate-900/90 to-purple-950/60 border border-purple-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-1.5">
            <span className="text-purple-300 font-black flex items-center gap-1">
              <span>🧠 間隔をあけて復習</span>
            </span>
            <span className="text-slate-400 text-[10px]">
              {record?.box === 1 || record?.status === 'review'
                ? '要復習🔥を最優先'
                : '解答履歴に応じて出題'}
            </span>
          </div>
          <span className="font-bold text-xs px-2 py-0.5 rounded-lg bg-purple-950/80 border border-purple-400/40 text-purple-200">
            {record?.box ? `Box ${record.box}` : '復習'}
          </span>
        </div>
      )}

      {/* Top Question Info Bar */}
      <div className="flex items-center justify-between mb-2.5 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-black text-sky-400 bg-sky-950/60 border border-sky-500/40 px-2 py-0.5 rounded-lg text-sm">
            第 {question.number} 問
          </span>
          <span className="text-slate-400 text-[11px] font-medium bg-slate-800/80 px-2 py-0.5 rounded">
            {question.category}
          </span>
          {getStatusBadge()}
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleToggleShuffle}
            className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition active:scale-95 ${
              isShuffleEnabled
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-950'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
            title={isShuffleEnabled ? '選択肢シャッフル中（タップで固定）' : '選択肢は固定順（タップでシャッフル）'}
          >
            <Shuffle size={12} className={isShuffleEnabled ? 'text-sky-400' : 'text-slate-400'} />
            <span>{isShuffleEnabled ? 'シャッフル' : '固定順'}</span>
          </button>

          <button
            onClick={() => {
              playClick();
              onToggleBookmark(question.id, question.examId);
            }}
            className={`p-1.5 rounded-lg border transition ${
              isBookmarked
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="ブックマーク"
          >
            <Star size={16} className={isBookmarked ? 'fill-amber-400' : ''} />
          </button>

          <button
            onClick={() => {
              playClick();
              setIsObjectionOpen(true);
            }}
            className="p-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 active:scale-95 transition flex items-center gap-1 text-[11px] font-bold"
            title="この問題に異議あり！（問題・選択肢のツッコミ報告）"
          >
            <span>⚡️</span>
            <span className="hidden sm:inline">異議あり</span>
          </button>
        </div>
      </div>

      {/* Wiring Diagram Quick Button (For Q31-Q50) */}
      {question.category === '配線図問題' && (
        <button
          onClick={() => {
            playClick();
            onOpenWiringDiagram(question.wiringMark, question.examId);
          }}
          className="mb-3 py-2 px-3 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-between shadow-lg shadow-sky-900/40 active:scale-[0.98] transition border border-sky-400/40 animate-pulseGlow"
        >
          <div className="flex items-center space-x-2">
            <FileText size={15} />
            <span>📄 配線図（15頁）を開く</span>
            {question.wiringMark && (
              <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded text-[11px] font-black">
                {question.wiringMark} を確認
              </span>
            )}
          </div>
          <span className="text-sky-200 text-[10px]">タップで表示 ➔</span>
        </button>
      )}

      {/* Question Body Card */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-800/70 border border-slate-700/80 shadow-md mb-3.5">
        <h2 className="text-sm sm:text-base font-semibold leading-relaxed text-slate-100 select-text">
          {question.question}
        </h2>

        {/* Diagram Image if available */}
        {(question.diagram && !(question.visualChoices && question.id >= 31) || (question.diagram && question.visualChoices && question.id >= 31 && isCropFromFloorPlan(cropKeyForDiagram(question.id, question.diagram, question.examId), currentExamMeta?.floorPlanPage || 15))) && (
          <div className="mt-3 relative group">
            {question.wiringMark && isCropFromFloorPlan(
              cropKeyForDiagram(question.id, question.diagram, question.examId || currentExamMeta?.id),
              currentExamMeta?.floorPlanPage || 15
            ) && (
              <div className="absolute top-2 left-2 z-10 bg-slate-900/90 backdrop-blur border border-amber-500/50 text-amber-300 text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-md">
                <span>🎯 対象箇所:</span>
                <span className="text-amber-400 font-black">{question.wiringMark} 周辺拡大</span>
              </div>
            )}
            <div
              onClick={() => setShowImageZoom(true)}
              className="bg-white rounded-xl p-2 cursor-pointer flex items-center justify-center border border-slate-600 shadow-inner overflow-hidden min-h-[120px] max-h-56"
            >
              <CropImage
                cropKey={cropKeyForDiagram(question.id, question.diagram, question.examId || currentExamMeta?.id)}
                defaultPath={question.diagram}
                alt="問題の図・写真"
                className="max-h-52 object-contain"
              />
            </div>
            <button
              onClick={() => setShowImageZoom(true)}
              className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white text-[11px] px-2 py-1 rounded-md flex items-center gap-1 border border-slate-700"
            >
              <ZoomIn size={12} />
              <span>拡大</span>
            </button>
          </div>
        )}
      </div>

      {isRetry && (
        <div className="mb-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
          🔁 解き直し中（この回答は学習記録・EXPには数えません）
        </div>
      )}

      <ExamInstructions question={question} />
      <VisualChoices key={question.globalId} question={question} />

      {/* Choices Grid */}
      <div className={`${areChoicesShort ? 'grid grid-cols-2 gap-2' : 'space-y-2'} mb-4`}>
        {displayedChoices.map((choice) => {
          const isSelected = selectedChoice === choice.id;
          const isCorrect = choice.id === question.answer;

          let btnClass = 'bg-slate-800/90 text-slate-200 border-slate-700/80 hover:border-slate-600 active:scale-[0.99]';
          let badgeClass = 'bg-slate-700 text-slate-300';

          if (isAnswered) {
            if (isCorrect) {
              btnClass = 'bg-emerald-950/70 text-emerald-100 border-emerald-500 shadow-lg shadow-emerald-950/50';
              badgeClass = 'bg-emerald-500 text-slate-950 font-bold';
            } else if (isSelected && !isCorrect) {
              btnClass = 'bg-rose-950/70 text-rose-100 border-rose-500 shadow-lg shadow-rose-950/50';
              badgeClass = 'bg-rose-500 text-white font-bold';
            } else {
              btnClass = 'bg-slate-900/50 text-slate-500 border-slate-800 opacity-60';
              badgeClass = 'bg-slate-800 text-slate-500';
            }
          }

          return (
            <button
              key={choice.id}
              disabled={isAnswered}
              onClick={() => handleSelectChoice(choice.id)}
              className={`w-full ${
                areChoicesShort
                  ? 'p-2.5 sm:p-3 min-h-[48px] items-center space-x-2'
                  : 'p-3 items-start space-x-2.5'
              } rounded-xl border text-left flex transition font-medium relative ${btnClass}`}
            >
              <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-xs sm:text-sm shrink-0 font-black transition ${badgeClass}`}>
                {choice.id}
              </span>
              <span className={`flex-1 ${areChoicesShort ? 'text-xs sm:text-sm font-semibold' : 'text-xs sm:text-sm pt-0.5'} leading-tight select-text`}>
                {choice.text}
              </span>

              {isAnswered && isCorrect && (
                <CheckCircle2 size={16} className="text-emerald-400 shrink-0 animate-pop" />
              )}
              {isAnswered && isSelected && !isCorrect && (
                <XCircle size={16} className="text-rose-400 shrink-0 animate-pop" />
              )}
            </button>
          );
        })}
      </div>

      {/* 答えがわからない時は、当てずっぽうで選ばずに正直に「わからない」（不正解として記録し、要復習に入る） */}
      {!isAnswered && (
        <button
          type="button"
          onClick={() => handleSelectChoice(UNKNOWN_CHOICE)}
          className="w-full mb-4 min-h-[44px] py-2.5 px-3 rounded-xl border border-dashed border-slate-600 bg-slate-900/60 text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.99] transition"
        >
          <HelpCircle size={15} />
          <span>わからない（正解と解説を見る）</span>
        </button>
      )}

      {/* Answer & Explanation Card (Always in DOM when answered, targeted by scroll) */}
      {isAnswered && (
        <div
          ref={explanationRef}
          className="rounded-2xl border p-4 mb-4 animate-pop bg-slate-800/95 border-slate-700/80 shadow-xl"
        >
          {/* Result Banner */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700/70">
            <div className="flex items-center space-x-2">
              {selectedChoice === question.answer ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">
                    ✓
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-black text-sm">正解！ 根拠も確認しよう</span>
                    </div>
                    <div className="text-emerald-300/80 text-[11px] font-medium mt-0.5">
                      {record?.box >= 3
                        ? '🧠 次は間隔をあけて再確認'
                        : `🌱 正解を記録。間隔をあけて再確認しよう`}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold shrink-0">
                    ✕
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-rose-400 font-black text-sm">{isUnknownAnswer ? 'わからない → 要復習に追加' : '不正解… 要復習に追加'}</span>
                    </div>
                    <div className="text-rose-300/90 text-[11px] font-medium mt-0.5">
                      解説で理由を確認し、あとで自力で解き直しましょう
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400">正解：</span>
              <strong className="text-base text-emerald-400 font-black ml-1">
                【{question.answer}】
              </strong>
            </div>
          </div>

          {/* Detailed Explanation */}
          <div className="space-y-3 selectable-text">
            <div>
              <h4 className="text-xs font-bold text-sky-400 mb-1.5 flex items-center gap-1">
                <BookOpen size={13} />
                <span>要点一覧・解説</span>
              </h4>
              <ExplanationRenderer
                explanation={question.explanation}
                answerChoice={question.answer}
              />
            </div>

            {/* Key takeaway point */}
            {question.keyPoint && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200">
                <div className="flex items-center space-x-1.5 text-xs font-bold mb-1 text-amber-300">
                  <Sparkles size={14} />
                  <span>次に解くときのポイント</span>
                </div>
                <p className="text-xs leading-relaxed text-amber-100">
                  {question.keyPoint}
                </p>
              </div>
            )}

            {/* Deep-dive memorization cheatsheets */}
            <CheatsheetAccordion
              cheatsheets={getCheatsheetsForQuestion(question)}
            />
          </div>

          {/* Action Buttons inside explanation card */}
          <div className="mt-4 pt-3 border-t border-slate-700/70 flex gap-2">
            <button
              onClick={() => {
                playClick();
                setSelectedChoice(null);
                setIsAnswered(false);
                setIsRetry(true);
                setShowPopup(false);
                setStartTime(Date.now());
              }}
              className="py-3 px-4 rounded-xl bg-slate-700/80 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
            >
              <RotateCcw size={14} />
              <span>すぐ解き直す（記録なし）</span>
            </button>

            <button
              onClick={handleManualNext}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white text-sm font-black flex items-center justify-center gap-1.5 shadow-lg shadow-sky-600/30 active:scale-[0.98] transition"
            >
              <span>次の問題へ進む</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Action Popup with 3s Auto-Advance & Time Seek Animation */}
      {showPopup && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-3 pb-2 max-w-md mx-auto pointer-events-none animate-slideUp">
          <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-sky-400/50 shadow-2xl shadow-sky-950/80 rounded-2xl p-3 flex flex-col gap-2.5">
            {/* Top row: Result status & Time Indicator */}
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {selectedChoice === question.answer ? (
                  <span className="flex items-center gap-1 font-black text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40 text-[11px]">
                    <CheckCircle2 size={13} />
                    <span>正解！</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-black text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-500/40 text-[11px]">
                    <XCircle size={13} />
                    <span>{isUnknownAnswer ? 'わからない' : '不正解'}</span>
                  </span>
                )}
                <span className="text-slate-300 text-xs">
                  正解: <strong className="text-emerald-400 font-black">【{question.answer}】</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleCycleAutoAdvance}
                className="text-[11px] text-slate-400 hover:text-sky-300 underline decoration-dotted underline-offset-2 text-right"
                title="タップで自動送りの設定を切り替え（いつも／正解の時だけ／オフ）"
              >
                {isCountingDown
                  ? `${remainingSeconds}秒後に自動で次へ`
                  : `自動送り: ${AUTO_ADVANCE_MODES.find(m => m.id === autoAdvanceMode)?.label || ''}`}
              </button>
            </div>

            {/* Bottom row: [解説を読む] and [次に進む (3s) with time seek bar] */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleReadExplanation}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
              >
                <BookOpen size={14} className="text-sky-400" />
                <span>解説を読む</span>
              </button>

              <button
                onClick={handleManualNext}
                className="flex-1 relative overflow-hidden py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs flex items-center justify-center gap-1 shadow-lg shadow-sky-600/30 active:scale-95 transition"
              >
                {/* Time Seek Animation Bar (drains from left to right) */}
                {isCountingDown && (
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-sky-400/40 pointer-events-none transition-all duration-75 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  <span>{isCountingDown ? `次に進む (${remainingSeconds}s)` : '次に進む'}</span>
                  <ArrowRight size={13} />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {showImageZoom && question.diagram && (
        <div
          onClick={() => setShowImageZoom(false)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
        >
          <div className="max-w-md w-full bg-white p-3 rounded-2xl shadow-2xl relative">
            <CropImage
              cropKey={cropKeyForDiagram(question.id, question.diagram, question.examId || currentExamMeta?.id)}
              defaultPath={question.diagram}
              alt="拡大図"
              className="w-full object-contain max-h-[75vh]"
            />
            <button
              onClick={() => setShowImageZoom(false)}
              className="mt-3 w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Attribution & Copyright Footer */}
      <div className="mt-8 pt-4 border-t border-slate-800/80 text-center select-none">
        <button
          type="button"
          onClick={() => { playClick(); onOpenAttribution?.(); }}
          className="text-[10px] text-slate-500 hover:text-sky-400 inline-flex items-center gap-1 transition"
        >
          <span>{getShortSourceLabel(currentExamMeta)}</span>
          <span className="underline ml-0.5 text-sky-500/80">著作権・留意事項</span>
        </button>
        <p 
          className="text-[9px] text-slate-600 mt-0.5 cursor-default select-none"
          onClick={() => {
            const count = (window.__adminTapCount || 0) + 1;
            window.__adminTapCount = count;
            if (count >= 5) {
              window.__adminTapCount = 0;
              window.location.hash = '#admin';
            }
          }}
        >
          ※ 電気工事士試験制度の趣旨に基づく学習教育目的利用・表示レイアウト最適化
        </p>
      </div>

      {/* 5-Second Gamified Objection Modal */}
      <ObjectionModal
        isOpen={isObjectionOpen}
        onClose={() => setIsObjectionOpen(false)}
        question={question}
        currentExamMeta={currentExamMeta}
      />
    </div>
  );
}
