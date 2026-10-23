import React, { useEffect, useRef, useState } from 'react';
import PricingPlans from './PricingPlans';
import PurchaseConfirmation, { PURCHASE_CONSENT_VERSION } from './PurchaseConfirmation';
import { billingCall, openStripeUrl } from '../services/billing';

// 新料金・日付単位の請求と利用権が揃うまで、新規購入は再開しない。
const purchaseReady = import.meta.env.VITE_BILLING_READY === 'true'
  && import.meta.env.VITE_CALENDAR_BILLING_READY === 'true';
const documentsReady = import.meta.env.VITE_PURCHASE_DOCUMENTS_READY === 'true';
const legalLinks = Object.fromEntries(['terms', 'privacy', 'trade'].map(name => [name, `${import.meta.env.BASE_URL || '/'}${name}.html`]));

function AccountBillingPanel({ uid, currentAccount }) {
  const [access, setAccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState(null);
  const mounted = useRef(true);
  const processing = useRef(false);
  const selectedPlan = useRef(null);
  const isCurrent = () => mounted.current && currentAccount.current === uid;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  function choosePlan(value) { selectedPlan.current = value; setPlan(value); }
  async function perform(action) {
    if (!isCurrent() || processing.current) return;
    processing.current = true;
    setBusy(true); setMessage('');
    try { await action(); }
    catch { if (isCurrent()) setMessage('手続きを確認できませんでした。通信を確認して再試行してください。支払済みの場合は追加購入せず、利用期限を再確認してください。'); }
    finally { processing.current = false; if (isCurrent()) setBusy(false); }
  }
  async function refresh() {
    const latest = await billingCall('billingAccess', uid);
    if (!isCurrent()) return null;
    setAccess(latest);
    if (latest.hasAccess || !latest.billingEnabled) choosePlan(null);
    setMessage(latest.hasAccess ? '利用期限を確認しました。' : latest.billingEnabled ? 'プランを選んで購入手続きに進めます。支払済みの場合は追加購入せず、時間をおいて再確認してください。' : '現在、このアカウントでは購入を受け付けていません。');
    return latest;
  }
  const enabled = purchaseReady && access?.billingEnabled === true && !access?.hasAccess;
  async function continuePurchase(consent) {
    if (!enabled || !documentsReady || consent?.consentVersion !== PURCHASE_CONSENT_VERSION
      || consent?.planId !== selectedPlan.current || consent?.recurringConsent !== (consent.planId === 'monthly')) return;
    const chosen = selectedPlan.current;
    await perform(async () => {
      const latest = await refresh();
      if (!latest || latest.hasAccess || !latest.billingEnabled || !isCurrent() || selectedPlan.current !== chosen) return;
      const checkout = await billingCall('createCheckout', uid, { planId: chosen, consentVersion: consent.consentVersion, recurringConsent: consent.recurringConsent });
      if (isCurrent() && selectedPlan.current === chosen) openStripeUrl(checkout.url);
    });
  }
  return <div className="border-t border-slate-600 pt-4 mt-4 space-y-3">
    <section aria-label="支払い状態の確認" className="space-y-2">
      <button disabled={busy} className="min-h-[44px] px-3 text-sm rounded-lg bg-slate-700 disabled:opacity-50" onClick={() => perform(refresh)}>
        {busy ? '確認・処理中…' : '支払い・利用期限を再確認'}
      </button>
      <div aria-live="polite" aria-atomic="true" className="min-h-[3rem] text-xs text-amber-200">
        {busy ? '通信しています。そのままお待ちください。' : message || '購入前・支払い後はこちらで利用状態を確認してください。'}
      </div>
    {purchaseReady && access?.sandbox === true && <p role="status" className="rounded-xl border border-amber-400/50 bg-amber-950/30 p-3 text-sm text-amber-100">
      テスト決済です。実際の請求はありません。Stripeのテスト用カードを使ってください。
    </p>}
    </section>
    <PricingPlans enabled={enabled} busy={busy} hasAccess={access?.hasAccess} expiresAt={access?.expiresAt}
      onChoose={value => { if (enabled && !processing.current) choosePlan(value); }}
      onManage={() => perform(async () => { const portal = await billingCall('createBillingPortal', uid); if (isCurrent()) openStripeUrl(portal.url); })} />
    {plan && enabled && <PurchaseConfirmation planId={plan} accountKey={uid} busy={busy}
      documentsReady={documentsReady} legalLinks={legalLinks} sandbox={access?.sandbox}
      onContinue={continuePurchase} onBack={() => choosePlan(null)} />}

  </div>;
}

export default function BillingPanel({ uid }) {
  const currentAccount = useRef(uid);
  currentAccount.current = uid;
  return <AccountBillingPanel key={uid} uid={uid} currentAccount={currentAccount} />;
}
