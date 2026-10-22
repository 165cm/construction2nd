import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import PurchaseConfirmation from '../../src/components/PurchaseConfirmation.jsx';

const links = { terms: '/terms.html', privacy: '/privacy.html', trade: '/trade.html' };
function Preview() {
  const [plan, setPlan] = useState(null);
  const [account, setAccount] = useState('preview-a');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(true);
  const [message, setMessage] = useState('');
  const [size, setSize] = useState('');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = document.documentElement;
      const buttons = [...document.querySelectorAll('.purchase-actions button')];
      setSize(`表示枠 ${root.clientWidth} × ${root.clientHeight} / ${root.scrollWidth > root.clientWidth ? '横はみ出しあり' : '横はみ出しなし'}${buttons.length ? ' / 操作ボタン最小高さ ' + Math.round(Math.min(...buttons.map(button => button.getBoundingClientRect().height))) + 'px' : ''}`);
    });
    return () => cancelAnimationFrame(frame);
  }, [plan, account, busy, ready]);
  return <main>
    <aside className="preview-notice"><strong>未公開・操作確認用</strong><p>決済・ログイン・メール送信には接続しません。規約のリンク先も掲載前の確認版です。</p></aside>
    <p aria-label="表示サイズの検証結果">{size}</p>
    <section className="preview-controls" aria-label="確認用の切り替え">
      <button onClick={() => { setAccount(account === 'preview-a' ? 'preview-b' : 'preview-a'); setMessage('確認用アカウントを切り替えました。'); }}>確認用アカウントを切り替える</button>
      <button onClick={() => setBusy(!busy)}>{busy ? '処理中表示を解除' : '処理中表示を確認'}</button>
      <button onClick={() => setReady(!ready)}>{ready ? '文書未準備を確認' : '文書の確認版を表示'}</button>
    </section>
    <nav className="preview-controls" aria-label="確認するプラン">
      <button onClick={() => { setPlan('pack'); setMessage(''); }}>3か月パックの内容を確認</button>
      <button onClick={() => { setPlan('monthly'); setMessage(''); }}>月額プランの内容を確認</button>
    </nav>
    <p role="status" aria-live="polite">{message}</p>
    {plan ? <article><PurchaseConfirmation planId={plan} accountKey={account} busy={busy} documentsReady={ready} legalLinks={links} sandbox
      onBack={() => { setPlan(null); setMessage('プラン選択へ戻りました。'); }}
      onContinue={() => setMessage('確認操作が完了しました。この確認画面ではStripeを開かず、課金もしません。')} /></article> : <article><h1>購入前の確認画面</h1><p>上のプランを選ぶと、購入条件と確認欄が表示されます。</p></article>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
