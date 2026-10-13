import React, { useState, useEffect, useMemo, useRef } from 'react';
import { setUnsavedChanges, confirmDiscardUnsaved } from '../utils/unsavedGuard';
import { 
  FileText, Check, Save, RotateCcw, Download, Upload, Copy, 
  Eye, AlertCircle, Sparkles, ChevronLeft, ChevronRight, Layers,
  Crop, Scissors, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import { EXAM_LIST } from '../data/examList';
import { getExamQuestions } from '../data/examLoader';
import { 
  getQuestionOverrides, 
  saveQuestionOverride, 
  deleteQuestionOverride, 
  exportAllOverrides, 
  importQuestionOverrides 
} from '../utils/objections';
import { 
  cropKeyForDiagram,
  getActiveCropCoords,
  saveCustomCrop,
  CAN_WRITE_SHARED,
  writeSharedOverrides
} from '../utils/customCrops';
import { getAssetUrl } from '../utils/asset';
import { playClick, triggerHaptic } from '../utils/sound';

export default function QuestionEditor({ onOpenCropEditor }) {
  const [selectedExamId, setSelectedExamId] = useState('r8_1');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [overrides, setOverrides] = useState(getQuestionOverrides);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [filterOnlyModified, setFilterOnlyModified] = useState(false);
  const [customPageNum, setCustomPageNum] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const fileInputRef = useRef(null);

  // 簡易トリミング操作用ステート
  const [cropCoords, setCropCoords] = useState(null);
  // 開いた時（または保存した時）のトリム枠。今の枠と違えば「未保存」
  const [loadedCropCoords, setLoadedCropCoords] = useState(null);
  const [isCropActive, setIsCropActive] = useState(true);
  const [cropSavedNotice, setCropSavedNotice] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);

  // キャンバスおよび画像参照
  const pdfImgRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const previewDisplayCanvasRef = useRef(null);

  // トリム枠ドラッグ・リサイズステート
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragMode, setDragMode] = useState('move'); // 'move' | 'se' | 'nw' | 'ne' | 'sw' | 'draw'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCropCoords, setInitialCropCoords] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // 対象試験の問題リスト取得
  const rawQuestions = useMemo(() => {
    return getExamQuestions(selectedExamId);
  }, [selectedExamId]);

  const examMeta = useMemo(() => {
    return EXAM_LIST.find(e => e.id === selectedExamId) || EXAM_LIST[0];
  }, [selectedExamId]);

  // 現在の問題
  const currentQuestion = rawQuestions[selectedQuestionIndex] || rawQuestions[0];
  const questionId = currentQuestion?.id;
  const isWiringQuestion = Boolean(questionId && questionId >= 31);
  const floorPlanPageNum = examMeta.floorPlanPage || 15;

  // 問題や試験が変わったら、手動ページ切り替えをリセット
  useEffect(() => {
    setCustomPageNum(null);
  }, [selectedExamId, selectedQuestionIndex]);

  // フォーム編集用のローカルステート
  const [formData, setFormData] = useState({
    hasDiagram: false,
    diagram: null,
    question: '',
    choices: [
      { id: 'イ', text: '' },
      { id: 'ロ', text: '' },
      { id: 'ハ', text: '' },
      { id: 'ニ', text: '' }
    ],
    answer: 'イ',
    explanation: '',
    keyPoint: '',
    category: '',
    categoryTag: ''
  });

  // 変更検知用の初期化
  useEffect(() => {
    if (!currentQuestion) return;
    const currentOverride = overrides[selectedExamId]?.[questionId];
    const source = currentOverride || currentQuestion;

    setFormData({
      hasDiagram: Boolean(source.diagram),
      diagram: source.diagram || null,
      question: source.question || '',
      choices: source.choices ? JSON.parse(JSON.stringify(source.choices)) : [
        { id: 'イ', text: '' },
        { id: 'ロ', text: '' },
        { id: 'ハ', text: '' },
        { id: 'ニ', text: '' }
      ],
      answer: source.answer || 'イ',
      explanation: source.explanation || '',
      keyPoint: source.keyPoint || '',
      category: source.category || '',
      categoryTag: source.categoryTag || ''
    });
  }, [selectedExamId, selectedQuestionIndex, overrides, currentQuestion, questionId]);

  const refreshOverrides = () => {
    setOverrides(getQuestionOverrides());
  };

  useEffect(() => {
    window.addEventListener('question-overrides-updated', refreshOverrides);
    return () => window.removeEventListener('question-overrides-updated', refreshOverrides);
  }, []);

  // 修正中・修正済みステータス
  const isCurrentlyOverridden = Boolean(overrides[selectedExamId]?.[questionId]);

  // 保存していない変更があるか（フォームの内容と、保存済みの内容を比べる）
  const isDirty = useMemo(() => {
    if (!currentQuestion) return false;
    const source = overrides[selectedExamId]?.[questionId] || currentQuestion;
    if (formData.hasDiagram !== Boolean(source.diagram)) return true;
    // 簡易トリムの枠だけを動かした場合も未保存
    if (formData.hasDiagram && isCropActive && cropCoords && loadedCropCoords &&
      ['page', 'x', 'y', 'w', 'h'].some(f => Math.round(cropCoords[f] ?? 0) !== Math.round(loadedCropCoords[f] ?? 0))) return true;
    const textFields = ['question', 'answer', 'explanation', 'keyPoint', 'category', 'categoryTag'];
    if (textFields.some(f => (formData[f] || '') !== (source[f] || ''))) return true;
    return JSON.stringify(formData.choices || []) !== JSON.stringify(source.choices || []);
  }, [formData, overrides, selectedExamId, questionId, currentQuestion, isCropActive, cropCoords, loadedCropCoords]);

  // 管理画面全体（タブ切り替え・アプリに戻る・ページを閉じる）にも知らせる
  useEffect(() => {
    setUnsavedChanges(isDirty);
  }, [isDirty]);
  useEffect(() => () => setUnsavedChanges(false), []);

  // 保存していない変更があれば、別の問題・年度へ移る前に確認する
  const confirmLeave = () => !isDirty || confirmDiscardUnsaved();
  const goToQuestion = (idx) => {
    if (idx === selectedQuestionIndex || !confirmLeave()) return;
    setSelectedQuestionIndex(idx);
  };
  const examOverrideCount = Object.keys(overrides[selectedExamId] || {}).length;
  const totalOverrideCount = Object.keys(overrides).reduce((acc, k) => acc + Object.keys(overrides[k] || {}).length, 0);

  // トリミング設定キーの算出
  const cropKey = useMemo(() => {
    if (!currentQuestion) return '1';
    return cropKeyForDiagram(questionId, currentQuestion.diagram, selectedExamId);
  }, [currentQuestion, questionId, selectedExamId]);

  // 原本画像パスの算出
  // 問31以降：保存済みの切り抜きがあればその取得元（配線図 or 問題文）のページ、無ければ配線図ページ
  // それ以外：問題文ページ
  const defaultPageMatch = currentQuestion?.fullPage?.match(/page_(\d+)\.png/);
  const questionTextPageNum = currentQuestion?.questionPage || (defaultPageMatch ? parseInt(defaultPageMatch[1], 10) : 5);
  const savedCropPage = getActiveCropCoords(cropKey)?.page;
  const defaultPageNum = isWiringQuestion ? (savedCropPage || floorPlanPageNum) : questionTextPageNum;
  const activePageNum = customPageNum !== null ? customPageNum : defaultPageNum;
  const originalPdfPageUrl = `${examMeta.pageDir}/page_${activePageNum}.png`;

  // トリム座標の初期化・読み込み
  useEffect(() => {
    if (!currentQuestion) return;
    const active = getActiveCropCoords(cropKey);
    const initial = active && active.page === activePageNum
      ? {
        page: activePageNum,
        pageDir: examMeta.pageDir,
        x: active.x,
        y: active.y,
        w: active.w,
        h: active.h,
        label: active.label || `${examMeta.badge} 問${questionId}`
      }
      : {
        // 既定の初期枠（配線図または問題図）
        page: activePageNum,
        pageDir: examMeta.pageDir,
        x: 250,
        y: 350,
        w: 380,
        h: 240,
        label: `${examMeta.badge} 問${questionId}`
      };
    setCropCoords(initial);
    setLoadedCropCoords(initial);
  }, [cropKey, activePageNum, questionId, selectedExamId, isWiringQuestion, examMeta]);

  // キャンバスプレビューのリアルタイム描画
  const updateCropCanvases = () => {
    const img = pdfImgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0 || !cropCoords) return;

    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const safeX = Math.max(0, Math.min(cropCoords.x, naturalW - 10));
    const safeY = Math.max(0, Math.min(cropCoords.y, naturalH - 10));
    const safeW = Math.max(20, Math.min(cropCoords.w, naturalW - safeX));
    const safeH = Math.max(20, Math.min(cropCoords.h, naturalH - safeY));

    // 1. PDF下のミニプレビューキャンバス
    if (cropCanvasRef.current) {
      const canvas = cropCanvasRef.current;
      canvas.width = safeW;
      canvas.height = safeH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, safeW, safeH);
      ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);
    }

    // 2. 右側「出題プレビュー」カード内の図面キャンバス
    if (previewDisplayCanvasRef.current) {
      const canvas = previewDisplayCanvasRef.current;
      canvas.width = safeW;
      canvas.height = safeH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, safeW, safeH);
      ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);
    }
  };

  useEffect(() => {
    updateCropCanvases();
  }, [cropCoords, activePageNum, isPreviewExpanded, formData.hasDiagram]);

  // ドラッグ操作ハンドラー（枠移動・4隅リサイズ・新規ドラッグ矩形描画）
  const handlePointerDown = (e, mode = 'move') => {
    e.stopPropagation();
    if (!isCropActive || !pdfImgRef.current) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
    if (clientX === undefined || clientY === undefined) return;

    const rect = pdfImgRef.current.getBoundingClientRect();
    const naturalW = pdfImgRef.current.naturalWidth || 1661;
    const naturalH = pdfImgRef.current.naturalHeight || 2267;
    const scaleX = naturalW / rect.width;
    const scaleY = naturalH / rect.height;

    setIsDraggingCrop(true);
    setDragMode(mode);
    setDragStart({ x: clientX, y: clientY });

    if (mode === 'draw') {
      const clickX = Math.round((clientX - rect.left) * scaleX);
      const clickY = Math.round((clientY - rect.top) * scaleY);
      setInitialCropCoords({ x: clickX, y: clickY, w: 20, h: 20 });
      setCropCoords(prev => ({
        ...prev,
        page: activePageNum,
        pageDir: examMeta.pageDir,
        x: clickX,
        y: clickY,
        w: 20,
        h: 20
      }));
    } else {
      setInitialCropCoords({ ...cropCoords });
    }
  };

  const handlePointerMove = (e) => {
    if (!isDraggingCrop || !pdfImgRef.current) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
    if (clientX === undefined || clientY === undefined) return;

    const rect = pdfImgRef.current.getBoundingClientRect();
    const naturalW = pdfImgRef.current.naturalWidth || 1661;
    const naturalH = pdfImgRef.current.naturalHeight || 2267;
    const scaleX = naturalW / rect.width;
    const scaleY = naturalH / rect.height;

    const dx = (clientX - dragStart.x) * scaleX;
    const dy = (clientY - dragStart.y) * scaleY;

    setCropCoords(prev => {
      let next = { ...prev };
      if (dragMode === 'draw') {
        const curX = (clientX - rect.left) * scaleX;
        const curY = (clientY - rect.top) * scaleY;
        const startX = initialCropCoords.x;
        const startY = initialCropCoords.y;
        const x = Math.max(0, Math.min(startX, curX));
        const y = Math.max(0, Math.min(startY, curY));
        const w = Math.min(naturalW - x, Math.abs(curX - startX));
        const h = Math.min(naturalH - y, Math.abs(curY - startY));
        next.x = Math.round(x);
        next.y = Math.round(y);
        next.w = Math.max(20, Math.round(w));
        next.h = Math.max(20, Math.round(h));
      } else if (dragMode === 'move') {
        next.x = Math.max(0, Math.min(Math.round(initialCropCoords.x + dx), naturalW - prev.w));
        next.y = Math.max(0, Math.min(Math.round(initialCropCoords.y + dy), naturalH - prev.h));
      } else if (dragMode === 'se') {
        next.w = Math.max(20, Math.min(Math.round(initialCropCoords.w + dx), naturalW - prev.x));
        next.h = Math.max(20, Math.min(Math.round(initialCropCoords.h + dy), naturalH - prev.y));
      } else if (dragMode === 'nw') {
        const newX = Math.max(0, Math.min(Math.round(initialCropCoords.x + dx), initialCropCoords.x + initialCropCoords.w - 20));
        const newY = Math.max(0, Math.min(Math.round(initialCropCoords.y + dy), initialCropCoords.y + initialCropCoords.h - 20));
        next.w = initialCropCoords.w + (initialCropCoords.x - newX);
        next.h = initialCropCoords.h + (initialCropCoords.y - newY);
        next.x = newX;
        next.y = newY;
      } else if (dragMode === 'ne') {
        const newY = Math.max(0, Math.min(Math.round(initialCropCoords.y + dy), initialCropCoords.y + initialCropCoords.h - 20));
        next.w = Math.max(20, Math.min(Math.round(initialCropCoords.w + dx), naturalW - prev.x));
        next.h = initialCropCoords.h + (initialCropCoords.y - newY);
        next.y = newY;
      } else if (dragMode === 'sw') {
        const newX = Math.max(0, Math.min(Math.round(initialCropCoords.x + dx), initialCropCoords.x + initialCropCoords.w - 20));
        next.w = initialCropCoords.w + (initialCropCoords.x - newX);
        next.h = Math.max(20, Math.min(Math.round(initialCropCoords.h + dy), naturalH - prev.y));
        next.x = newX;
      }
      return next;
    });
  };

  const handlePointerUp = () => {
    setIsDraggingCrop(false);
  };

  useEffect(() => {
    if (!isDraggingCrop) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isDraggingCrop, dragMode, dragStart, initialCropCoords]);

  // 簡易トリムの保存処理
  const handleSaveQuickCrop = () => {
    if (!cropCoords || !pdfImgRef.current) return;
    playClick();
    const img = pdfImgRef.current;
    const naturalW = img.naturalWidth || 1661;
    const naturalH = img.naturalHeight || 2267;
    const safeX = Math.max(0, Math.min(cropCoords.x, naturalW - 10));
    const safeY = Math.max(0, Math.min(cropCoords.y, naturalH - 10));
    const safeW = Math.max(20, Math.min(cropCoords.w, naturalW - safeX));
    const safeH = Math.max(20, Math.min(cropCoords.h, naturalH - safeY));

    const savedCoords = {
      ...cropCoords,
      page: activePageNum,
      pageDir: examMeta.pageDir,
      examId: selectedExamId,
      x: Math.round(safeX),
      y: Math.round(safeY),
      w: Math.round(safeW),
      h: Math.round(safeH),
      label: `${examMeta.badge} 問${questionId}`
    };

    const success = saveCustomCrop(cropKey, savedCoords);
    if (!success) {
      triggerHaptic('error');
      alert('⚠️ トリムの保存に失敗しました。');
      return;
    }

    if (CAN_WRITE_SHARED) {
      writeSharedOverrides({ [cropKey]: savedCoords }).catch(err => {
        console.warn('Could not write shared crop override:', err);
      });
    }

    triggerHaptic('success');
    // 保存した枠を「開いた時の枠」にする（未保存の表示を消す）
    setCropCoords(savedCoords);
    setLoadedCropCoords(savedCoords);
    // フォーム側も「図面・写真あり」に自動連動
    setFormData(prev => ({
      ...prev,
      hasDiagram: true,
      diagram: prev.diagram || (selectedExamId === 'r8_1' ? `/crops/q${questionId}_diagram.png` : `/crops/${selectedExamId}/q${questionId}_diagram.png`)
    }));

    setCropSavedNotice(true);
    setTimeout(() => setCropSavedNotice(false), 2500);
  };

  // フォーム変更ハンドラー
  const handleChoiceChange = (choiceId, newText) => {
    setFormData(prev => ({
      ...prev,
      choices: prev.choices.map(c => c.id === choiceId ? { ...c, text: newText } : c)
    }));
  };

  // 保存（問題テキスト・正解 + 簡易トリミング設定をまとめて反映）
  const handleSave = () => {
    playClick();
    // 簡易トリムも合わせて保存
    if (formData.hasDiagram && cropCoords && isCropActive) {
      handleSaveQuickCrop();
    }

    const defaultDiagramPath = selectedExamId === 'r8_1'
      ? `/crops/q${questionId}_diagram.png`
      : `/crops/${selectedExamId}/q${questionId}_diagram.png`;

    const updated = {
      ...currentQuestion,
      diagram: formData.hasDiagram ? (formData.diagram || currentQuestion.diagram || defaultDiagramPath) : null,
      question: formData.question,
      choices: formData.choices,
      answer: formData.answer,
      explanation: formData.explanation,
      keyPoint: formData.keyPoint,
      category: formData.category,
      categoryTag: formData.categoryTag
    };
    saveQuestionOverride(selectedExamId, questionId, updated);
    triggerHaptic('success');
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2000);
  };

  // リセット（初期問題データに戻す）
  const handleResetToOriginal = () => {
    if (window.confirm(`問${questionId} の修正を取り消し、原本初期データに戻しますか？`)) {
      deleteQuestionOverride(selectedExamId, questionId);
    }
  };

  // バルク処理：JSONダウンロード
  const handleExportJson = () => {
    const dataStr = exportAllOverrides();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `denkou2_question_overrides_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // バルク処理：クリップボードにコピー
  const handleCopyJson = () => {
    const dataStr = exportAllOverrides();
    navigator.clipboard.writeText(dataStr).then(() => {
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    });
  };

  // バルク処理：JSONインポート
  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        const res = importQuestionOverrides(content);
        if (res.success) {
          alert(`インポート完了！合計 ${res.count} 問の修正データを読み込みました。`);
        } else {
          alert(`インポート失敗: ${res.error}`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 表示フィルタ付き問題一覧
  const filteredQuestionIndices = useMemo(() => {
    return rawQuestions.map((q, idx) => ({ q, idx })).filter(({ q, idx }) => {
      if (!filterOnlyModified) return true;
      return Boolean(overrides[selectedExamId]?.[q.id]);
    });
  }, [rawQuestions, filterOnlyModified, overrides, selectedExamId]);

  return (
    <div className="space-y-6">
      {/* 上部コントロールバー */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* 試験選択ピル */}
        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1.5 mr-1">
            <Layers className="text-sky-400" size={16} />
            <span className="text-xs font-black text-slate-200">対象試験:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {EXAM_LIST.map(e => {
              const isSelected = e.id === selectedExamId;
              const modCount = Object.keys(overrides[e.id] || {}).length;
              return (
                <button
                  key={e.id}
                  onClick={() => {
                    if (e.id === selectedExamId || !confirmLeave()) return;
                    setSelectedExamId(e.id);
                    setSelectedQuestionIndex(0);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95 ${
                    isSelected
                      ? 'bg-sky-500 text-slate-950 font-black shadow-md shadow-sky-500/20'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span>{e.name}</span>
                  {modCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-slate-950/20 text-slate-950 font-black' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {modCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* バルク処理・バックアップアクション */}
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={handleCopyJson}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            title="修正ストックのJSONをコピー"
          >
            <Copy size={13} className={copiedNotice ? "text-emerald-400" : "text-slate-400"} />
            <span>{copiedNotice ? 'コピー完了！' : '差分JSONコピー'}</span>
          </button>

          <button
            onClick={handleExportJson}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            title="全修正ストックをJSONファイルで保存"
          >
            <Download size={13} className="text-sky-400" />
            <span>JSON保存 ({totalOverrideCount})</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            title="バックアップJSONを復元"
          >
            <Upload size={13} className="text-amber-400" />
            <span>復元読込</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileImport} 
            accept=".json" 
            className="hidden" 
          />
        </div>
      </div>

      {/* 問題セレクタータブ（横スクロール） */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">問題選択:</span>
            <span className="text-slate-400">
              第{currentQuestion?.id}問 / 全{rawQuestions.length}問
            </span>
            {isWiringQuestion && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                配線図問題 (P.{floorPlanPageNum})
              </span>
            )}
            {isCurrentlyOverridden && (
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                修正済 ✏️
              </span>
            )}
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={filterOnlyModified}
              onChange={(e) => setFilterOnlyModified(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px]">修正済のみ表示 ({examOverrideCount})</span>
          </label>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
          {filteredQuestionIndices.map(({ q, idx }) => {
            const isSelected = idx === selectedQuestionIndex;
            const isMod = Boolean(overrides[selectedExamId]?.[q.id]);
            return (
              <button
                key={q.id}
                onClick={() => goToQuestion(idx)}
                className={`flex-shrink-0 w-8 h-8 rounded-lg text-xs font-bold transition flex items-center justify-center relative ${
                  isSelected
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                    : isMod
                    ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-900/60'
                    : 'bg-slate-800/80 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                <span>{q.id}</span>
                {isMod && !isSelected && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* メイン編集エリア：左「原本プレビュー & 簡易トリム」 / 右「出題・正解プレビュー & テキストフォーム」 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 左側：原本PDF対照プレビュー ＆ 簡易トリミング */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-3 sticky top-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FileText className="text-sky-400" size={16} />
              <h3 className="text-xs font-bold text-slate-200">原本PDFプレビュー対照</h3>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>公式正解: <strong className="text-emerald-400 font-mono text-sm">【{currentQuestion?.answer}】</strong></span>
              <span>配点: {currentQuestion?.point || 2}点</span>
            </div>
          </div>

          {/* ページ切り替え ＆ ズーム */}
          <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-400 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
            {/* ページめくりコントロール */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-300">原本頁:</span>
              <button
                onClick={() => setCustomPageNum(Math.max(1, activePageNum - 1))}
                disabled={activePageNum <= 1}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-bold"
                title="前の原本ページへ"
              >
                ◀
              </button>
              <span className="font-mono text-xs font-black text-sky-400 px-1 bg-slate-900 border border-slate-700 rounded">
                P.{activePageNum}
              </span>
              <button
                onClick={() => setCustomPageNum(Math.min(16, activePageNum + 1))}
                disabled={activePageNum >= 16}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-bold"
                title="次の原本ページへ"
              >
                ▶
              </button>
              <button
                onClick={() => setCustomPageNum(floorPlanPageNum)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                  activePageNum === floorPlanPageNum
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="配線図原本ページ(P15)へジャンプ"
              >
                配線図(P{floorPlanPageNum})
              </button>
              {isWiringQuestion && (
                <button
                  onClick={() => setCustomPageNum(questionTextPageNum)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                    activePageNum === questionTextPageNum
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }`}
                  title="問題文の原本ページへ（問題文に図・写真がある場合はこちらから切り抜く）"
                >
                  問題文(P{questionTextPageNum})
                </button>
              )}
              {customPageNum !== null && customPageNum !== defaultPageNum && (
                <button
                  onClick={() => setCustomPageNum(null)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-400"
                  title="この問題のデフォルトページに戻す"
                >
                  問{currentQuestion?.id}の頁
                </button>
              )}
            </div>

            {/* ズームコントロール */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.75, Math.round((prev - 0.25) * 100) / 100))}
                className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                title="縮小"
              >
                -
              </button>
              <span className="font-mono text-[10px] w-8 text-center">{Math.round(zoomLevel * 100)}%</span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(3, Math.round((prev + 0.25) * 100) / 100))}
                className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-xs font-bold"
                title="拡大"
              >
                +
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
              >
                等倍
              </button>
            </div>
          </div>

          {/* 簡易トリミング操作・プレビューバー */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Scissors size={14} className={isCropActive ? "text-amber-400" : "text-slate-500"} />
                <span className="text-[11px] font-bold text-slate-200">簡易トリム:</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCropActive(prev => !prev)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 ${
                  isCropActive
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                <span>{isCropActive ? '操作モードON' : '操作モードOFF'}</span>
              </button>
            </div>

            {/* トリム座標＆プレビュー */}
            {isCropActive && cropCoords && (
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
                <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                  <canvas
                    ref={cropCanvasRef}
                    className="h-8 max-w-[60px] bg-white rounded border border-slate-700 object-contain shadow-inner"
                  />
                  <span className="font-mono text-[9px] text-slate-400">
                    P.{activePageNum} ({Math.round(cropCoords.w)}×{Math.round(cropCoords.h)})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveQuickCrop}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[11px] flex items-center gap-1 shadow-sm active:scale-95 transition"
                  >
                    <Save size={11} />
                    <span>{cropSavedNotice ? '保存完了！' : 'トリム保存'}</span>
                  </button>

                  {onOpenCropEditor && (
                    <button
                      type="button"
                      onClick={() => onOpenCropEditor(selectedExamId, cropKey)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[10px] flex items-center gap-1"
                      title="①画像トリミング画面で微調整する"
                    >
                      <span>①で微調整 ↗</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 原本画像コンテナ（ドラッグ切り抜きオーバーレイ付き） */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-auto max-h-[70vh] min-h-[380px] flex items-start justify-center p-2 relative shadow-inner">
            <div 
              style={{ 
                transform: `scale(${zoomLevel})`, 
                transformOrigin: 'top center', 
                transition: isDraggingCrop ? 'none' : 'transform 0.15s ease-out' 
              }}
              className="relative inline-block select-none max-w-full"
            >
              <img
                ref={pdfImgRef}
                src={getAssetUrl(originalPdfPageUrl)}
                alt={`原本 問${currentQuestion?.id}`}
                onLoad={updateCropCanvases}
                onPointerDown={(e) => {
                  if (isCropActive) handlePointerDown(e, 'draw');
                }}
                className={`max-w-full rounded shadow object-contain block ${
                  isCropActive ? 'cursor-crosshair' : ''
                }`}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = getAssetUrl('/pages/page_5.png');
                }}
              />

              {/* 簡易トリミング操作オーバーレイ枠 */}
              {isCropActive && cropCoords && pdfImgRef.current && (
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'move')}
                  style={{
                    left: `${(cropCoords.x / (pdfImgRef.current.naturalWidth || 1661)) * 100}%`,
                    top: `${(cropCoords.y / (pdfImgRef.current.naturalHeight || 2267)) * 100}%`,
                    width: `${(cropCoords.w / (pdfImgRef.current.naturalWidth || 1661)) * 100}%`,
                    height: `${(cropCoords.h / (pdfImgRef.current.naturalHeight || 2267)) * 100}%`,
                  }}
                  className="absolute border-2 border-red-500 bg-red-500/20 shadow-2xl cursor-move touch-none z-10 flex flex-col justify-between"
                >
                  {/* 上部ラベルバー */}
                  <div className="bg-red-600/90 text-white text-[9px] font-black px-1.5 py-0.5 flex items-center justify-between select-none whitespace-nowrap overflow-hidden">
                    <span className="flex items-center gap-1">
                      <Scissors size={10} />
                      <span>問{questionId} トリム範囲</span>
                    </span>
                    <span className="font-mono text-[8px] bg-red-800/80 px-1 rounded">
                      {Math.round(cropCoords.w)}×{Math.round(cropCoords.h)}
                    </span>
                  </div>

                  {/* 4隅のリサイズハンドル */}
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'nw')}
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-red-600 rounded-sm cursor-nw-resize shadow z-20"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'ne')}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-red-600 rounded-sm cursor-ne-resize shadow z-20"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'sw')}
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border-2 border-red-600 rounded-sm cursor-sw-resize shadow z-20"
                  />
                  <div
                    onPointerDown={(e) => handlePointerDown(e, 'se')}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border-2 border-red-600 rounded-sm cursor-se-resize shadow z-20 flex items-center justify-center"
                  >
                    <div className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            ※ 赤枠をドラッグして移動・リサイズ、または原本画像をドラッグして新しいトリム枠を描画できます。
          </p>
        </div>

        {/* 右側：出題・正解プレビュー ＆ テキスト編集フォーム */}
        <div className="flex flex-col space-y-4">
          {/* 【出題＆回答一覧プレビュー（正解確認）】 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="text-sky-400" size={16} />
                <h3 className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                  <span>出題プレビュー</span>
                  <span className="text-[10px] text-slate-400 font-normal">（正解・回答一覧確認）</span>
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">
                  公式正解: <strong className="text-emerald-400 font-mono text-sm px-1.5 py-0.5 bg-emerald-950/80 border border-emerald-500/40 rounded-lg">【{formData.answer}】</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIsPreviewExpanded(prev => !prev)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-400 border border-slate-700 flex items-center gap-1"
                  title="プレビューの展開/折りたたみ"
                >
                  {isPreviewExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>{isPreviewExpanded ? '閉じる' : '開く'}</span>
                </button>
              </div>
            </div>

            {isPreviewExpanded && (
              <div className="space-y-3 pt-1">
                {/* メタ情報バッジ */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
                      第{questionId}問
                    </span>
                    {formData.category && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                        {formData.category}
                      </span>
                    )}
                    {formData.categoryTag && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-800/60 text-slate-400">
                        #{formData.categoryTag}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 font-medium">
                    <span>{formData.hasDiagram ? '🖼️ 図・写真あり' : '📝 テキストのみ'}</span>
                    <span>配点: {currentQuestion?.point || 2}点</span>
                  </div>
                </div>

                {/* 問題文プレビュー */}
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
                  <p className="text-xs text-slate-100 font-medium leading-relaxed whitespace-pre-wrap">
                    {formData.question || <span className="text-slate-600 italic">（問題文が未入力です）</span>}
                  </p>
                </div>

                {/* 図面・写真プレビュー（ある場合） */}
                {formData.hasDiagram && (
                  <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center gap-1.5">
                    <div className="flex items-center justify-between w-full text-[10px] text-slate-400 px-1">
                      <span className="font-bold flex items-center gap-1">
                        <Crop size={11} className="text-sky-400" />
                        <span>問題図・写真プレビュー（P.{cropCoords?.page || activePageNum}）</span>
                      </span>
                      <span className="text-slate-500 text-[9px]">
                        ※左の原本PDFで赤枠を調整するとリアルタイム反映されます
                      </span>
                    </div>
                    <div className="bg-white rounded-lg p-1.5 max-h-48 overflow-hidden shadow flex items-center justify-center">
                      <canvas
                        ref={previewDisplayCanvasRef}
                        className="max-h-44 max-w-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* 回答一覧プレビュー（イ・ロ・ハ・ニ）と正解ハイライト */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 px-0.5">
                    <span>回答一覧（クリックで正解を変更できます）:</span>
                    <span className="text-emerald-400 text-[10px]">緑枠＝現在の正解</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {formData.choices.map((choice) => {
                      const isCorrect = formData.answer === choice.id;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, answer: choice.id }))}
                          className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-3 active:scale-[0.99] ${
                            isCorrect
                              ? 'bg-emerald-950/70 border-emerald-500/80 text-emerald-100 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/40'
                              : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center flex-shrink-0 transition ${
                              isCorrect
                                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {choice.id}
                            </span>
                            <span className={`text-xs leading-relaxed truncate ${isCorrect ? 'font-bold text-emerald-200' : ''}`}>
                              {choice.text || <span className="text-slate-600 italic">（空欄）</span>}
                            </span>
                          </div>
                          {isCorrect ? (
                            <span className="flex-shrink-0 text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                              <Check size={11} className="stroke-[3]" />
                              <span>正解</span>
                            </span>
                          ) : (
                            <span className="flex-shrink-0 text-[10px] text-slate-500">
                              正解にする
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 要点・暗記ポイント */}
                {formData.keyPoint && (
                  <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-2.5 flex items-start gap-2">
                    <span className="text-xs">💡</span>
                    <div className="text-[11px] text-amber-200 leading-relaxed">
                      <strong className="font-bold text-amber-300">要点: </strong>
                      {formData.keyPoint}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* テキスト編集フォーム */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-amber-400">✏️</span>
                <h3 className="text-xs font-bold text-slate-200">
                  問{currentQuestion?.id} テキスト編集フォーム
                </h3>
              </div>
              
              <div className="flex items-center gap-2">
                {isCurrentlyOverridden && (
                  <button
                    onClick={handleResetToOriginal}
                    className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                    title="原本の初期データに戻す"
                  >
                    <RotateCcw size={11} />
                    <span>元に戻す</span>
                  </button>
                )}
                {isDirty && (
                  <span className="px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[11px] font-black animate-pulse">
                    ● 未保存の変更あり
                  </span>
                )}
                <button
                  onClick={handleSave}
                  className={`min-h-[44px] px-3 py-1.5 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition ${
                    isDirty
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-500/30 ring-2 ring-amber-300'
                      : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
                  }`}
                >
                  <Save size={13} />
                  <span>{saveSuccessNotice ? '保存完了！' : 'この問を保存'}</span>
                </button>
              </div>
            </div>

            {/* 出題形式トグル（テキスト問題化 ⇄ 画像問題化） */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-slate-300">出題形式:</span>
                  <span className="text-[10px] text-slate-400">
                    {formData.hasDiagram ? '🖼️ 図・写真を表示' : '📝 テキストのみ（高速出題）'}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, hasDiagram: false }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-black transition flex items-center gap-1 ${
                      !formData.hasDiagram
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="図面画像を表示せず、テキストと選択肢ボタンのみで出題"
                  >
                    <span>📝 テキストのみ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, hasDiagram: true }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-black transition flex items-center gap-1 ${
                      formData.hasDiagram
                        ? 'bg-sky-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="問題図・器具写真を表示して出題"
                  >
                    <span>🖼️ 図面・写真あり</span>
                  </button>
                </div>
              </div>
              <div className="text-[10px] leading-relaxed pt-1 border-t border-slate-800/80">
                {formData.hasDiagram ? (
                  <span className="text-sky-300">
                    💡 「図面・写真あり」で保存すると、<strong>「①画像トリミング」の一覧にも追加</strong>され、左側の原本PDFでも簡易切り抜き位置を保存できます。
                  </span>
                ) : (
                  <span className="text-emerald-300">
                    💡 「テキストのみ」で保存すると、画像は非表示となり、<strong>「①画像トリミング」の一覧からも自動的にスキップ（除外）</strong>されます。
                  </span>
                )}
              </div>
            </div>

            {/* カテゴリ & 分類 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">大カテゴリ</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">分類タグ</label>
                <input
                  type="text"
                  value={formData.categoryTag}
                  onChange={(e) => setFormData({ ...formData, categoryTag: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* 問題文 */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">問題文</label>
              <textarea
                rows={3}
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-500 leading-relaxed"
              />
            </div>

            {/* 選択肢イ・ロ・ハ・ニ */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-400">
                選択肢テキスト（イ・ロ・ハ・ニ）
              </label>
              {formData.choices.map((choice) => (
                <div key={choice.id} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center flex-shrink-0 ${
                    formData.answer === choice.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {choice.id}
                  </span>
                  <input
                    type="text"
                    value={choice.text}
                    onChange={(e) => handleChoiceChange(choice.id, e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>
              ))}
            </div>

            {/* 正解選択肢ボタン */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">正解選択肢</label>
              <div className="flex items-center gap-3">
                {['イ', 'ロ', 'ハ', 'ニ'].map((ans) => (
                  <button
                    key={ans}
                    type="button"
                    onClick={() => setFormData({ ...formData, answer: ans })}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-black border transition ${
                      formData.answer === ans
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {ans}
                  </button>
                ))}
              </div>
            </div>

            {/* 要点 (keyPoint) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">要点 (ワンフレーズ暗記)</label>
              <input
                type="text"
                value={formData.keyPoint}
                onChange={(e) => setFormData({ ...formData, keyPoint: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* 解説 (Markdown) */}
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                解説テキスト (Markdown・表組み対応)
              </label>
              <textarea
                rows={5}
                value={formData.explanation}
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500 leading-relaxed"
              />
            </div>

            {/* フッターナビゲーション */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <button
                onClick={() => goToQuestion(Math.max(0, selectedQuestionIndex - 1))}
                disabled={selectedQuestionIndex === 0}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-bold text-slate-300 flex items-center gap-1"
              >
                <ChevronLeft size={14} />
                <span>前の問</span>
              </button>
              <span className="text-[11px] text-slate-500">
                Q{currentQuestion?.id} / {rawQuestions.length}
              </span>
              <button
                onClick={() => goToQuestion(Math.min(rawQuestions.length - 1, selectedQuestionIndex + 1))}
                disabled={selectedQuestionIndex === rawQuestions.length - 1}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-bold text-slate-300 flex items-center gap-1"
              >
                <span>次の問</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
