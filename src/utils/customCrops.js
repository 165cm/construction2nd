// Storage helper for user-adjusted custom image crops
//
// トリミング設定は2か所に保存される:
//   1. 共有ファイル src/data/cropOverrides.json（リポジトリに入る → 公開後すべての端末に反映）
//   2. この端末の LocalStorage（denkou_custom_crops_v1。その端末・そのブラウザだけ）
// 表示の優先順位: この端末の保存 > 共有ファイル > 初期画像（public/crops/）

import { getAssetUrl } from './asset';
import sharedOverrides from '../data/cropOverrides.json';
import { DEFAULT_CROPS } from '../data/cropsConfig';

// 問題の画像パス（例: /crops/floor_plan.png）から、管理画面のトリミング設定キーを求める
export const cropKeyForDiagram = (questionId, diagramPath) => {
  const file = (diagramPath || '').split('/').pop();
  const found = Object.keys(DEFAULT_CROPS).find((k) => DEFAULT_CROPS[k].filename === file);
  return found ?? String(questionId);
};

const STORAGE_KEY = 'denkou_custom_crops_v1';

export const SHARED_OVERRIDES_ENDPOINT = '/__admin/crop-overrides';

export const getCustomCrops = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to load custom crops:', e);
    return {};
  }
};

export const getSharedOverrides = () => sharedOverrides || {};

export const saveCustomCrop = (key, cropData) => {
  try {
    const crops = getCustomCrops();
    crops[key] = cropData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to save custom crop (quota or storage error):', e);
    return false;
  }
};

export const resetCustomCrop = (key) => {
  try {
    const crops = getCustomCrops();
    delete crops[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to reset custom crop:', e);
    return false;
  }
};

export const clearAllCustomCrops = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to clear custom crops:', e);
    return false;
  }
};

// この端末で保存した切り抜き画像（dataUrl）。無ければ null
export const getLocalCropDataUrl = (key) => {
  try {
    const custom = getCustomCrops();
    const entry = custom[String(key)];
    // Filters out empty/corrupt 1x1 dataUrls
    if (entry?.dataUrl && entry.dataUrl.length > 500) {
      return entry.dataUrl;
    }
  } catch (e) {
    console.error('Error reading local crop:', e);
  }
  return null;
};

// 共有ファイルにある座標。無ければ null
export const getSharedCropCoords = (key) => {
  const entry = getSharedOverrides()[String(key)];
  if (!entry) return null;
  const { page, x, y, w, h } = entry;
  if ([page, x, y, w, h].some((v) => typeof v !== 'number' || Number.isNaN(v))) return null;
  return entry;
};

// 同期版（共有ファイルの切り抜きは含まない）。CropImage コンポーネントの利用を推奨
export const getDisplayImageUrl = (key, defaultPath) => {
  const local = getLocalCropDataUrl(key);
  if (local) return local;
  return defaultPath ? getAssetUrl(defaultPath) : '';
};

// ---- 共有座標から、元ページ画像を切り抜いて表示用URLを作る ----

const renderedCache = new Map(); // signature -> objectURL
const pendingRenders = new Map(); // signature -> Promise

export const cropSignature = (c) => `${c.page}:${c.x}:${c.y}:${c.w}:${c.h}`;

export const getCachedCropUrl = (coords) => renderedCache.get(cropSignature(coords)) || null;

export const renderCropFromPage = (coords) => {
  const sig = cropSignature(coords);
  if (renderedCache.has(sig)) return Promise.resolve(renderedCache.get(sig));
  if (pendingRenders.has(sig)) return pendingRenders.get(sig);

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;
        const x = Math.max(0, Math.min(coords.x, naturalW - 10));
        const y = Math.max(0, Math.min(coords.y, naturalH - 10));
        const w = Math.max(20, Math.min(coords.w, naturalW - x));
        const h = Math.max(20, Math.min(coords.h, naturalH - y));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('切り抜き画像の生成に失敗しました'));
            return;
          }
          const url = URL.createObjectURL(blob);
          renderedCache.set(sig, url);
          resolve(url);
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`元ページ画像を読み込めません (page ${coords.page})`));
    img.src = getAssetUrl(`/pages/page_${coords.page}.png`);
  }).finally(() => {
    pendingRenders.delete(sig);
  });

  pendingRenders.set(sig, promise);
  return promise;
};
