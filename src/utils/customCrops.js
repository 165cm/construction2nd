// Storage helper for user-adjusted custom image crops
//
// トリミング設定は2か所に保存される:
//   1. 共有ファイル src/data/cropOverrides.json（リポジトリに入る → 公開後すべての端末に反映）
//   2. この端末の LocalStorage（denkou_custom_crops_v1。その端末・そのブラウザだけ）
// 表示の優先順位: この端末の保存 > 共有ファイル > 初期画像（public/crops/）

import { getAssetUrl } from './asset';
import sharedOverrides from '../data/cropOverrides.json';
import { DEFAULT_CROPS } from '../data/cropsConfig';
import { EXAM_LIST } from '../data/examList';
import { getQuestionOverrides } from './objections';

// 問題ごとのトリミングキー（画像の有無の設定にも使う）。令和8年度上期は番号だけ、他の年度は "r7_2_12" の形
export const questionCropKey = (examId, questionId) =>
  !examId || examId === 'r8_1' ? String(questionId) : `${examId}_${questionId}`;

// トリミングキー（例: "r7_2_12", "r7_2_floor_plan", "12"）から、元ページ画像のフォルダを求める。
// 年度が付いていないキーは令和8年度上期（/pages）
export const pageDirForCropKey = (key) => {
  const k = String(key);
  const exam = EXAM_LIST.find(e => e.id !== 'r8_1' && k.startsWith(`${e.id}_`));
  return exam ? exam.pageDir : '/pages';
};

// 座標を保存用の形にそろえる（pageDir を必ず残す。抜けると令和8年のページから切り抜かれてしまう）
const normalizeCoords = (key, coords) => ({
  page: coords.page,
  pageDir: coords.pageDir || pageDirForCropKey(key),
  x: Math.round(coords.x),
  y: Math.round(coords.y),
  w: Math.round(coords.w),
  h: Math.round(coords.h),
  label: coords.label || `問${key}`
});

// 問題の画像パス（例: /crops/floor_plan.png）から、管理画面のトリミング設定キーを求める
export const cropKeyForDiagram = (questionId, diagramPath, examId) => {
  if (diagramPath && diagramPath.includes('floor_plan')) {
    return examId && examId !== 'r8_1' ? `${examId}_floor_plan` : 'floor_plan';
  }
  if (diagramPath && diagramPath.includes('panel_schedule')) {
    return examId && examId !== 'r8_1' ? `${examId}_panel_schedule` : 'panel_schedule';
  }
  if (examId && examId !== 'r8_1') {
    return `${examId}_${questionId}`;
  }
  return String(questionId);
};

const STORAGE_KEY = 'denkou_custom_crops_v1';

export const SHARED_OVERRIDES_ENDPOINT = '/__admin/crop-overrides';
export const CAN_WRITE_SHARED = import.meta.env.DEV;

export const writeSharedOverrides = async (updates = {}, removals = []) => {
  const res = await fetch(SHARED_OVERRIDES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates, removals })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `書き込みに失敗しました (HTTP ${res.status})`);
  }
  return data;
};

// 端末内の保存データを取得（巨大なdataUrlが含まれていれば自動クリーンアップして容量を解放）
export const getCustomCrops = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    let needClean = false;
    // クリーンアップ: dataUrl が残っていれば削除して coords のみ保持
    Object.keys(parsed).forEach((k) => {
      if (parsed[k]?.dataUrl) {
        delete parsed[k].dataUrl;
        needClean = true;
      }
    });
    if (needClean) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (e) {
        console.warn('Could not resave cleaned crops:', e);
      }
    }
    return parsed;
  } catch (e) {
    console.error('Failed to load custom crops:', e);
    return {};
  }
};

export const getSharedOverrides = () => sharedOverrides || {};

// 座標データのみを保存（dataUrlを保存しないため、LocalStorage容量制限5MBに絶対に引っかからない）
export const saveCustomCrop = (key, cropData) => {
  try {
    const crops = getCustomCrops();
    const coords = cropData?.coords || (cropData?.page ? cropData : null);
    if (!coords) return false;

    // dataUrlは保存せず座標のみ保持（1問あたり50バイト・250問で12KBの超軽量）
    crops[String(key)] = { coords: normalizeCoords(key, coords) };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to save custom crop:', e);
    return false;
  }
};

// JSONバックアップをインポート（復元）
export const importCustomCrops = (jsonData) => {
  try {
    let target = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    // 以前の「コピー」機能は二重にJSON化した文字列を出していたため、その形式も読めるようにする
    if (typeof target === 'string') target = JSON.parse(target);
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new Error('トリミング設定の形式ではありません');
    }
    const current = getCustomCrops();
    let imported = 0;
    Object.keys(target).forEach((k) => {
      const item = target[k];
      const coords = item?.coords || item;
      if (coords && typeof coords.page === 'number') {
        current[String(k)] = { coords: normalizeCoords(k, coords) };
        imported += 1;
      }
    });
    if (imported === 0) {
      throw new Error('読み込めるトリミング設定が見つかりませんでした');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event('custom-crops-updated'));
    return { success: true, count: imported };
  } catch (e) {
    console.error('Failed to import custom crops:', e);
    return { success: false, error: e.message };
  }
};

