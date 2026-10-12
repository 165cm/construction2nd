import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, RotateCcw, Download, Copy, Check, Sliders, Eye, Move } from 'lucide-react';
import { DEFAULT_CROPS } from '../data/cropsConfig';
import { getCustomCrops, saveCustomCrop, resetCustomCrop } from '../utils/customCrops';
import { getAssetUrl } from '../utils/asset';
import { playClick, triggerHaptic } from '../utils/sound';

export default function AdminCropEditor({ onBack }) {
  const cropKeys = Object.keys(DEFAULT_CROPS);
  const [selectedKey, setSelectedKey] = useState('1');
  const [coords, setCoords] = useState(DEFAULT_CROPS['1']);
  const [pageNumber, setPageNumber] = useState(DEFAULT_CROPS['1'].page);
  const [copied, setCopied] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const imgRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const containerRef = useRef(null);

  // Dragging states
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState('move'); // 'move' | 'se' | 'nw' | 'ne' | 'sw'
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCoords, setInitialCoords] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Load custom or default coords when selected key changes
  useEffect(() => {
    const custom = getCustomCrops();
    const active = custom[selectedKey]?.coords || DEFAULT_CROPS[selectedKey] || {
      page: 5, filename: 'custom.png', x: 200, y: 200, w: 400, h: 300, label: `問${selectedKey}`
    };
    setCoords(active);
    setPageNumber(active.page);
  }, [selectedKey]);

  // Update live preview canvas whenever image loads or coords change
  const updatePreview = () => {
    const img = imgRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas || !img.complete || img.naturalWidth === 0) return;

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
    ctx.clearRect(0, 0, safeW, safeH);
    ctx.drawImage(img, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);
  };

  useEffect(() => {
    updatePreview();
  }, [coords, pageNumber]);

  // Handle Save
  const handleSave = () => {
    playClick();
    triggerHaptic('success');
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    saveCustomCrop(selectedKey, {
      dataUrl,
      coords: { ...coords, page: pageNumber }
    });

    setSavedMessage(`✅ ${coords.label || `問${selectedKey}`} のトリミングを保存・反映しました！`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  // Handle Reset
  const handleReset = () => {
    playClick();
    triggerHaptic('light');
    resetCustomCrop(selectedKey);
    const def = DEFAULT_CROPS[selectedKey];
    if (def) {
      setCoords(def);
      setPageNumber(def.page);
    }
    setSavedMessage('🔄 初期値にリセットしました');
    setTimeout(() => setSavedMessage(''), 3000);
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
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    setDragStart({ x: clientX, y: clientY });
    setInitialCoords({ ...coords });
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !imgRef.current) return;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

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
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
    >
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { playClick(); onBack(); }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-black text-white flex items-center gap-1.5">
              <span>🛠️ トリミング位置 調整管理</span>
            </h1>
            <p className="text-[10px] text-slate-400">
              問題画像の切り抜き枠をドラッグや数値で微調整できます
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition"
        >
          <Save size={14} />
          <span>保存・反映</span>
        </button>
      </div>

      {/* Toast Notice */}
      {savedMessage && (
        <div className="bg-emerald-500/20 border-b border-emerald-500/40 text-emerald-300 px-4 py-2 text-xs font-bold text-center animate-pop">
          {savedMessage}
        </div>
      )}

      {/* Control Bar: Question & Page selection */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap gap-2 items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <label className="text-slate-400 font-bold">対象:</label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
          >
            {cropKeys.map(k => (
              <option key={k} value={k}>
                {DEFAULT_CROPS[k].label || `問${k}`}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-slate-400 font-bold">元頁:</label>
          <select
            value={pageNumber}
            onChange={(e) => setPageNumber(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-sky-500"
          >
            {Array.from({ length: 16 }, (_, i) => i + 1).map(p => (
              <option key={p} value={p}>
                {p} ページ
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleReset}
            className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
            title="初期値に戻す"
          >
            <RotateCcw size={12} />
            <span>初期値</span>
          </button>
          <button
            onClick={handleDownload}
            className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
            title="PNG保存"
          >
            <Download size={12} />
            <span>PNG</span>
          </button>
          <button
            onClick={handleCopyConfig}
            className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 border border-slate-700"
            title="Pythonコードコピー"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copied ? 'コピー済' : 'コード'}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Panel Layout */}
      <div className="p-3 space-y-4 max-w-4xl mx-auto w-full">
        {/* Live Preview Panel */}
        <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
              <Eye size={14} />
              <span>切り抜き結果プレビュー（実寸 {coords.w} × {coords.h} px）</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              問題画面での見え方
            </span>
          </div>

          <div className="bg-white rounded-xl p-3 flex items-center justify-center min-h-[140px] max-h-60 overflow-hidden border border-slate-700 shadow-inner">
            <canvas
              ref={previewCanvasRef}
              className="max-h-56 max-w-full object-contain"
            />
          </div>
        </div>

        {/* Stepper Controls Grid */}
        <div className="p-3 bg-slate-900/80 rounded-2xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {/* X Stepper */}
          <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
              <span>X位置 (左端)</span>
              <span className="text-sky-400 font-mono">{coords.x}px</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => adjustCoord('x', -10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-10</button>
              <button onClick={() => adjustCoord('x', -2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-2</button>
              <button onClick={() => adjustCoord('x', 2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+2</button>
              <button onClick={() => adjustCoord('x', 10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+10</button>
            </div>
          </div>

          {/* Y Stepper */}
          <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
              <span>Y位置 (上端)</span>
              <span className="text-sky-400 font-mono">{coords.y}px</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => adjustCoord('y', -10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-10</button>
              <button onClick={() => adjustCoord('y', -2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-2</button>
              <button onClick={() => adjustCoord('y', 2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+2</button>
              <button onClick={() => adjustCoord('y', 10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+10</button>
            </div>
          </div>

          {/* Width Stepper */}
          <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
              <span>横幅 (W)</span>
              <span className="text-sky-400 font-mono">{coords.w}px</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => adjustCoord('w', -10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-10</button>
              <button onClick={() => adjustCoord('w', -2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-2</button>
              <button onClick={() => adjustCoord('w', 2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+2</button>
              <button onClick={() => adjustCoord('w', 10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+10</button>
            </div>
          </div>

          {/* Height Stepper */}
          <div className="p-2 bg-slate-800/80 rounded-xl border border-slate-700/60">
            <div className="flex justify-between text-slate-400 text-[11px] font-bold mb-1">
              <span>高さ (H)</span>
              <span className="text-sky-400 font-mono">{coords.h}px</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => adjustCoord('h', -10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-10</button>
              <button onClick={() => adjustCoord('h', -2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">-2</button>
              <button onClick={() => adjustCoord('h', 2)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+2</button>
              <button onClick={() => adjustCoord('h', 10)} className="flex-1 py-1 bg-slate-700 rounded font-mono text-[10px] hover:bg-slate-600">+10</button>
            </div>
          </div>
        </div>

        {/* Visual Interactive Page Canvas */}
        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-2 text-xs">
            <h3 className="font-bold text-slate-200 flex items-center gap-1.5">
              <Move size={14} className="text-amber-400" />
              <span>原寸ページ（赤枠をドラッグまたは端をつかんで拡大縮小）</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              第 {pageNumber} 頁
            </span>
          </div>

          <div
            ref={containerRef}
            className="relative bg-slate-950 rounded-xl overflow-hidden border border-slate-700 shadow-2xl select-none"
          >
            {/* Full page image */}
            <img
              ref={imgRef}
              src={getAssetUrl(`/pages/page_${pageNumber}.png`)}
              alt="元頁"
              onLoad={updatePreview}
              className="w-full h-auto block select-none pointer-events-none"
              draggable="false"
            />

            {/* Draggable Crop Selection Box Overlay */}
            <div
              style={boxStyle}
              onPointerDown={(e) => handlePointerDown(e, 'move')}
              onTouchStart={(e) => handlePointerDown(e, 'move')}
              className="absolute border-2 border-red-500 bg-red-500/20 cursor-move flex items-center justify-center shadow-lg group pointer-events-auto"
            >
              {/* Center move label */}
              <span className="bg-red-600/90 text-white font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow pointer-events-none">
                {coords.w} × {coords.h}
              </span>

              {/* Bottom-right resize handle */}
              <div
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e, 'se'); }}
                className="absolute -bottom-2 -right-2 w-5 h-5 bg-red-500 border-2 border-white rounded-full cursor-se-resize shadow-lg active:scale-125 transition"
              />

              {/* Top-left resize handle */}
              <div
                onPointerDown={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                onTouchStart={(e) => { e.stopPropagation(); handlePointerDown(e, 'nw'); }}
                className="absolute -top-2 -left-2 w-5 h-5 bg-red-500 border-2 border-white rounded-full cursor-nw-resize shadow-lg active:scale-125 transition"
              />
            </div>
          </div>
        </div>

        {/* Bottom Save Action */}
        <div className="pt-2 flex gap-2">
          <button
            onClick={handleReset}
            className="py-3 px-4 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 active:scale-95"
          >
            初期値に戻す
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-900/40 active:scale-[0.98] transition flex items-center justify-center gap-1.5"
          >
            <Save size={16} />
            <span>このトリミングを保存してアプリに反映</span>
          </button>
        </div>
      </div>
    </div>
  );
}
