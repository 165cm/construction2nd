import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import AssetImage from './AssetImage';

export default function WiringDiagramModal({ isOpen, onClose, highlightMarker, currentExamMeta }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('full'); // 'full' | 'floor' | 'panel'
  const [isDragging, setIsDragging] = useState(false);

  // Touch tracking for pinch-zoom and drag
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });
  const initialDistanceRef = useRef(null);
  const initialScaleRef = useRef(1);

  // Reset transform when changing tab
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  const examPageDir = currentExamMeta?.pageDir || '/pages';
  const getTabSrc = () => {
    // 高画質の WebP（scripts/build_hd_pages.py で作成）
    if (activeTab === 'floor') return `${examPageDir}/floor_plan.webp`;
    if (activeTab === 'panel') return `${examPageDir}/panel_schedule.webp`;
    return `${examPageDir}/page_${currentExamMeta?.floorPlanPage || 15}.webp`;
  };

  // Mouse drag handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    posStartRef.current = { ...position };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: posStartRef.current.x + dx,
      y: posStartRef.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale((s) => Math.min(Math.max(s * zoomFactor, 0.7), 4.5));
  };

  // Touch handlers (Single finger = drag, Two fingers = pinch zoom)
  const getDistance = (t1, t2) => {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      posStartRef.current = { ...position };
      initialDistanceRef.current = null;
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      initialDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && isDragging) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;
      setPosition({
        x: posStartRef.current.x + dx,
        y: posStartRef.current.y + dy
      });
    } else if (e.touches.length === 2 && initialDistanceRef.current) {
      const currentDistance = getDistance(e.touches[0], e.touches[1]);
      const factor = currentDistance / initialDistanceRef.current;
      const newScale = Math.min(Math.max(initialScaleRef.current * factor, 0.7), 4.5);
      setScale(newScale);
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      initialDistanceRef.current = null;
    } else if (e.touches.length === 1) {
      // Switched from pinch to single finger drag
      setIsDragging(true);
      dragStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      posStartRef.current = { ...position };
      initialDistanceRef.current = null;
    }
  };

  const examTitle = currentExamMeta?.name || '令和8年度 上期';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-md animate-pop select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 border-b border-slate-800 bg-slate-900/95 text-white">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-xl shrink-0">📄</span>
          <div className="truncate">
            <div className="flex items-center space-x-1.5">
              <h3 className="font-bold text-sm text-sky-400 truncate">配線図ビューア</h3>
              <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-500/30 px-1.5 py-0.2 rounded font-semibold shrink-0">
                {examTitle}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate">平面図 ＆ 分電盤結線図</p>
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => setScale((s) => Math.min(s + 0.3, 4.5))}
            className="p-1.5 sm:p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg active:scale-95"
            title="拡大"
          >
            <ZoomIn size={17} />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s - 0.3, 0.7))}
            className="p-1.5 sm:p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg active:scale-95"
            title="縮小"
          >
            <ZoomOut size={17} />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 sm:p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg active:scale-95"
            title="リセット"
          >
            <RotateCcw size={17} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 ml-1 text-white bg-red-600/90 hover:bg-red-500 rounded-lg active:scale-95 shadow-md shadow-red-950/50"
            title="閉じる"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-900/70 text-xs">
        <button
          onClick={() => handleTabChange('full')}
          className={`flex-1 py-2 font-semibold text-center transition ${
            activeTab === 'full' ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-950/40' : 'text-slate-400'
          }`}
        >
          全図面（原寸15頁）
        </button>
        <button
          onClick={() => handleTabChange('floor')}
          className={`flex-1 py-2 font-semibold text-center transition ${
            activeTab === 'floor' ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-950/40' : 'text-slate-400'
          }`}
        >
          平面図（拡大）
        </button>
        <button
          onClick={() => handleTabChange('panel')}
          className={`flex-1 py-2 font-semibold text-center transition ${
            activeTab === 'panel' ? 'text-sky-400 border-b-2 border-sky-400 bg-sky-950/40' : 'text-slate-400'
          }`}
        >
          分電盤結線図（拡大）
        </button>
      </div>

      {/* Marker Notice */}
      {highlightMarker && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span>🎯 この問題の対象箇所:</span>
            <strong className="text-sm bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">{highlightMarker}</strong>
          </span>
          <span className="text-slate-400 text-[11px] hidden sm:inline">図面上の丸数字を探してください</span>
        </div>
      )}

      {/* Interactive Diagram Pan-Zoom View */}
      <div
        className="flex-1 overflow-hidden relative flex items-center justify-center bg-slate-950 touch-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          // will-change や translate3d を付けると、拡大前の大きさで描いた絵を引き伸ばすため文字がぼやける。
          // 付けずにおくと、拡大した大きさで描き直されて、高解像度の画像がくっきり見える
          className="transition-transform duration-75 origin-center max-w-none flex items-center justify-center"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`
          }}
        >
          <AssetImage
            key={activeTab + examPageDir}
            path={getTabSrc()}
            fallbackPath={getTabSrc().replace(/\.webp$/, '.png')}
            alt="第二種電気工事士 配線図"
            className="max-h-[80vh] max-w-[95vw] object-contain rounded shadow-2xl bg-white select-none pointer-events-none"
            draggable="false"
          />
        </div>

        {/* Floating guidance badge */}
        <div className="absolute top-2 left-2 pointer-events-none bg-slate-900/80 backdrop-blur border border-slate-700/80 text-slate-300 text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg">
          <Move size={11} className="text-sky-400" />
          <span>ドラッグで移動 / ピンチで拡大縮小</span>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="p-2 px-3 text-center text-xs text-slate-400 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">倍率: {Math.round(scale * 100)}%</span>
        <button
          onClick={resetZoom}
          className="text-[11px] text-sky-400 hover:text-sky-300 font-medium px-2 py-0.5 rounded bg-sky-950/50 border border-sky-500/30"
        >
          位置・倍率をリセット
        </button>
      </div>
    </div>
  );
}

