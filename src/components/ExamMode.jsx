import React, { useState, useEffect, useRef } from 'react';
import { Clock, CheckCircle2, XCircle, AlertTriangle, FileText, ArrowRight, RotateCcw, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playCorrect, playLevelUp, playClick, triggerHaptic } from '../utils/sound';
import { cropKeyForDiagram, isCropFromFloorPlan } from '../utils/customCrops';
import { getShuffleChoicesSetting } from '../utils/settings';
import CropImage from './CropImage';
import ExplanationRenderer from './ExplanationRenderer';
import { getShortSourceLabel } from '../data/attribution';

const EXAM_DURATION_SEC = 120 * 60;
// 受験中の模擬試験を年度ごとに自動保存する（タブ移動・再読み込みでも続きから再開できる）
const EXAM_SESSION_STORAGE_KEY = 'denkou2_exam_session_v1';

const loadExamSession = (examId) => {
  try {
    const all = JSON.parse(localStorage.getItem(EXAM_SESSION_STORAGE_KEY) || '{}');
    const session = all[examId];
    if (session && typeof session.deadline === 'number' && session.answers) return session;
  } catch (e) {
    // ignore
  }
  return null;
};

const saveExamSession = (examId, session) => {
  try {
    const all = JSON.parse(localStorage.getItem(EXAM_SESSION_STORAGE_KEY) || '{}');
    if (session) {
      all[examId] = session;
    } else {
      delete all[examId];
    }
    localStorage.setItem(EXAM_SESSION_STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save exam session:', e);
  }
};

// 「本番と同じ並び（選択肢をシャッフルしない）」の設定。初期値は ON（本番どおり）
const FIXED_ORDER_STORAGE_KEY = 'denkou2_exam_fixed_order_v1';
const loadFixedOrderSetting = () => {
  try {
    const v = localStorage.getItem(FIXED_ORDER_STORAGE_KEY);
    return v === null ? true : v === 'true';
  } catch (e) {
    return true;
  }
};
const saveFixedOrderSetting = (value) => {
  try { localStorage.setItem(FIXED_ORDER_STORAGE_KEY, String(value)); } catch (e) { /* ignore */ }
};

const CHOICE_IDS = ['イ', 'ロ', 'ハ', 'ニ'];

const secondsUntil = (deadline) => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

export default function ExamMode({
  allQuestions,
  onOpenWiringDiagram,
  onRecordExamResults,
  onGoToReview,
  onOpenAttribution,
  currentExamMeta
}) {
  const examId = currentExamMeta?.id || 'r8_1';
  const [savedSession] = useState(() => loadExamSession(examId));
  const [examStarted, setExamStarted] = useState(!!savedSession);
  const [answers, setAnswers] = useState(() => savedSession?.answers || {}); // { [questionId]: choiceId }
  const [currentIdx, setCurrentIdx] = useState(() => savedSession?.currentIdx || 0);
  // 終了時刻（ミリ秒）。画面を離れていても本番同様に時間は進む
  const [deadline, setDeadline] = useState(() => savedSession?.deadline || null);
  const [timeLeft, setTimeLeft] = useState(() => (savedSession ? secondsUntil(savedSession.deadline) : EXAM_DURATION_SEC));
  const [isFinished, setIsFinished] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [expandedResultIdx, setExpandedResultIdx] = useState(null);
  // 本番と同じ並び（受験中は開始時の設定で固定）
  const [fixedOrder, setFixedOrder] = useState(() => savedSession?.fixedOrder ?? loadFixedOrderSetting());
  // マークシート（全問の解答欄）を開いているか
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const finishedRef = useRef(false);

  // 受験中は解答・現在位置を自動保存
  useEffect(() => {
    if (examStarted && !isFinished && deadline) {
      saveExamSession(examId, { answers, currentIdx, deadline, fixedOrder });
    }
  }, [examStarted, isFinished, answers, currentIdx, deadline, examId, fixedOrder]);

  // Timer countdown（終了時刻から残り時間を計算）
  useEffect(() => {
    if (!examStarted || isFinished || !deadline) return undefined;
    const tick = () => setTimeLeft(secondsUntil(deadline));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [examStarted, isFinished, deadline]);

  // 時間切れで自動採点
  useEffect(() => {
    if (examStarted && !isFinished && deadline && timeLeft <= 0) {
      handleFinishExam({ auto: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, examStarted, isFinished, deadline]);

  const handleStartExam = () => {
    playClick();
    const newDeadline = Date.now() + EXAM_DURATION_SEC * 1000;
    finishedRef.current = false;
    setExamStarted(true);
    setAnswers({});
    setCurrentIdx(0);
    setDeadline(newDeadline);
    setTimeLeft(EXAM_DURATION_SEC);
    setIsFinished(false);
    setResultData(null);
    setExpandedResultIdx(null);
  };

  const handleSelectChoice = (questionId, choiceId) => {
    playClick();
    triggerHaptic('light');
    setAnswers(prev => {
      const next = { ...prev };
      // undefined はマークを消す（マークシートで同じ◯をもう一度タップした時）
      if (choiceId === undefined) delete next[questionId];
      else next[questionId] = choiceId;
      return next;
    });
  };

  const handleFinishExam = ({ auto = false } = {}) => {
    if (finishedRef.current) return;
    const unansweredCount = allQuestions.filter(q => answers[q.id] === undefined).length;
    if (!auto && unansweredCount > 0) {
      const ok = window.confirm(
        `未回答の問題が ${unansweredCount} 問あります。\nこのまま採点しますか？\n（未回答は0点として採点し、学習記録には残しません）`
      );
      if (!ok) return;
    }
    finishedRef.current = true;
    saveExamSession(examId, null);
    playClick();
    let score = 0;
    let correctCount = 0;
    const details = [];

    allQuestions.forEach(q => {
      const userAns = answers[q.id];
      const isCorrect = userAns === q.answer;
      if (isCorrect) {
        score += q.point;
        correctCount += 1;
      }
      details.push({
        question: q,
        userAnswer: userAns,
        isCorrect
      });
    });

    const isPassed = score >= 60;
    const timeSpent = Math.min(EXAM_DURATION_SEC, EXAM_DURATION_SEC - secondsUntil(deadline || Date.now()));

    if (isPassed) {
      playLevelUp();
      triggerHaptic('levelup');
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    }

    setResultData({
      score,
      correctCount,
      totalCount: allQuestions.length,
      isPassed,
      timeSpent,
      details
    });
    setIsFinished(true);

    if (onRecordExamResults) {
      onRecordExamResults(details);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const activeQ = allQuestions[currentIdx];

  // Start Screen
  if (!examStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] p-4 text-center">
        <div className="w-20 h-20 rounded-3xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center text-4xl mb-4 shadow-xl shadow-sky-950/50">
          ⏱️
        </div>
        <h2 className="text-xl font-black text-white mb-2">
          {currentExamMeta?.name || '第二種電気工事士'} 学科試験 模擬試験
        </h2>
        <p className="text-xs text-slate-300 max-w-sm leading-relaxed mb-6">
          試験時間120分、全{allQuestions.length}問（配点各2点／100点満点）。<br />
          <strong>60点以上（30問正解）</strong>で合格です！<br />
          本番同様に途中で正解は表示されず、全問解き終えた後に総合合否判定と詳細解説が出ます。<br />
          <span className="text-slate-400">受験中はほかの画面に移っても自動保存され、続きから再開できます（制限時間は進みます）。</span>
        </p>

        <div className="grid grid-cols-2 gap-3 w-full max-w-xs mb-8 text-xs text-slate-300">
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <div className="text-slate-400 mb-0.5">問題数</div>
            <strong className="text-sm text-sky-400">全 {allQuestions.length} 問</strong>
          </div>
          <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
            <div className="text-slate-400 mb-0.5">制限時間</div>
            <strong className="text-sm text-sky-400">120 分</strong>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            playClick();
            const next = !fixedOrder;
            setFixedOrder(next);
            saveFixedOrderSetting(next);
          }}
          className="w-full max-w-xs min-h-[44px] mb-4 px-3 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-between text-xs text-slate-200"
        >
          <span className="text-left">
            <span className="font-bold">📋 本番と同じ並びで出題</span>
            <span className="block text-[10px] text-slate-400">選択肢をシャッフルせず、イ・ロ・ハ・ニの順に表示</span>
          </span>
          <span className={`w-11 h-6 rounded-full relative shrink-0 ml-2 transition ${fixedOrder ? 'bg-sky-500' : 'bg-slate-700'}`}>
            <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition ${fixedOrder ? 'left-6' : 'left-1'}`} />
          </span>
        </button>

        <button
          onClick={handleStartExam}
          className="w-full max-w-xs py-4 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-base shadow-xl shadow-sky-600/40 active:scale-95 transition"
        >
          試験を開始する ➔
        </button>
      </div>
    );
  }

  // Result Screen
  if (isFinished && resultData) {
    return (
      <div className="pb-24 animate-pop">
        {/* Pass/Fail Header Card */}
        <div className={`p-6 rounded-3xl border text-center mb-6 shadow-2xl ${
          resultData.isPassed
            ? 'bg-gradient-to-b from-emerald-950/80 to-slate-900 border-emerald-500/50 shadow-emerald-950/50'
            : 'bg-gradient-to-b from-rose-950/80 to-slate-900 border-rose-500/50 shadow-rose-950/50'
        }`}>
          <div className="text-4xl mb-2">
            {resultData.isPassed ? '🏆' : '⚠️'}
          </div>
          <h2 className={`text-2xl font-black mb-1 ${resultData.isPassed ? 'text-emerald-400' : 'text-rose-400'}`}>
            {resultData.isPassed ? '合格水準達成！！' : '不合格（惜しい！）'}
          </h2>
          <p className="text-xs text-slate-300 mb-4">
            {resultData.isPassed
              ? 'おめでとうございます！本番でも十分に合格可能な得点です！'
              : `合格ライン（60点）まであと ${Math.max(0, 30 - resultData.correctCount)} 問でした。弱点を復習しましょう！`}
          </p>

          <div className="flex items-center justify-center space-x-4 my-4">
            <div className="text-center">
              <span className="text-[11px] text-slate-400">得点</span>
              <div className="text-4xl font-black text-white">
                {resultData.score}
                <span className="text-sm text-slate-400 font-normal"> / 100点</span>
              </div>
            </div>
            <div className="h-10 w-[1px] bg-slate-700" />
            <div className="text-center">
              <span className="text-[11px] text-slate-400">正解数</span>
              <div className="text-3xl font-black text-sky-400">
                {resultData.correctCount}
                <span className="text-sm text-slate-400 font-normal"> / {resultData.totalCount}問</span>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            所要時間: {Math.floor(resultData.timeSpent / 60)}分 {resultData.timeSpent % 60}秒
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2.5 mb-6">
          <button
            onClick={() => onGoToReview()}
            className="flex-1 py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-900/40 active:scale-95 transition"
          >
            <span>間違えた問題を特訓復習 ➔</span>
          </button>
          <button
            onClick={handleStartExam}
            className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700 active:scale-95 transition"
          >
            <RotateCcw size={14} />
            <span>再挑戦</span>
          </button>
        </div>

        {/* Detailed Question Review List */}
        <h3 className="font-bold text-sm text-slate-200 mb-3 flex items-center gap-2">
          <span>📝 全問の解答結果一覧</span>
        </h3>
        <div className="space-y-2">
          {resultData.details.map((item, idx) => {
            const isExpanded = expandedResultIdx === idx;
            return (
              <div
                key={item.question.id}
                className={`p-3 rounded-xl border text-xs transition ${
                  item.isCorrect
                    ? 'bg-slate-800/40 border-slate-700/60'
                    : 'bg-rose-950/30 border-rose-800/60'
                }`}
              >
                <div
                  onClick={() => {
                    playClick();
                    setExpandedResultIdx(isExpanded ? null : idx);
                  }}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                      item.isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {item.isCorrect ? '✓' : '✕'}
                    </span>
                    <span className="font-bold text-slate-300">問 {item.question.number}</span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[140px]">
                      {item.question.categoryTag}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <span className="text-slate-400 text-[11px]">
                      回答: <strong className={item.isCorrect ? 'text-emerald-400' : 'text-rose-400'}>{item.userAnswer || '未'}</strong>
                    </span>
                    <span className="text-slate-400 text-[11px]">
                      正解: <strong className="text-emerald-400">{item.question.answer}</strong>
                    </span>
                    <span className="text-slate-500 text-[10px]">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>

                {/* Expanded explanation view */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-700/60 animate-pop">
                    <p className="text-xs text-slate-200 font-semibold mb-2 leading-relaxed">
                      {item.question.question}
                    </p>
                    <ExplanationRenderer
                      explanation={item.question.explanation}
                      answerChoice={item.question.answer}
                    />
                    {item.question.keyPoint && (
                      <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">
                        💡 {item.question.keyPoint}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Active Exam Interface
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="pb-24">
      {/* Sticky Exam Timer Header */}
      <div className="sticky top-[74px] z-20 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 py-2.5 px-3 -mx-3 mb-3 flex items-center justify-between text-xs shadow-md">
        <div className="flex items-center space-x-2">
          <Clock size={16} className={timeLeft < 600 ? 'text-rose-400 animate-pulse' : 'text-sky-400'} />
          <span className="font-mono text-sm font-black text-white">
            {formatTime(timeLeft)}
          </span>
        </div>

        <div className="text-slate-400 text-xs">
          回答済: <strong className="text-sky-400">{answeredCount}</strong> / {allQuestions.length}問
        </div>

        <button
          onClick={() => { playClick(); setIsSheetOpen(true); }}
          className="min-h-[36px] py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-bold text-xs active:scale-95 transition"
          title="全問の解答欄（マークシート）を開く"
        >
          📝 マーク
        </button>

        <button
          onClick={() => handleFinishExam()}
          className="min-h-[36px] py-1 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md active:scale-95 transition"
        >
          採点する
        </button>
      </div>

      {/* Question Selector Slider */}
      <div className="flex overflow-x-auto space-x-1.5 py-1.5 mb-3 no-scrollbar">
        {allQuestions.map((q, idx) => {
          const isCurrent = idx === currentIdx;
          const isAnswered = answers[q.id] !== undefined;
          return (
            <button
              key={q.id}
              onClick={() => setCurrentIdx(idx)}
              className={`w-7 h-7 rounded-lg text-xs font-bold shrink-0 transition flex items-center justify-center ${
                isCurrent
                  ? 'bg-sky-500 text-white ring-2 ring-sky-300'
                  : isAnswered
                  ? 'bg-slate-700 text-slate-200 border border-slate-600'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/50'
              }`}
            >
              {q.number}
            </button>
          );
        })}
      </div>

      {/* Wiring Diagram Quick Button (Q31-Q50) */}
      {activeQ.category === '配線図問題' && (
        <button
          onClick={() => onOpenWiringDiagram(activeQ.wiringMark)}
          className="w-full mb-3 py-2 px-3 rounded-xl bg-indigo-900/60 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-between active:scale-[0.99] transition"
        >
          <div className="flex items-center space-x-2">
            <FileText size={15} />
            <span>📄 配線図（15頁）を開く</span>
            {activeQ.wiringMark && (
              <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded text-[10px] font-black">
                {activeQ.wiringMark}
              </span>
            )}
          </div>
          <span className="text-[10px] text-indigo-300">タップで確認</span>
        </button>
      )}

      {/* Question Box */}
      <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 mb-4 shadow-md">
        <div className="flex items-center space-x-2 mb-2 text-xs">
          <span className="font-black text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-500/30">
            第 {activeQ.number} 問
          </span>
          <span className="text-slate-400">
            {activeQ.category} ({activeQ.categoryTag})
          </span>
        </div>

        <h3 className="text-sm font-semibold text-slate-100 leading-relaxed mb-3">
          {activeQ.question}
        </h3>

        {activeQ.diagram && (
          <div className="bg-white rounded-xl p-2 my-2 relative flex items-center justify-center max-h-52 overflow-hidden border border-slate-600">
            {activeQ.wiringMark && isCropFromFloorPlan(cropKeyForDiagram(activeQ.id, activeQ.diagram, activeQ.examId), currentExamMeta?.floorPlanPage || 15) && (
              <div className="absolute top-2 left-2 z-10 bg-slate-900/90 backdrop-blur border border-amber-500/50 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-md">
                <span>🎯 対象箇所:</span>
                <span className="text-amber-400 font-black">{activeQ.wiringMark} 周辺拡大</span>
              </div>
            )}
            <CropImage
              cropKey={cropKeyForDiagram(activeQ.id, activeQ.diagram, activeQ.examId)}
              defaultPath={activeQ.diagram}
              alt="問題図"
              className="max-h-48 object-contain"
            />
          </div>
        )}
      </div>

      {/* Choice Buttons (2 columns if short, 1 column if long) */}
      {(() => {
        const isShuffle = !fixedOrder && getShuffleChoicesSetting();
        let displayedChoices = activeQ.choices;
        if (isShuffle) {
          // Stable pseudo-random shuffle seeded by question ID for consistency during test session
          displayedChoices = [...activeQ.choices].sort((a, b) => {
            const hA = (activeQ.id * 31 + a.id.charCodeAt(0)) % 100;
            const hB = (activeQ.id * 31 + b.id.charCodeAt(0)) % 100;
            return hA - hB;
          });
        }
        const areChoicesShort = displayedChoices.every((c) => (c.text || '').length <= 13);
        return (
          <div className={`${areChoicesShort ? 'grid grid-cols-2 gap-2' : 'space-y-2'} mb-6`}>
            {displayedChoices.map((c) => {
              const isSelected = answers[activeQ.id] === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectChoice(activeQ.id, c.id)}
                  className={`w-full ${
                    areChoicesShort ? 'p-3 min-h-[48px] items-center space-x-2' : 'p-3.5 items-start space-x-3'
                  } rounded-xl border text-left flex transition ${
                    isSelected
                      ? 'bg-sky-600/30 border-sky-400 text-white font-bold ring-1 ring-sky-400 shadow-md'
                      : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:border-slate-600 active:scale-[0.99]'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 font-black ${
                    isSelected ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {c.id}
                  </span>
                  <span className={`text-xs ${areChoicesShort ? 'font-semibold' : 'pt-1'} leading-snug`}>
                    {c.text}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* マークシート（全問の解答欄）：本番の解答用紙のように、問題番号ごとにイ・ロ・ハ・ニを塗る */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-2" onClick={() => setIsSheetOpen(false)}>
          <div className="bg-white text-slate-900 w-full max-w-md max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-rose-50">
              <div>
                <div className="text-sm font-black text-rose-700">解答用紙（マークシート）</div>
                <div className="text-[10px] text-slate-500">◯をタップでマーク／番号をタップでその問題へ移動</div>
              </div>
              <button onClick={() => setIsSheetOpen(false)} className="min-h-[44px] px-3 rounded-lg bg-slate-900 text-white text-xs font-bold">閉じる</button>
            </div>
            <div className="overflow-y-auto px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              {allQuestions.map((q, idx) => (
                <div key={q.id} className={`flex items-center gap-2 py-1 border-b border-rose-100 ${idx === currentIdx ? 'bg-sky-50' : ''}`}>
                  <button
                    onClick={() => { setCurrentIdx(idx); setIsSheetOpen(false); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }}
                    className="w-10 min-h-[40px] text-xs font-black text-rose-700 text-right pr-1"
                  >
                    {q.number}
                  </button>
                  <div className="flex gap-2">
                    {CHOICE_IDS.map(cid => {
                      const marked = answers[q.id] === cid;
                      return (
                        <button
                          key={cid}
                          onClick={() => handleSelectChoice(q.id, marked ? undefined : cid)}
                          className={`w-10 h-10 rounded-full border-2 text-xs font-bold flex items-center justify-center transition active:scale-90 ${
                            marked ? 'bg-slate-900 border-slate-900 text-white' : 'border-rose-400 text-rose-500 bg-white'
                          }`}
                          aria-label={`問${q.number} ${cid}`}
                        >
                          {cid}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Prev / Next Buttons */}
      <div className="flex gap-2">
        <button
          disabled={currentIdx === 0}
          onClick={() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            setCurrentIdx(i => Math.max(0, i - 1));
          }}
          className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 disabled:opacity-40 font-bold text-xs"
        >
          前の問題
        </button>

        <button
          disabled={currentIdx === allQuestions.length - 1}
          onClick={() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            setCurrentIdx(i => Math.min(allQuestions.length - 1, i + 1));
          }}
          className="flex-1 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs disabled:opacity-40"
        >
          次の問題 ➔
        </button>
      </div>

      {/* Attribution & Copyright Footer */}
      <div className="mt-8 pt-4 border-t border-slate-800 text-center select-none">
        <button
          type="button"
          onClick={() => { playClick(); onOpenAttribution?.(); }}
          className="text-[10px] text-slate-500 hover:text-sky-400 inline-flex items-center gap-1 transition"
        >
          <span>{getShortSourceLabel(currentExamMeta)}</span>
          <span className="underline ml-0.5 text-sky-500/80">著作権・留意事項</span>
        </button>
        <p className="text-[9px] text-slate-600 mt-0.5">
          ※ 電気工事士試験制度の趣旨に基づく学習教育目的利用・表示レイアウト最適化
        </p>
      </div>
    </div>
  );
}
