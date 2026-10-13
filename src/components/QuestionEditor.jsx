import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, Check, Save, RotateCcw, Download, Upload, Copy, 
  ExternalLink, Search, Eye, AlertCircle, Sparkles, ChevronLeft, ChevronRight, Layers
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
import { getAssetUrl } from '../utils/asset';

export default function QuestionEditor() {
  const [selectedExamId, setSelectedExamId] = useState('r8_1');
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [overrides, setOverrides] = useState(getQuestionOverrides);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [filterOnlyModified, setFilterOnlyModified] = useState(false);
  const [customPageNum, setCustomPageNum] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const fileInputRef = useRef(null);

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
  const examOverrideCount = Object.keys(overrides[selectedExamId] || {}).length;
  const totalOverrideCount = Object.keys(overrides).reduce((acc, k) => acc + Object.keys(overrides[k] || {}).length, 0);

  // フォーム変更ハンドラー
  const handleChoiceChange = (choiceId, newText) => {
    setFormData(prev => ({
      ...prev,
      choices: prev.choices.map(c => c.id === choiceId ? { ...c, text: newText } : c)
    }));
  };

  // 保存（ローカルオーバーライドに反映）
  const handleSave = () => {
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

  // 原本画像パスの算出（問題デフォルトまたは手動切り替えページ）
  const defaultPageMatch = currentQuestion?.fullPage?.match(/page_(\d+)\.png/);
  const defaultPageNum = defaultPageMatch ? parseInt(defaultPageMatch[1], 10) : 5;
  const activePageNum = customPageNum !== null ? customPageNum : defaultPageNum;
  const originalPdfPageUrl = `${examMeta.pageDir}/page_${activePageNum}.png`;

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
                onClick={() => setSelectedQuestionIndex(idx)}
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

      {/* メイン編集エリア：左「原本プレビュー」 / 右「修正フォーム」 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* 左側：原本PDF対照プレビュー */}
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
                onClick={() => setCustomPageNum(examMeta.floorPlanPage || 15)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-amber-300 border border-amber-500/30"
                title="配線図原本ページへジャンプ"
              >
                配線図(P15)
              </button>
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

          {/* 原本画像コンテナ */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-auto max-h-[70vh] min-h-[360px] flex items-start justify-center p-2 relative shadow-inner">
            <img
              src={getAssetUrl(originalPdfPageUrl)}
              alt={`原本 問${currentQuestion?.id}`}
              style={{ 
                transform: `scale(${zoomLevel})`, 
                transformOrigin: 'top center', 
                transition: 'transform 0.15s ease-out' 
              }}
              className="max-w-full rounded shadow object-contain"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = getAssetUrl('/pages/page_5.png'); // ベースURL付きフォールバック
              }}
            />
          </div>
          <p className="text-[10px] text-slate-500 text-center">
            ※ 上記原本PDFの該当問と照合しながら、右側のフォームを編集してください。
          </p>
        </div>

        {/* 右側：問題テキスト編集フォーム */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">✏️</span>
              <h3 className="text-xs font-bold text-slate-200">
                問{currentQuestion?.id} テキスト修正フォーム
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
              <button
                onClick={handleSave}
                className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-sky-500/20 active:scale-95 transition"
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
                  💡 「図面・写真あり」で保存すると、<strong>「①画像トリミング」の一覧にこの問が追加</strong>され、切り抜き位置を調整できるようになります。
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
              選択肢（イ・ロ・ハ・ニ）
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

          {/* 正解選択肢 */}
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
              rows={6}
              value={formData.explanation}
              onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-none focus:border-sky-500 leading-relaxed"
            />
          </div>

          {/* フッターナビゲーション */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-800">
            <button
              onClick={() => setSelectedQuestionIndex(prev => Math.max(0, prev - 1))}
              disabled={selectedQuestionIndex === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none rounded-xl text-xs font-bold text-slate-300 flex items-center gap-1"
            >
              <ChevronLeft size={14} />
              <span>前の問</span>
            </button>
            <span className="text-[11px] text-slate-500">
              Q{currentQuestion?.id} / 50
            </span>
            <button
              onClick={() => setSelectedQuestionIndex(prev => Math.min(rawQuestions.length - 1, prev + 1))}
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
  );
}
