import React, { useEffect, useState } from 'react';
import { getAssetUrl } from '../utils/asset';
import {
  getLocalCropDataUrl,
  getSharedCropCoords,
  getCachedCropUrl,
  renderCropFromPage,
  cropSignature
} from '../utils/customCrops';

/**
 * 問題画像の表示用コンポーネント。
 * 優先順位: この端末で保存したトリミング > 共有ファイルのトリミング > 初期画像
 */
export default function CropImage({ cropKey, defaultPath, alt = '', className = '', draggable }) {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setVersion((v) => v + 1);
    window.addEventListener('custom-crops-updated', onUpdate);
    return () => window.removeEventListener('custom-crops-updated', onUpdate);
  }, []);

  const localUrl = getLocalCropDataUrl(cropKey);
  const shared = localUrl ? null : getSharedCropCoords(cropKey);
  const sharedSig = shared ? cropSignature(shared) : null;

  const [rendered, setRendered] = useState(() => (shared ? { sig: sharedSig, url: getCachedCropUrl(shared) } : null));
  const [failedSig, setFailedSig] = useState(null);

  useEffect(() => {
    if (!shared) return undefined;
    let alive = true;
    renderCropFromPage(shared)
      .then((url) => {
        if (alive) setRendered({ sig: sharedSig, url });
      })
      .catch((err) => {
        console.error(err);
        if (alive) setFailedSig(sharedSig);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSig]);

  let src = null;
  if (localUrl) {
    src = localUrl;
  } else if (shared && failedSig !== sharedSig) {
    src = rendered?.sig === sharedSig ? rendered.url : getCachedCropUrl(shared);
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
