import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import { getAssetUrl } from '../utils/asset';
import { getDisplayImageUrl } from '../utils/customCrops';

export default function WiringDiagramModal({ isOpen, onClose, highlightMarker }) {
  const [scale, setScale] = useState(1);
  const [activeTab, setActiveTab] = useState('full'); // 'full' | 'floor' | 'panel'

  if (!isOpen) return null;

  const getImageSrc = () => {
    if (activeTab === 'floor') return getDisplayImageUrl('floor_plan', '/crops/floor_plan.png');
    if (activeTab === 'panel') return getDisplayImageUrl('panel_schedule', '/crops/panel_schedule.png');
    return getAssetUrl('/pages/page_15.png');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md animate-pop">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 text-white">
        <div className="flex items-center space-x-2">
          <span className="text-xl">📄</span>
          <div>
            <h3 className="font-bold text-sm text-sky-400">配線図（15頁）ビューア</h3>
            <p className="text-xs text-slate-400">RC造集合住宅 平面図＆分電盤結線図</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setScale(s => Math.min(s + 0.3, 3))}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg active:scale-95"
            title="拡大"
          >
            <ZoomIn size={18} />
          </button>
          <button
            onClick={() => setScale(s => Math.max(s - 0.3, 0.7))}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg active:scale-95"
            title="縮小"
          >
            <ZoomOut size={18} />
          </button>
          <button
            onClick={() => setScale(1)}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg active:scale-95"
            title="リセット"
          >
            <RotateCcw size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-2 ml-2 text-slate-300 hover:text-white bg-red-600/80 rounded-lg active:scale-95"
            title="閉じる"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 text-xs">
        <button
          onClick={() => { setActiveTab('full'); setScale(1); }}
          className={`flex-1 py-2 font-medium text-center transition ${
            activeTab === 'full' ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-950/30' : 'text-slate-400'
          }`}
        >
          全図面（原寸15頁）
        </button>
        <button
          onClick={() => { setActiveTab('floor'); setScale(1); }}
          className={`flex-1 py-2 font-medium text-center transition ${
            activeTab === 'floor' ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-950/30' : 'text-slate-400'
          }`}
        >
          平面図（拡大）
        </button>
        <button
          onClick={() => { setActiveTab('panel'); setScale(1); }}
          className={`flex-1 py-2 font-medium text-center transition ${
            activeTab === 'panel' ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-950/30' : 'text-slate-400'
          }`}
        >
          分電盤結線図（拡大）
        </button>
      </div>

      {/* Marker Notice */}
      {highlightMarker && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <span>🎯 この問題の対象箇所: <strong>{highlightMarker}</strong></span>
          <span className="text-slate-400">図面上の丸数字を探してください</span>
        </div>
      )}

      {/* Diagram Scrollable View */}
      <div className="flex-1 overflow-auto p-2 flex items-center justify-center bg-slate-950 touch-pan-x touch-pan-y">
        <div
          className="transition-transform duration-150 origin-center max-w-full"
          style={{ transform: `scale(${scale})` }}
        >
          <img
            src={getImageSrc()}
            alt="第二種電気工事士 配線図"
            className="max-h-[82vh] object-contain rounded shadow-2xl bg-white select-none pointer-events-auto"
            draggable="false"
          />
        </div>
      </div>

      {/* Bottom Hint */}
      <div className="p-2 text-center text-xs text-slate-500 bg-slate-900 border-t border-slate-800">
        ピンチや拡大ボタンで拡大縮小できます。見終わったら右上の「✕」で戻ります。
      </div>
    </div>
  );
}
