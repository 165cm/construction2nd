import React, { useEffect, useState } from 'react';
import PricingPlans from './PricingPlans';
import { billingCall, openStripeUrl } from '../services/billing';

// 契約表示と有料配信が完成するまでビルド設定でも購入を無効にする。
const purchaseReady = import.meta.env.VITE_BILLING_READY === 'true';
export default function BillingPanel({ uid }) {
  const [access, setAccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState(null);
  useEffect(() => { setAccess(null); setPlan(null); setMessage(''); }, [uid]);
  async function perform(action) {
    setBusy(true); setMessage('');
    try { await action(); }
    catch { setMessage('手続きを確認できませんでした。通信を確認して再試行してください。支払済みの場合は追加購入せず、利用期限を再確認してください。'); }
    finally { setBusy(false); }
  }
  async function refresh() {
    const latest = await billingCall('billingAccess', uid);
    setAccess(latest);
    setMessage(latest.hasAccess ? '利用期限を確認しました。' : '有効な利用権はまだ確認できません。支払い直後は時間をおいて再確認してください。');
  }
  const enabled = purchaseReady && access?.billingEnabled === true;
  return <div className="border-t border-slate-600 pt-4 mt-4 space-y-3">
    {purchaseReady && access?.sandbox === true && <p role="status" className="rounded-xl border border-amber-400/50 bg-amber-950/30 p-3 text-sm text-amber-100">
      テスト決済です。実際の請求はありません。Stripeのテスト用カードを使ってください。
    </p>}
    <PricingPlans enabled={enabled} busy={busy} hasAccess={access?.hasAccess} expiresAt={access?.expiresAt}
      onChoose={setPlan} onRefresh={() => perform(refresh)}
      onManage={() => perform(async () => openStripeUrl((await billingCall('createBillingPortal', uid)).url))} />
    {plan && enabled && <div role="region" aria-label="購入内容の確認" className="border border-slate-500 p-3 rounded-xl space-y-2">
      <p className="text-sm font-bold">{plan === 'pack' ? '3か月間・総額980円（税込）・自動更新なし' : '月額480円（税込）・毎月自動更新'}</p>
      <p className="text-xs">支払い情報はStripeの画面で入力します。戻ってきた後に利用期限を再確認してください。</p>
      <button disabled={busy} className="min-h-[44px] px-3 rounded-lg bg-emerald-700 text-sm" onClick={() => perform(async () => openStripeUrl((await billingCall('createCheckout', uid, { planId: plan })).url))}>{access?.sandbox ? 'Stripeでテスト決済に進む' : 'Stripeで支払いに進む'}</button>
      <button disabled={busy} className="min-h-[44px] px-3 text-sm" onClick={() => setPlan(null)}>戻る</button>
    </div>}
    {message && <p role="status" className="text-xs text-amber-200">{message}</p>}
  </div>;
}
