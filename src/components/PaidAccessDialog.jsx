import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
const AccountPanel = lazy(() => import('./AccountPanel'));

export default function PaidAccessDialog({ kind, title, onClose, onFree, onRetry }) {
  const [showPlans, setShowPlans] = useState(false);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  useEffect(() => { const previous = document.activeElement; closeRef.current?.focus(); return () => previous?.focus?.(); }, []);
  useEffect(() => { closeRef.current?.focus(); }, [showPlans]);
  const retry = kind === 'retry';
  const button = 'min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold';
  function handleKey(event) {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const items = [...dialogRef.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  return <div className="fixed inset-0 z-[60] bg-slate-950/85 p-3 flex items-center justify-center">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="paid-access-title" onKeyDown={handleKey}
      className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="paid-access-title" className="font-bold">{showPlans ? 'ログイン・プランの確認' : retry ? '教材を開けませんでした' : '有料プラン対象の学習です'}</h2>
        <button ref={closeRef} className={button + ' bg-slate-700'} onClick={onClose} aria-label="案内を閉じる">閉じる</button>
      </div>
      {showPlans ? <><Suspense fallback={<p role="status">ログイン・料金を読み込み中…</p>}><AccountPanel /></Suspense>
        <button className={button + ' w-full bg-sky-700'} onClick={onRetry}>ログイン・支払い後に教材を再確認</button></> : <>
        <p className="text-sm font-bold">{title}</p>
        {retry ? <p className="text-sm text-slate-300">通信や利用状態が変わった可能性があります。再試行してください。購入済みの場合は追加購入せず、ログイン・利用期限を確認してください。</p> : <>
          <p className="text-sm text-slate-300">過去分の問題・解説・復習・模試は有料プランで利用できます。最新1回50問は無料です。</p>
          <div className="border border-emerald-500 rounded-xl p-3">
            <p className="font-bold">3か月集中パック 980円（税込・一括）</p>
            <p className="text-sm text-emerald-200">自動更新なし・加入日の3か月後の同日の前日まで</p>
          </div>
          <p className="text-sm text-slate-300">月額600円（税込・毎月自動更新）も選べます。</p>
          {kind === 'login-required' && <p className="text-sm">購入済みの方は、購入に使ったアカウントでログインしてください。</p>}
        </>}
        {retry && <button className={button + ' w-full bg-sky-700'} onClick={onRetry}>再試行</button>}
        <button className={button + ' w-full bg-emerald-700'} onClick={() => setShowPlans(true)}>{retry ? 'ログイン・利用期限を確認' : 'プランを見る・購入済みの方はログイン'}</button>
        <button className={button + ' w-full bg-slate-700'} onClick={onFree}>無料の最新問題を続ける</button>
      </>}
    </section>
  </div>;
}
