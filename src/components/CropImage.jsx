import React, { useEffect, useState } from 'react';
import { getAssetUrl } from '../utils/asset';
import {
  getActiveCropCoords,
  getCachedCropUrl,
  renderCropFromPage,
  cropSignature
} from '../utils/customCrops';

/**
 * 問題画像の表示用コンポーネント。
 * 優先順位: 端末調整座標 > 共有ファイル座標 > 初期画像（事前切り抜き静的ファイル）
 */
export default function CropImage({ cropKey, defaultPath, alt = '', className = '', draggable }) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setVersion((v) => v + 1);
    window.addEventListener('custom-crops-updated', onUpdate);
    return () => window.removeEventListener('custom-crops-updated', onUpdate);
  }, []);

  const activeCoords = getActiveCropCoords(cropKey);
  const sig = activeCoords ? cropSignature(activeCoords) : null;

  const [rendered, setRendered] = useState(() => (activeCoords ? { sig, url: getCachedCropUrl(activeCoords) } : null));
  const [failedSig, setFailedSig] = useState(null);

  useEffect(() => {
    if (!activeCoords) return undefined;
    let alive = true;
    renderCropFromPage(activeCoords)
      .then((url) => {
        if (alive) setRendered({ sig, url });
      })
      .catch((err) => {
        console.error(err);
        if (alive) setFailedSig(sig);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  let src = null;
  if (activeCoords && failedSig !== sig) {
    src = rendered?.sig === sig ? rendered.url : getCachedCropUrl(activeCoords);
  } else {
    src = defaultPath ? getAssetUrl(defaultPath) : '';
  }

  if (!src) {
    return (
      <div className="h-32 w-full flex items-center justify-center text-[11px] text-slate-400 animate-pulse">
        画像を準備中…
      </div>
    );
  }

  return <img src={src} alt={alt} className={className} draggable={draggable} />;
}
