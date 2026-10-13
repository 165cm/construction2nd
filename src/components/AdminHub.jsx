import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Crop, FileEdit, Sparkles, Database, 
  Download, Upload, CheckCircle2, ShieldCheck, RefreshCw, AlertTriangle
} from 'lucide-react';
import AdminCropEditor from './AdminCropEditor';
import QuestionEditor from './QuestionEditor';
import ObjectionReviewer from './ObjectionReviewer';
import { exportAllCropsData, importCustomCrops, getCustomCropsCount } from '../utils/customCrops';
import { exportAllOverrides, importQuestionOverrides, getQuestionOverrides, getObjections } from '../utils/objections';

export default function AdminHub({ onBack }) {
  const [activeTab, setActiveTab] = useState('crop'); // 'crop' | 'question' | 'objection' | 'backup'
  const [cropsCount, setCropsCount] = useState(getCustomCropsCount);
  const [pendingObjectionsCount, setPendingObjectionsCount] = useState(() => {
    return getObjections().filter(o => o.status === 'pending').length;
  });
  const [overridesCount, setOverridesCount] = useState(() => {
    const ov = getQuestionOverrides();
    return Object.keys(ov).reduce((acc, k) => acc + Object.keys(ov[k] || {}).length, 0);
  });
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const handleCropsUpdate = () => setCropsCount(getCustomCropsCount());
    const handleObjUpdate = () => {
      setPendingObjectionsCount(getObjections().filter(o => o.status === 'pending').length);
    };
    const handleOverrideUpdate = () => {
      const ov = getQuestionOverrides();
      setOverridesCount(Object.keys(ov).reduce((acc, k) => acc + Object.keys(ov[k] || {}).length, 0));
    };

    window.addEventListener('custom-crops-updated', handleCropsUpdate);
    window.addEventListener('objections-updated', handleObjUpdate);
    window.addEventListener('question-overrides-updated', handleOverrideUpdate);

    return () => {
      window.removeEventListener('custom-crops-updated', handleCropsUpdate);
      window.removeEventListener('objections-updated', handleObjUpdate);
      window.removeEventListener('question-overrides-updated', handleOverrideUpdate);
    };
  }, []);

  // 全管理データまるごとバックアップ
  const handleFullBackup = () => {
    const cropsData = exportAllCropsData();
    const overridesData = exportAllOverrides();
    const fullBundle = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      crops: typeof cropsData === 'string' ? JSON.parse(cropsData) : cropsData,
      questionOverrides: typeof overridesData === 'string' ? JSON.parse(overridesData) : overridesData,
      objections: getObjections()
    };
    const blob = new Blob([JSON.stringify(fullBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `denkou2_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('すべての管理データをまるごとバックアップ保存しました！💾');
  };

  // 全管理データまるごと復元
  const handleFullRestore = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bundle = JSON.parse(evt.target.result);
        if (bundle.crops) importCustomCrops(bundle.crops);
        if (bundle.questionOverrides) importQuestionOverrides(bundle.questionOverrides);
        if (bundle.objections) {
          localStorage.setItem('denkou2_objections_v1', JSON.stringify(bundle.objections));
          window.dispatchEvent(new Event('objections-updated'));
        }
        showToast('全管理データの復元が完了しました！🎉');
      } catch (err) {
        alert('復元ファイルの読み込みに失敗しました: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* トースト表示 */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 bg-emerald-500 text-slate-950 font-black text-xs rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* トップナビゲーションバー */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5 text-xs font-bold"
            >
              <ArrowLeft size={16} />
              <span>アプリに戻る</span>
            </button>
            <div className="h-4 w-px bg-slate-700" />
            <div>
              <h1 className="text-sm font-black text-white flex items-center gap-2">
                <span>⚡️ 第二種電気工事士 管理センター</span>
                <span className="text-[10px] bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-mono">
                  #admin
                </span>
              </h1>
              <p className="text-[10px] text-slate-400">
                原本照合・トリミング調整・異議申し立てAI承認・バックアップ集約ハブ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFullBackup}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
              title="全データの一括バックアップをダウンロード"
            >
              <Download size={14} className="text-sky-400" />
              <span className="hidden sm:inline">全データ一括バックアップ</span>
            </button>
          </div>
        </div>

        {/* タブ一覧 */}
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-2 overflow-x-auto scrollbar-none border-t border-slate-800/60 pt-1">
          <button
            onClick={() => setActiveTab('crop')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === 'crop'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Crop size={15} />
            <span>① 画像トリミング調整</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
              {cropsCount}問
            </span>
          </button>

          <button
            onClick={() => setActiveTab('question')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === 'question'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileEdit size={15} />
            <span>② 原本対照＆問題文エディタ</span>
            {overridesCount > 0 && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                {overridesCount}問修正済
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('objection')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap relative ${
              activeTab === 'objection'
                ? 'border-amber-400 text-amber-400 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles size={15} className="text-amber-400" />
            <span>③ 異議あり！＆AI修正承認</span>
            {pendingObjectionsCount > 0 && (
              <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.2 rounded-full animate-pulse">
                {pendingObjectionsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database size={15} />
            <span>④ バックアップ＆データ安全管理</span>
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {activeTab === 'crop' && (
          <div>
            <AdminCropEditor onBack={onBack} isEmbedded />
          </div>
        )}

        {activeTab === 'question' && (
          <QuestionEditor />
        )}

        {activeTab === 'objection' && (
          <ObjectionReviewer 
            onOpenEditorWithQuestion={(examId, questionId) => {
              setActiveTab('question');
            }} 
          />
        )}

        {activeTab === 'backup' && (
          <div className="space-y-6 max-w-3xl mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-3">
                <Database className="text-sky-400" size={24} />
                <div>
                  <h2 className="text-sm font-black text-slate-100">データ保全とバックアップ</h2>
                  <p className="text-xs text-slate-400">
                    250問のトリミング座標・問題文手動修正・ユーザーからの異議申立データを安全に管理・保存します。
                  </p>
                </div>
              </div>

              {/* 容量制限ゼロ保証の解説 */}
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <ShieldCheck size={16} />
                  <span>LocalStorage 容量制限（QuotaExceededError）は根本解消済みです</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  巨大な画像（base64）をブラウザに保存する方式を完全廃止し、座標データ（x, y, w, h: わずか数十バイト）のみを保存する設計に改修しました。250問全問を保存しても約12KB程度のため、ブラウザ容量上限（5MB）に達することは永久にありません。
                </p>
              </div>

              {/* まるごとバックアップと復元 */}
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-slate-200">全データ丸ごとバックアップ</h3>
                  <p className="text-[11px] text-slate-400">
                    現在の全トリミング座標、修正した問題文、異議申し立て履歴を1つのJSONにまとめてダウンロードします。
                  </p>
                  <button
                    onClick={handleFullBackup}
                    className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Download size={14} />
                    <span>まるごとバックアップJSON保存</span>
                  </button>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <h3 className="text-xs font-bold text-slate-200">バックアップJSONから復元</h3>
                  <p className="text-[11px] text-slate-400">
                    保存したJSONファイルを読み込み、端末のローカルストレージへ一括復元します。
                  </p>
                  <label className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer">
                    <Upload size={14} />
                    <span>復元JSONファイルを選択</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFullRestore}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
