import React, { useEffect, useState } from 'react';
import { getAssetUrl, resolveAssetUrl } from '../utils/asset';
import { privateGeneration, discardPrivateAsset } from '../services/privateStudyStore';

export default function AssetImage({ path, fallbackPath, alt = '', ...props }) {
  const generation = privateGeneration();
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [fallback, setFallback] = useState(false);
  const target = fallback && fallbackPath ? fallbackPath : path;
  useEffect(() => { setFallback(false); }, [path]);
  useEffect(() => {
    let alive = true;
    if (!target) return;
    resolveAssetUrl(target)
      .then(url => { if (alive && generation === privateGeneration()) setResult({ target, generation, url }); })
      .catch(() => {
        if (!alive) return;
        if (!fallback && fallbackPath) setFallback(true);
        else setResult({ target, generation, failed: true });
      });
    return () => { alive = false; };
  }, [target, generation, attempt, fallback, fallbackPath]);
  const current = result?.target === target && result.generation === generation ? result : (getAssetUrl(target) ? { url: getAssetUrl(target) } : null);
  function failed() {
    if (!fallback && fallbackPath) setFallback(true);
    else setResult({ target, generation, failed: true });
  }
  if (current?.failed) return <div role="status" className="text-xs text-amber-200 p-3">
    <p>画像を取得できませんでした。</p>
    <button className="min-h-[44px] underline" onClick={() => { discardPrivateAsset(target); setResult(null); setAttempt(n => n + 1); }}>画像を再試行</button>
  </div>;
  if (!current?.url) return <div role="status" className="h-32 flex items-center justify-center text-xs text-slate-400">画像を準備中…</div>;
  return <img {...props} src={current.url} alt={alt} onError={failed} />;
}