// 全トリミング座標をJSONとしてエクスポート（共有データ＋ローカル調整データの完全マージ）
// 管理画面で切り替えた「画像あり／テキスト問題」の設定も showImage として含める。
// （以前は座標だけを書き出していたため、画像なしの問題を「画像あり」にしても公開サイトに反映されなかった）
export const exportAllCropsData = () => {
  const merged = {};
  Object.entries(getSharedOverrides()).forEach(([k, v]) => { merged[k] = { ...v }; });
  const custom = getCustomCrops();
  Object.keys(custom).forEach((k) => {
    if (custom[k]?.coords) {
      merged[k] = { ...(merged[k] || {}), ...custom[k].coords };
    }
  });
  const overrides = getQuestionOverrides();
  Object.entries(overrides).forEach(([examId, byQuestion]) => {
    Object.entries(byQuestion || {}).forEach(([qid, q]) => {
      if (!q || !Object.prototype.hasOwnProperty.call(q, 'diagram')) return;
      const key = questionCropKey(examId, qid);
      merged[key] = { ...(merged[key] || { label: `問${qid}` }), showImage: Boolean(q.diagram) };
    });
  });
  return JSON.stringify(merged, null, 2);
};

export const getCustomCropsCount = () => {
  const merged = { ...getSharedOverrides() };
  const custom = getCustomCrops();
  Object.keys(custom).forEach((k) => {
    if (custom[k]?.coords) {
      merged[k] = custom[k].coords;
    }
  });
  return Object.keys(merged).length;
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

// この端末で保存した切り抜き画像。無ければ null
export const getLocalCropDataUrl = () => null; // dataUrlは保持せず動的レンダリングまたは共有座標を使用

// 共有ファイルにある座標。無ければ null
export const getSharedCropCoords = (key) => {
  const entry = getSharedOverrides()[String(key)];
  if (!entry) return null;
  const { page, x, y, w, h } = entry;
  if ([page, x, y, w, h].some((v) => typeof v !== 'number' || Number.isNaN(v))) return null;
  return { ...entry, pageDir: entry.pageDir || pageDirForCropKey(key) };
};

// 配線図問題の画像が「配線図ページ」から切り抜かれているか（問題文ページからなら false）。
// 切り抜き座標が無い場合は、初期画像（配線図の拡大画像）なので true
export const isCropFromFloorPlan = (key, floorPlanPage = 15) => {
  const coords = getActiveCropCoords(key);
  return !coords || coords.page === floorPlanPage;
};

// 端末ローカルの保存座標を優先し、無ければ共有ファイル座標を返す
export const getActiveCropCoords = (key) => {
  try {
    const custom = getCustomCrops();
    const localEntry = custom[String(key)];
    if (localEntry?.coords && typeof localEntry.coords.page === 'number') {
      return { ...localEntry.coords, pageDir: localEntry.coords.pageDir || pageDirForCropKey(key) };
    }
  } catch (e) {
    console.error(e);
  }
  return getSharedCropCoords(key);
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

export const cropSignature = (c) => `hd:${c.pageDir || ''}:${c.page}:${c.x}:${c.y}:${c.w}:${c.h}`;

// 切り抜き位置（x, y, w, h）は、管理画面で使う縮めたページ画像（高さ 1200px の PNG）が基準。
// 利用者の画面では高画質の WebP（高さ約 2250px）から、位置を「WebP の高さ / 1200」倍して切り抜く。
export const CROP_BASE_PAGE_HEIGHT = 1200;
const pagePngPath = (c) => `${c.pageDir || '/pages'}/page_${c.page}.png`;
export const hdPagePath = (pageDir, page) => `${pageDir || '/pages'}/page_${page}.webp`;

const loadImage = (path) => new Promise((resolve, reject) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`元ページ画像を読み込めません (${path})`));
  img.src = getAssetUrl(path);
});

// 高画質の WebP を先に読み込んでおく（配線図の問題に近づいた時など。表示を速くするため）
const prefetched = new Set();
export const prefetchHdPage = (pageDir, page) => {
  const path = hdPagePath(pageDir, page);
  if (prefetched.has(path)) return;
  prefetched.add(path);
  loadImage(path).catch(() => prefetched.delete(path));
};

export const getCachedCropUrl = (coords) => renderedCache.get(cropSignature(coords)) || null;

export const renderCropFromPage = (coords) => {
  const sig = cropSignature(coords);
  if (renderedCache.has(sig)) return Promise.resolve(renderedCache.get(sig));
  if (pendingRenders.has(sig)) return pendingRenders.get(sig);

  // 高画質の WebP を使う。読めなければ縮めた PNG（等倍）で切り抜く
  const promise = loadImage(hdPagePath(coords.pageDir, coords.page))
    .catch(() => loadImage(pagePngPath(coords)))
    .then((img) => new Promise((resolve, reject) => {
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const scale = naturalH / CROP_BASE_PAGE_HEIGHT;
      const x = Math.max(0, Math.min(Math.round(coords.x * scale), naturalW - 10));
      const y = Math.max(0, Math.min(Math.round(coords.y * scale), naturalH - 10));
      const w = Math.max(20, Math.min(Math.round(coords.w * scale), naturalW - x));
      const h = Math.max(20, Math.min(Math.round(coords.h * scale), naturalH - y));

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
    }))
    .finally(() => {
      pendingRenders.delete(sig);
    });

  pendingRenders.set(sig, promise);
  return promise;
};
