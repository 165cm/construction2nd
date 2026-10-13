import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Move,
  Trash2,
  AlertTriangle,
  Upload,
  FileJson
} from 'lucide-react';
import { DEFAULT_CROPS } from '../data/cropsConfig';
import { EXAM_LIST } from '../data/examList';
import { getExamQuestions } from '../data/examLoader';
import { saveQuestionOverride, getQuestionOverrides } from '../utils/objections';
import {
  getCustomCrops,
  getSharedOverrides,
  saveCustomCrop,
  resetCustomCrop,
  clearAllCustomCrops,
  importCustomCrops,
  exportAllCropsData,
  SHARED_OVERRIDES_ENDPOINT,
  CAN_WRITE_SHARED,
  writeSharedOverrides
} from '../utils/customCrops';
import { buildPublishBundle } from '../utils/publishSync';
import { setUnsavedChanges, confirmDiscardUnsaved } from '../utils/unsavedGuard';
import { getAssetUrl } from '../utils/asset';
import { playClick, triggerHaptic } from '../utils/sound';

const SELECTED_KEY_STORAGE = 'denkou_admin_selected_key';

// initialExamId / initialKey … ②エディタの「①で微調整」から、その年度・その画像を開く時に渡す
export default function AdminCropEditor({ onBack, isEmbedded = false, initialExamId = null, initialKey = null }) {
  const [selectedExamId, setSelectedExamId] = useState(
    () => (initialExamId && EXAM_LIST.some(e => e.id === initialExamId) ? initialExamId : 'r8_1')
  );
  const examMeta = EXAM_LIST.find(e => e.id === selectedExamId) || EXAM_LIST[0];
  const [overridesVersion, setOverridesVersion] = useState(0);

  useEffect(() => {
    const handleOverridesUpdate = () => setOverridesVersion(v => v + 1);
    window.addEventListener('question-overrides-updated', handleOverridesUpdate);
    return () => window.removeEventListener('question-overrides-updated', handleOverridesUpdate);
  }, []);

  // 対象試験に応じたアイテム一覧の生成（画像不要の問題はスキップ・除外）
  const cropItems = React.useMemo(() => {
    const examQuestions = getExamQuestions(selectedExamId);
    // 画像が必要な問題のみを抽出（diagram が null または空のものはスキップ）
    const imageQuestions = examQuestions.filter(q => Boolean(q.diagram));
    const floorPlanPageNum = examMeta.floorPlanPage || 15;

    const list = imageQuestions.map(q => {
      const isWiringQuestion = q.id >= 31;
      const pageMatch = q.fullPage?.match(/page_(\d+)\.png/);
      const pageNum = isWiringQuestion ? floorPlanPageNum : (pageMatch ? parseInt(pageMatch[1], 10) : 5);

      if (selectedExamId === 'r8_1') {
        const defCrop = DEFAULT_CROPS[String(q.id)];
        const itemPage = isWiringQuestion ? floorPlanPageNum : (defCrop?.page || pageNum);
        return {
          key: String(q.id),
          label: isWiringQuestion
            ? `問${q.id} ${q.wiringMark ? `【${q.wiringMark}】` : ''}${q.categoryTag || q.category || ''}（配線図問題）`
            : (defCrop?.label || `問${q.id} ${q.categoryTag || q.category || ''}`),
          page: itemPage,
          defaultCoords: (defCrop && !isWiringQuestion) ? defCrop : {
            page: itemPage,
            pageDir: examMeta.pageDir,
            x: 200,
            y: 350,
            w: 500,
            h: 320,
            label: `${examMeta.badge} 問${q.id} ${q.wiringMark || ''}`
          }
        };
      }

      // 他年度の場合
      const itemPage = isWiringQuestion ? floorPlanPageNum : pageNum;
      return {
        key: `${selectedExamId}_${q.id}`,
        label: isWiringQuestion
          ? `問${q.id} ${q.wiringMark ? `【${q.wiringMark}】` : ''}${q.categoryTag || q.category || ''}（配線図問題）`
          : `問${q.id} ${q.categoryTag || q.category || ''}`,
        page: itemPage,
        defaultCoords: {
          page: itemPage,
          pageDir: examMeta.pageDir,
          x: 200,
          y: 350,
          w: 500,
          h: 320,
          label: `${examMeta.badge} 問${q.id} ${q.wiringMark || ''}`
        }
      };
    });

    // 配線図2種を追加（常に画像が必要）
    if (selectedExamId === 'r8_1') {
      if (DEFAULT_CROPS['floor_plan']) {
        list.push({
          key: 'floor_plan',
          label: DEFAULT_CROPS['floor_plan'].label || '配線図: 平面図',
          page: DEFAULT_CROPS['floor_plan'].page || 15,
          defaultCoords: DEFAULT_CROPS['floor_plan']
        });
      }
      if (DEFAULT_CROPS['panel_schedule']) {
        list.push({
          key: 'panel_schedule',
          label: DEFAULT_CROPS['panel_schedule'].label || '配線図: 分電盤結線図',
          page: DEFAULT_CROPS['panel_schedule'].page || 15,
          defaultCoords: DEFAULT_CROPS['panel_schedule']
        });
      }
    } else {
      list.push({
        key: `${selectedExamId}_floor_plan`,
        label: '配線図: 平面図',
        page: examMeta.floorPlanPage || 15,
        defaultCoords: {
          page: examMeta.floorPlanPage || 15,
          pageDir: examMeta.pageDir,
          x: 100,
          y: 140,
          w: 680,
          h: 650,
          label: `${examMeta.badge} 配線図: 平面図`
        }
      });
      list.push({
        key: `${selectedExamId}_panel_schedule`,
        label: '配線図: 分電盤結線図',
        page: examMeta.floorPlanPage || 15,
        defaultCoords: {
          page: examMeta.floorPlanPage || 15,
          pageDir: examMeta.pageDir,
          x: 100,
          y: 800,
          w: 680,
          h: 300,
          label: `${examMeta.badge} 配線図: 分電盤結線図`
        }
      });
    }

    return list;
  }, [selectedExamId, examMeta, overridesVersion]);

  const cropKeys = cropItems.map(item => item.key);

  const [selectedKey, setSelectedKey] = useState(() => initialKey || '1');

  // 試験が切り替わったら選択キーを更新
  useEffect(() => {
    if (cropKeys.length > 0 && !cropKeys.includes(selectedKey)) {
      setSelectedKey(cropKeys[0]);
    }
  }, [cropKeys, selectedKey]);

  const currentItem = cropItems.find(i => i.key === selectedKey) || cropItems[0] || {
    key: '1', label: '問1', page: 5, defaultCoords: { page: 5, x: 200, y: 200, w: 400, h: 300 }
  };

  const [coords, setCoords] = useState(currentItem.defaultCoords);
  // 開いた時（または保存した時）の枠。今の枠と違えば「未保存」
  const [loadedCoords, setLoadedCoords] = useState(currentItem.defaultCoords);
  const [pageNumber, setPageNumber] = useState(currentItem.page);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [savedCount, setSavedCount] = useState(0);

  const imgRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const containerRef = useRef(null);

  // Dragging states
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState('move'); // 'move' | 'se' | 'nw' | 'ne' | 'sw'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCoords, setInitialCoords] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Navigation indices
  const currentIndex = Math.max(0, cropKeys.indexOf(selectedKey));
  const prevKey = currentIndex > 0 ? cropKeys[currentIndex - 1] : null;
  const nextKey = currentIndex < cropKeys.length - 1 ? cropKeys[currentIndex + 1] : null;

  const prevItem = cropItems.find(i => i.key === prevKey);
  const nextItem = cropItems.find(i => i.key === nextKey);
  const prevLabel = prevItem ? prevItem.label : '';
  const nextLabel = nextItem ? nextItem.label : '';

  // 選択中のキーから対象問題の番号（1〜50）を特定（配線図以外）
  const targetQuestionNumber = React.useMemo(() => {
    if (selectedKey.includes('floor_plan') || selectedKey.includes('panel_schedule')) return null;
    const parts = selectedKey.split('_');
    const last = parts[parts.length - 1];
    const n = parseInt(last, 10);
    return isNaN(n) ? null : n;
  }, [selectedKey]);

  // 現在の問題オブジェクト
  const targetQuestionObj = React.useMemo(() => {
    if (!targetQuestionNumber) return null;
    const questions = getExamQuestions(selectedExamId);
    return questions.find(q => q.id === targetQuestionNumber) || null;
  }, [selectedExamId, targetQuestionNumber, overridesVersion]);

  // テキスト問題化（画像不要として一覧からスキップ・除外＆高速出題化）
  const handleConvertToTextOnly = () => {
    if (!targetQuestionObj || !targetQuestionNumber) return;
    playClick();

    const nextCandidate = nextKey || prevKey;

    saveQuestionOverride(selectedExamId, targetQuestionNumber, {
      ...targetQuestionObj,
      diagram: null
    });

    showMessage(`📝 問${targetQuestionNumber} を「テキスト問題（画像不要）」に変更しました。トリミング一覧からスキップされます。（※再度画像が必要な場合は「②問題文エディタ」から設定できます）`, 5000);

    if (nextCandidate) {
      setSelectedKey(nextCandidate);
    }
  };

  // 31問以降：画像の取得元（配線図ページ／問題文ページ）を切り替える
  const switchCropSource = (source) => {
    const floorP = examMeta.floorPlanPage || 15;
    const qPage = targetQuestionObj?.questionPage || 11;
    const page = source === 'floor' ? floorP : qPage;
    if (page === pageNumber) return;
    playClick();
    const sharedEntry = getSharedOverrides()[selectedKey];
    const saved = getCustomCrops()[selectedKey]?.coords || (typeof sharedEntry?.page === 'number' ? sharedEntry : null);
    // その取得元で保存済みの枠があれば使い、無ければ初期枠
    const base = saved && saved.page === page
      ? saved
      : source === 'floor'
        ? currentItem.defaultCoords
        : { x: 150, y: 250, w: 450, h: 300 };
    setCoords(prev => ({ ...prev, x: base.x, y: base.y, w: base.w, h: base.h, page, pageDir: examMeta.pageDir }));
    setPageNumber(page);
    setIsImageLoading(true);
  };

  const showMessage = (msg, ms = 4000) => {
    setSavedMessage(msg);
    setTimeout(() => setSavedMessage(''), ms);
  };

  // Update saved count
  const refreshSavedCount = () => {
    const custom = getCustomCrops();
    setSavedCount(Object.keys(custom).length);
  };

  // Load custom or default coords when selected key changes
  useEffect(() => {
    try { sessionStorage.setItem(SELECTED_KEY_STORAGE, selectedKey); } catch (e) { /* ignore */ }
    const custom = getCustomCrops();
    const shared = getSharedOverrides();
    refreshSavedCount();

    const isWiringQuestion = targetQuestionNumber && targetQuestionNumber >= 31;
    const floorPlanPageNum = examMeta.floorPlanPage || 15;
    
    // 保存済みの座標（共有ファイルの項目は、座標がそろっているものだけ）
    const sharedEntry = shared[selectedKey];
    const saved = custom[selectedKey]?.coords || (typeof sharedEntry?.page === 'number' ? sharedEntry : null);
    const active = saved || currentItem.defaultCoords || {
      page: currentItem.page || (isWiringQuestion ? floorPlanPageNum : 5), 
      pageDir: examMeta.pageDir, 
      x: 200, 
      y: 200, 
      w: 400, 
      h: 300, 
      label: currentItem.label
    };
    
    // 31問以降は、保存済みならその取得元（配線図 or 問題文）のページ、未保存なら配線図ページから始める
    const resolvedPage = isWiringQuestion
      ? (saved?.page || floorPlanPageNum)
      : (active.page || currentItem.page || 5);

    // pageDir と page を正規化
    const normalizedCoords = {
      ...active,
      page: resolvedPage,
      pageDir: active.pageDir || examMeta.pageDir
    };

    setCoords(normalizedCoords);
    setLoadedCoords(normalizedCoords);
    setPageNumber(resolvedPage);
    setIsImageLoading(true);
  }, [selectedKey, selectedExamId, currentItem, examMeta, targetQuestionNumber]);

  // Update live preview canvas whenever image loads or coords change
  const updatePreview = () => {
    const img = imgRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas || !img.complete || img.naturalWidth === 0) return;

    setIsImageLoading(false);
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;

    // Constrain crop coordinates within natural bounds
    const safeX = Math.max(0, Math.min(coords.x, naturalW - 10));
    const safeY = Math.max(0, Math.min(coords.y, naturalH - 10));
    const safeW = Math.max(20, Math.min(coords.w, naturalW - safeX));
    const safeH = Math.max(20, Math.min(coords.h, naturalH - safeY));

    canvas.width = safeW;
    canvas.height = safeH;

    const ctx = canvas.getContext('2d');
    // Fill white paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, safeW, safeH);
    ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);
  };

  useEffect(() => {
    updatePreview();
  }, [coords, pageNumber]);

  // 保存していない変更があるか（枠の位置・大きさ・ページ）
  const isDirty = ['page', 'x', 'y', 'w', 'h'].some(f => Math.round(coords?.[f] ?? 0) !== Math.round(loadedCoords?.[f] ?? 0));
  useEffect(() => {
    setUnsavedChanges(isDirty);
  }, [isDirty]);
  useEffect(() => () => setUnsavedChanges(false), []);

  // 別の画像・年度へ移る（保存していない変更があれば確認）
  const selectKey = (key) => {
    if (!key || key === selectedKey) return;
    if (isDirty && !confirmDiscardUnsaved()) return;
    setSelectedKey(key);
  };

  // Navigation handlers
  const handlePrev = () => {
    if (prevKey) {
      playClick();
      selectKey(prevKey);
    }
  };

  const handleNext = () => {
    if (nextKey) {
      playClick();
      selectKey(nextKey);
    }
  };

  // Handle Save (Robust JPEG compression: solves mobile Chrome LocalStorage quota limit)
  const handleSave = () => {
    playClick();
    const img = imgRef.current;
    if (!img || !img.complete || img.naturalWidth === 0) {
      alert('⚠️ 元ページ画像を読み込み中です。画像が表示されてから保存してください。');
      return;
    }

    try {
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const safeX = Math.max(0, Math.min(coords.x, naturalW - 10));
      const safeY = Math.max(0, Math.min(coords.y, naturalH - 10));
      const safeW = Math.max(20, Math.min(coords.w, naturalW - safeX));
      const safeH = Math.max(20, Math.min(coords.h, naturalH - safeY));

      const offscreen = document.createElement('canvas');
      offscreen.width = safeW;
      offscreen.height = safeH;
      const ctx = offscreen.getContext('2d');

      // 1. Fill clean white paper background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, safeW, safeH);

      // 2. Draw cropped area
      ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

      const savedCoords = {
        ...coords,
        page: pageNumber,
        pageDir: examMeta.pageDir,
        examId: selectedExamId,
        x: Math.round(safeX),
        y: Math.round(safeY),
        w: Math.round(safeW),
        h: Math.round(safeH)
      };

      // 座標データのみ保存（dataUrlを保存しないため、LocalStorage容量制限5MBに絶対に引っかからない）
      const success = saveCustomCrop(selectedKey, savedCoords);

      if (!success) {
        triggerHaptic('error');
        alert('⚠️ 保存に失敗しました。');
        return;
      }

      triggerHaptic('success');
      // 保存した枠を「開いた時の枠」にする（未保存の表示を消す）
      setCoords(savedCoords);
      setLoadedCoords(savedCoords);
      refreshSavedCount();
      const label = coords.label || `問${selectedKey}`;

      if (CAN_WRITE_SHARED) {
        writeSharedOverrides({ [selectedKey]: savedCoords })
          .then(() => showMessage(`✅ ${label} を共有ファイルに保存しました（公開すると全端末に反映）`))
          .catch((err) => {
            console.error(err);
            showMessage(`⚠️ ${label} はこの端末に保存されました（共有ファイルへの書き込み失敗: ${err.message}）`, 6000);
          });
      } else {
        showMessage(`✅ ${label} のトリミング座標を保存しました！（容量制限なし）`, 4000);
      }
    } catch (err) {
      console.error('Failed to save crop:', err);
      triggerHaptic('error');
      alert(`⚠️ 保存エラー: ${err.message}`);
    }
  };

  // バックアップJSONファイルをダウンロード
  const handleDownloadBackup = () => {
    playClick();
    const data = exportAllCropsData();
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `denkou2_crops_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage('💾 全トリミング設定のバックアップJSONをダウンロードしました！', 5000);
  };

  // バックアップJSONファイルから復元
  const handleUploadBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const res = importCustomCrops(event.target.result);
        if (res.success) {
          triggerHaptic('success');
          refreshSavedCount();
          showMessage(`✅ バックアップから ${res.count} 件のトリミング設定を復元しました！`, 5000);
        } else {
          alert(`インポート失敗: ${res.error}`);
        }
      } catch (err) {
        alert(`ファイル読み込みエラー: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };


  // 全端末へ反映するデータ（座標のJSON）をコピー
  const handleCopyShareData = async () => {
    playClick();
    // 切り抜き位置・画像あり／なし・問題文の修正をまとめた「反映用データ」
    const text = JSON.stringify(buildPublishBundle(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
      showMessage('📋 コピーしました。AIとのチャットに貼り付けて「反映して」と伝えてください', 6000);
    } catch (e) {
      window.prompt('自動コピーできませんでした。下の文字をすべて選択してコピーしてください', text);
    }
  };

  // 開発サーバー限定: この端末の保存分をまとめて共有ファイルへ書き込む
  const handleBulkWriteShared = async () => {
    playClick();
    const custom = getCustomCrops();
    const updates = {};
    Object.keys(custom).forEach((k) => {
      if (custom[k]?.coords) updates[k] = custom[k].coords;
    });
    const count = Object.keys(updates).length;
    if (count === 0) {
      showMessage('この端末に保存されたトリミングはありません');
      return;
    }
    try {
      await writeSharedOverrides(updates);
      triggerHaptic('success');
      showMessage(`✅ この端末の ${count} 件を共有ファイルへ書き込みました`);
    } catch (err) {
      triggerHaptic('error');
      alert(`⚠️ 書き込みエラー: ${err.message}`);
    }
  };

  // Handle Reset for current question
  const handleReset = () => {
    playClick();
    triggerHaptic('light');
    resetCustomCrop(selectedKey);
    const isWiring = targetQuestionNumber && targetQuestionNumber >= 31;
    const def = isWiring
      ? currentItem.defaultCoords
      : ((!CAN_WRITE_SHARED && getSharedOverrides()[selectedKey]) || DEFAULT_CROPS[selectedKey] || currentItem.defaultCoords);
    if (def) {
      setCoords(def);
      setLoadedCoords(def);
      setPageNumber(def.page);
    }
    refreshSavedCount();
    if (CAN_WRITE_SHARED) {
      writeSharedOverrides({}, [selectedKey])
        .then(() => showMessage('🔄 初期値に戻しました（共有ファイルからも削除）', 3000))
        .catch((err) => showMessage(`🔄 この端末だけ初期値に戻しました（共有ファイル更新失敗: ${err.message}）`, 5000));
    } else {
      showMessage('🔄 この端末の保存を消して初期値に戻しました', 3000);
    }
  };

  // Handle Clear ALL custom crops (Recovery for corrupted/blank data on mobile)
  const handleClearAll = () => {
    if (window.confirm('⚠️ すべてのカスタムトリミングを破棄して初期画像に戻しますか？\n（スマホで画像が白くなったり表示されない場合に有効です）')) {
      playClick();
      clearAllCustomCrops();
      const isWiring = targetQuestionNumber && targetQuestionNumber >= 31;
      const def = isWiring ? currentItem.defaultCoords : (DEFAULT_CROPS[selectedKey] || currentItem.defaultCoords);
      if (def) {
        setCoords(def);
        setLoadedCoords(def);
        setPageNumber(def.page);
      }
      refreshSavedCount();
      triggerHaptic('light');
      setSavedMessage('🔄 すべてのカスタムトリミングを初期化しました');
      setTimeout(() => setSavedMessage(''), 3000);
    }
  };

  // Download cropped PNG
  const handleDownload = () => {
    playClick();
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = coords.filename || `q${selectedKey}_crop.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Copy python/JSON snippet
  const handleCopyConfig = () => {
    playClick();
    const custom = getCustomCrops();
    const all = { ...DEFAULT_CROPS };
    Object.keys(custom).forEach(k => {
      if (custom[k]?.coords) {
        all[k] = custom[k].coords;
      }
    });

    // Generate python script format
    let pyLines = ['# Updated Crop Coordinates for crop_questions.py:'];
    Object.keys(all).forEach(k => {
      const c = all[k];
      const fn = c.filename.replace('.png', '');
      pyLines.push(`crop(${c.page}, "${fn}", ${c.x}, ${c.y}, ${c.w}, ${c.h})`);
    });

    navigator.clipboard.writeText(pyLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Stepper helper
  const adjustCoord = (field, delta) => {
    setCoords(prev => {
      const naturalW = imgRef.current?.naturalWidth || 1661;
      const naturalH = imgRef.current?.naturalHeight || 2267;
      let val = prev[field] + delta;
      if (field === 'x') val = Math.max(0, Math.min(val, naturalW - prev.w));
      if (field === 'y') val = Math.max(0, Math.min(val, naturalH - prev.h));
      if (field === 'w') val = Math.max(20, Math.min(val, naturalW - prev.x));
      if (field === 'h') val = Math.max(20, Math.min(val, naturalH - prev.y));
      return { ...prev, [field]: val };
    });
  };

  // Mouse / Touch Drag handlers for visual crop box
  const handlePointerDown = (e, mode = 'move') => {
    e.preventDefault();
    setIsDragging(true);
    setDragMode(mode);
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
    setDragStart({ x: clientX, y: clientY });
    setInitialCoords({ ...coords });
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !imgRef.current) return;
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
    if (clientX === undefined || clientY === undefined) return;

    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;

    const dx = (clientX - dragStart.x) * scaleX;
    const dy = (clientY - dragStart.y) * scaleY;

    setCoords(prev => {
      let next = { ...prev };
      const naturalW = imgRef.current.naturalWidth;
      const naturalH = imgRef.current.naturalHeight;

      if (dragMode === 'move') {
        next.x = Math.max(0, Math.min(Math.round(initialCoords.x + dx), naturalW - prev.w));
        next.y = Math.max(0, Math.min(Math.round(initialCoords.y + dy), naturalH - prev.h));
      } else if (dragMode === 'se') { // bottom-right corner
        next.w = Math.max(20, Math.min(Math.round(initialCoords.w + dx), naturalW - prev.x));
        next.h = Math.max(20, Math.min(Math.round(initialCoords.h + dy), naturalH - prev.y));
      } else if (dragMode === 'nw') { // top-left corner
        const newX = Math.max(0, Math.min(Math.round(initialCoords.x + dx), initialCoords.x + initialCoords.w - 20));
        const newY = Math.max(0, Math.min(Math.round(initialCoords.y + dy), initialCoords.y + initialCoords.h - 20));
        next.w = initialCoords.w + (initialCoords.x - newX);
        next.h = initialCoords.h + (initialCoords.y - newY);
        next.x = newX;
        next.y = newY;
      } else if (dragMode === 'ne') { // top-right corner
        const newY = Math.max(0, Math.min(Math.round(initialCoords.y + dy), initialCoords.y + initialCoords.h - 20));
        next.w = Math.max(20, Math.min(Math.round(initialCoords.w + dx), naturalW - prev.x));
        next.h = initialCoords.h + (initialCoords.y - newY);
        next.y = newY;
      } else if (dragMode === 'sw') { // bottom-left corner
        const newX = Math.max(0, Math.min(Math.round(initialCoords.x + dx), initialCoords.x + initialCoords.w - 20));
        next.w = initialCoords.w + (initialCoords.x - newX);
        next.h = Math.max(20, Math.min(Math.round(initialCoords.h + dy), naturalH - prev.y));
        next.x = newX;
      }
      return next;
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Convert coords to percentage on displayed image
  const naturalW = imgRef.current?.naturalWidth || 1661;
  const naturalH = imgRef.current?.naturalHeight || 2267;
  const boxStyle = {
    left: `${(coords.x / naturalW) * 100}%`,
    top: `${(coords.y / naturalH) * 100}%`,
    width: `${(coords.w / naturalW) * 100}%`,
    height: `${(coords.h / naturalH) * 100}%`,
  };

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    >
      {/* Top Header */}
      <div className={`z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 py-2.5 flex items-center justify-between ${
        isEmbedded ? 'rounded-2xl border mb-3' : 'sticky top-0'
      }`}>
        <div className="flex items-center space-x-2">
          {!isEmbedded && (
            <button
              onClick={() => { playClick(); onBack(); }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              title="問題画面に戻る"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>🛠️ トリミング位置 調整管理</span>
            </h1>
            <p className="text-[10px] text-slate-400">
              {currentIndex + 1} / {cropKeys.length} 件目: {coords.label || `問${selectedKey}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {targetQuestionNumber && (
            <button
              onClick={handleConvertToTextOnly}
              className="py-1.5 px-3 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              title="この問の画像を不要にし、テキスト問題として出題します（トリミング一覧から除外されます）"
            >
              <span>📝 テキスト問題化（画像不要）</span>
            </button>
          )}

          {isDirty && (
            <span className="px-2 py-1 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 text-[11px] font-black animate-pulse">
              ● 未保存
            </span>
          )}
          <button
            onClick={handleSave}
            className={`min-h-[44px] py-1.5 px-3 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition ${
              isDirty ? 'bg-amber-500 hover:bg-amber-400 ring-2 ring-amber-300' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            <Save size={14} />
            <span>保存・反映</span>
          </button>
        </div>
      </div>

      {/* Save-destination notice */}
      {CAN_WRITE_SHARED ? (
        <div className="bg-emerald-950/60 border-b border-emerald-700/40 text-emerald-200 px-4 py-2 text-[11px] leading-relaxed">
          🟢 <strong>手元の開発サーバーで開いています。</strong>保存すると共有ファイル（cropOverrides.json）に書き込まれ、公開後は<strong>スマホを含むすべての端末</strong>に反映されます。
        </div>
      ) : (
        <div className="bg-amber-950/60 border-b border-amber-700/40 text-amber-200 px-4 py-2 text-[11px] leading-relaxed">
          ⚠️ <strong>公開サイトでの保存は、この端末のこのブラウザだけに反映されます。</strong>スマホなど他の端末にも反映するには、画面上部（またはページ下部）の「反映用データをコピー」を押して、AIとのチャットに貼り付けてください。
        </div>
      )}

      {/* Toast Notice */}
      {savedMessage && (
        <div className="bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 px-4 py-2 text-xs font-bold text-center animate-pop">
          {savedMessage}
        </div>
      )}

      {/* Navigation & Selection Bar */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap gap-3 items-center justify-between text-xs">
        {/* Exam Selector + Prev / Target Selector / Next */}
        <div className="flex items-center flex-wrap gap-2">
          {/* 対象試験切り替え */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 pl-1">試験:</span>
            <select
              value={selectedExamId}
              onChange={(e) => {
                if (isDirty && !confirmDiscardUnsaved()) return;
                setSelectedExamId(e.target.value);
              }}
              className="bg-slate-900 border border-slate-700 text-sky-300 font-black text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-sky-500"
            >
              {EXAM_LIST.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrev}
              disabled={!prevKey}
              className={`p-1.5 rounded-lg border flex items-center gap-1 ${
                prevKey
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700 active:scale-95'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
              }`}
              title={prevKey ? `前へ: ${prevLabel}` : '最初の画像です'}
            >
              <ChevronLeft size={16} />
              <span className="text-[11px] font-bold hidden sm:inline">前へ</span>
            </button>

            <select
              value={selectedKey}
              onChange={(e) => selectKey(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-sky-500 max-w-[200px] truncate"
            >
              {cropKeys.map((k, idx) => {
                const item = cropItems.find(i => i.key === k);
                return (
                  <option key={k} value={k}>
                    {idx + 1}. {item?.label || k}
                  </option>
                );
              })}
            </select>

            <button
              onClick={handleNext}
              disabled={!nextKey}
              className={`p-1.5 rounded-lg border flex items-center gap-1 ${
                nextKey
                  ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700 active:scale-95'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
              }`}
              title={nextKey ? `次へ: ${nextLabel}` : '最後の画像です'}
            >
              <span className="text-[11px] font-bold hidden sm:inline">次へ</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Page selector & Quick utility buttons */}
        <div className="flex items-center space-x-1.5">
          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-slate-400">元頁:</span>
            <select
              value={pageNumber}
              onChange={(e) => {
                const newP = Number(e.target.value);
                setPageNumber(newP);
                setCoords(prev => ({ ...prev, page: newP }));
              }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
            >
              {Array.from({ length: 16 }, (_, i) => i + 1).map(p => (
                <option key={p} value={p}>
                  {p} 頁{p === (examMeta.floorPlanPage || 15) ? ' (配線図)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleDownload}
            className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
            title="PNGとしてダウンロード"
          >
            <Download size={12} />
            <span className="hidden sm:inline">PNG</span>
          </button>
          <button
            onClick={handleCopyConfig}
            className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
            title="Pythonコードとしてコピー"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span className="hidden sm:inline">{copied ? '済' : 'コード'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-3 space-y-4 max-w-4xl mx-auto w-full">
        {/* ========================================================= */}
        {/* 【上段】赤枠ドラッグの処理（元ページ画像 + 赤枠インタラクティブ操作） */}
        {/* ========================================================= */}
        <section className="p-3 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-2 text-xs">
            <h2 className="font-black text-slate-100 flex items-center gap-1.5">
              <Move size={15} className="text-amber-400" />
              <span>原寸ページ画像（赤枠をドラッグ移動 / 四隅で拡大縮小）</span>
            </h2>
            <div className="flex items-center gap-2">
              {isImageLoading && (
                <span className="text-[10px] text-sky-400 animate-pulse font-bold">
                  読込中...
                </span>
              )}
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                pageNumber === (examMeta.floorPlanPage || 15)
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 border border-slate-700 text-slate-300'
              }`}>
                第 {pageNumber} 頁{pageNumber === (examMeta.floorPlanPage || 15) ? '（配線図）' : ''}
              </span>
            </div>
          </div>

          {/* 31問以降：画像の取得元（配線図／問題文）の切り替え */}
          {targetQuestionNumber && targetQuestionNumber >= 31 && (() => {
            const floorP = examMeta.floorPlanPage || 15;
            const qPage = targetQuestionObj?.questionPage || 11;
            const isFloor = pageNumber === floorP;
            const isQuestion = pageNumber === qPage;
            const btn = (active) => `min-h-[44px] px-3 py-1.5 rounded-lg text-[11px] font-black border transition active:scale-95 ${
              active
                ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`;
            return (
              <div className="mb-2.5 p-2.5 bg-amber-950/60 border border-amber-500/40 rounded-xl text-xs text-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-amber-300">📐 問{targetQuestionNumber} は配線図問題です。画像の取得元を選んでください：</span>
                  {targetQuestionObj?.wiringMark && (
                    <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md font-black text-[11px] shadow-sm">
                      🎯 対象: {targetQuestionObj.wiringMark}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => switchCropSource('floor')} className={btn(isFloor)}>
                    🗺️ 配線図（P{floorP}）
                  </button>
                  <button type="button" onClick={() => switchCropSource('question')} className={btn(isQuestion)}>
                    📝 問題文（P{qPage}）
                  </button>
                  {!isFloor && !isQuestion && (
                    <span className="text-[11px] text-amber-300/80">いまは P{pageNumber} を表示中</span>
                  )}
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  問題文の中に図・写真がある問題は「問題文」を選び、その図を赤枠で囲んでください。選んだ取得元は「保存」で記録されます。
                </p>
              </div>
            );
          })()}

          <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-400 mb-2 leading-relaxed">
            <span>💡 赤枠の中をつかんでドラッグ移動、四隅の丸いハンドルをつかんで拡大・縮小できます。</span>
            <span className="text-slate-500 text-[10px]">（※画像不要の問題はスキップ中 / 画像が必要な場合は「②問題文エディタ」で設定可能）</span>
          </div>

          <div
            ref={containerRef}
            className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-700 shadow-2xl select-none"
          >
            {/* Full page image with crossOrigin */}
            <img
              ref={imgRef}
              crossOrigin="anonymous"
              src={getAssetUrl(`${examMeta.pageDir}/page_${pageNumber}.png`)}
              alt="元頁"
              onLoad={updatePreview}
              className="w-full h-auto block select-none pointer-events-none"
              draggable="false"
            />

            {/* Draggable Crop Selection Box Overlay */}
            <div
              style={{ ...boxStyle, touchAction: 'none' }}
              onPointerDown={(e) => handlePointerDown(e, 'move')}
              onTouchStart={(e) => handlePointerDown(e, 'move')}
              className="absolute border-2 border-red-500 bg-red-500/20 cursor-move flex items-center justify-center shadow-lg group pointer-events-auto"
            >
              {/* Center move & size label */}
              <span className="bg-red-600/90 text-white font-mono text-[10px] font-black px-1.5 py-0.5 rounded shadow pointer-events-none select-none">
                {coords.w} × {coords.h}
              </span>

              {/* Bottom-right resize handle */}
              <div
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                style={{ touchAction: 'none' }}
                className="absolute -bottom-2.5 -right-2.5 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-se-resize shadow-lg active:scale-125 transition"
                title="右下角リサイズ"
              />

              {/* Top-left resize handle */}
              <div
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                style={{ touchAction: 'none' }}
                className="absolute -top-2.5 -left-2.5 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-nw-resize shadow-lg active:scale-125 transition"
                title="左上角リサイズ"
              />

              {/* Top-right resize handle */}
              <div
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'ne'); }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e, 'ne'); }}
                style={{ touchAction: 'none' }}
                className="absolute -top-2.5 -right-2.5 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-ne-resize shadow-lg active:scale-125 transition"
                title="右上角リサイズ"
              />

              {/* Bottom-left resize handle */}
              <div
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'sw'); }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e, 'sw'); }}
                style={{ touchAction: 'none' }}
                className="absolute -bottom-2.5 -left-2.5 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-sw-resize shadow-lg active:scale-125 transition"
                title="左下角リサイズ"
              />
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 【下段】プレビュー、＋ー微調整、前後移動、初期値、保存 */}
        {/* ========================================================= */}
        <section className="space-y-3">
          {/* 1. Live Preview Panel */}
          <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                <Eye size={14} />
                <span>切り抜き結果プレビュー（実寸 {coords.w} × {coords.h} px）</span>
              </h3>
              <div className="flex items-center gap-2">
                {savedCount > 0 && (
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    💾 カスタム保存中: {savedCount}件
                  </span>
                )}
                <span className="text-[11px] text-slate-400">
                  問題画面での見え方
                </span>
              </div>
            </div>

            <div className="bg-white rounded-xl p-3 flex items-center justify-center min-h-[140px] max-h-60 overflow-hidden border border-slate-700 shadow-inner">
              <canvas
                ref={previewCanvasRef}
                className="max-h-56 max-w-full object-contain"
              />
            </div>
          </div>

          {/* 2. Stepper Controls Grid (＋ーで調整する機能) */}
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            {/* X Stepper */}
            <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
                <span>X位置 (左端)</span>
                <span className="text-sky-400 font-mono font-bold">{coords.x}px</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => adjustCoord('x', -10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-10</button>
                <button onClick={() => adjustCoord('x', -2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-2</button>
                <button onClick={() => adjustCoord('x', 2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+2</button>
                <button onClick={() => adjustCoord('x', 10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+10</button>
              </div>
            </div>

            {/* Y Stepper */}
            <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
                <span>Y位置 (上端)</span>
                <span className="text-sky-400 font-mono font-bold">{coords.y}px</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => adjustCoord('y', -10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-10</button>
                <button onClick={() => adjustCoord('y', -2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-2</button>
                <button onClick={() => adjustCoord('y', 2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+2</button>
                <button onClick={() => adjustCoord('y', 10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+10</button>
              </div>
            </div>

            {/* Width Stepper */}
            <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
                <span>横幅 (W)</span>
                <span className="text-sky-400 font-mono font-bold">{coords.w}px</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => adjustCoord('w', -10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-10</button>
                <button onClick={() => adjustCoord('w', -2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-2</button>
                <button onClick={() => adjustCoord('w', 2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+2</button>
                <button onClick={() => adjustCoord('w', 10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+10</button>
              </div>
            </div>

            {/* Height Stepper */}
            <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
                <span>高さ (H)</span>
                <span className="text-sky-400 font-mono font-bold">{coords.h}px</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => adjustCoord('h', -10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-10</button>
                <button onClick={() => adjustCoord('h', -2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">-2</button>
                <button onClick={() => adjustCoord('h', 2)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+2</button>
                <button onClick={() => adjustCoord('h', 10)} className="flex-1 py-1.5 bg-slate-700 rounded font-mono text-[10px] font-bold hover:bg-slate-600 active:scale-95">+10</button>
              </div>
            </div>
          </div>

          {/* 3. 前後の画像に移動するボタン */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrev}
              disabled={!prevKey}
              className={`py-3 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                prevKey
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700 active:scale-95 shadow'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
              }`}
            >
              <ChevronLeft size={16} />
              <span className="truncate">◀ 前の画像 {prevLabel ? `(${prevLabel})` : ''}</span>
            </button>

            <button
              onClick={handleNext}
              disabled={!nextKey}
              className={`py-3 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                nextKey
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-700 active:scale-95 shadow'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
              }`}
            >
              <span className="truncate">次の画像 {nextLabel ? `(${nextLabel})` : ''} ▶</span>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* 4. 初期値に戻すボタン & 保存ボタン */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleReset}
              className="py-3 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 active:scale-95 flex items-center gap-1.5"
              title="この問題のトリミングを初期値に戻す"
            >
              <RotateCcw size={14} />
              <span>この画像を初期値へ</span>
            </button>

            <button
              onClick={handleSave}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
            >
              <Save size={16} />
              <span>このトリミングを保存・反映</span>
            </button>
          </div>

          {/* 5. 全端末への反映 */}
          <div className="p-3 bg-slate-900/80 rounded-2xl border border-sky-800/50 space-y-2">
            <div className="text-xs font-bold text-sky-300">📱 スマホ・他の端末にも反映する</div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {CAN_WRITE_SHARED
                ? '以前に保存した分も含めて共有ファイルに書き込めます。書き込んだ後、AIに「トリミングを公開して」と伝えてください。'
                : 'この端末で保存したトリミングの座標をコピーします。AIとのチャットに貼り付けると、全端末に反映されるよう公開します。'}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {CAN_WRITE_SHARED && (
                <button
                  onClick={handleBulkWriteShared}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold active:scale-95 transition"
                >
                  💾 この端末の保存分（{savedCount}件）を共有ファイルへ書き込む
                </button>
              )}
              <button
                onClick={handleCopyShareData}
                className="flex-1 py-2.5 px-3 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
              >
                {shareCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>{shareCopied ? 'コピーしました' : '反映用データをコピー'}</span>
              </button>
            </div>

            {/* バックアップ保存 ＆ 復元ボタン */}
            <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleDownloadBackup}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
              >
                <Download size={14} className="text-emerald-400" />
                <span>📥 バックアップJSON保存</span>
              </button>
              <label className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer">
                <Upload size={14} className="text-sky-400" />
                <span>📤 バックアップJSON読込</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleUploadBackup}
                />
              </label>
            </div>
          </div>

          {/* 6. 全初期化救済ボタン（破損データ・容量オーバー時用） */}
          <div className="pt-2 text-center">
            <button
              onClick={handleClearAll}
              className="text-[11px] text-slate-500 hover:text-rose-400 underline flex items-center gap-1 mx-auto py-1"
            >
              <Trash2 size={12} />
              <span>カスタム保存したすべての画像を全消去して初期状態に戻す</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
