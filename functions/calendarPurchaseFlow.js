// 新方式用。実ハンドラーへ接続済みだが、新受付は既定停止・未配備。
import { CALENDAR_POLICY_VERSION, calendarAnchorConfig, calendarPeriod } from './calendarBillingPolicy.js';

const requireId = (value, prefix) => {
  if (typeof value !== 'string' || !value.startsWith(prefix) || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid-billing-reference');
  return value;
};
function requireIdentity(uid, attemptId) {
  if (typeof uid !== 'string' || !uid || uid.length > 128 || typeof attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(attemptId)) throw new Error('invalid-purchase-identity');
}

// oneTimePriceIdはサーバーのPrice照合済み単発600円を渡す。カード保存の同意は入口で別途必須。
export function initialMonthlyCheckout({ oneTimePriceId, customerId, uid, attemptId, origin, expiresAt }) {
  requireIdentity(uid, attemptId);
  requireId(oneTimePriceId, 'price_');
  requireId(customerId, 'cus_');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('invalid-origin');
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error('invalid-checkout-expiry');
  const metadata = { uid, attemptId, planId: 'monthly', policyVersion: CALENDAR_POLICY_VERSION };
  return {
    mode: 'payment', customer: customerId, client_reference_id: uid,
    line_items: [{ price: oneTimePriceId, quantity: 1 }], payment_method_types: ['card'],
    payment_intent_data: { setup_future_usage: 'off_session', metadata }, metadata,
    success_url: `${url.origin}/?payment=success`, cancel_url: `${url.origin}/?payment=cancelled`,
    expires_at: expiresAt,
    custom_text: { submit: { message: '初回600円（税込）。以後毎月600円で自動更新します。更新日前までに契約管理で解約できます。' } },
  };
}

// joinedAtは署名検証後、Stripeの支払成功イベントから一度だけ固定して保存する。
// ブラウザ入力/Checkout作成日時/通知の受信日時を渡してはならない。
// この関数は証拠を検証しない。正確なPrice・金額・本人・保存同意・取消しを呼出側で照合する。
export function calendarSubscriptionRequest({ uid, attemptId, customerId, paymentIntentId, paymentMethodId, joinedAt, monthlyPriceId, now }) {
  requireIdentity(uid, attemptId);
  requireId(customerId, 'cus_');
  requireId(paymentIntentId, 'pi_');
  requireId(paymentMethodId, 'pm_');
  requireId(monthlyPriceId, 'price_');
  const period = calendarPeriod(joinedAt, 'monthly');
  if (!Number.isSafeInteger(now) || now < joinedAt || now >= period.expiresAt) throw new Error('purchase-needs-reconciliation');
  return {
    params: {
      customer: customerId, items: [{ price: monthlyPriceId, quantity: 1 }],
      default_payment_method: paymentMethodId, collection_method: 'charge_automatically',
      billing_cycle_anchor_config: calendarAnchorConfig(joinedAt), proration_behavior: 'none',
      metadata: { uid, attemptId, initialPaymentIntentId: paymentIntentId, policyVersion: CALENDAR_POLICY_VERSION, joinedAt: String(joinedAt) },
    },
    options: { idempotencyKey: `calendar-subscription:${paymentIntentId}` },
    initialPeriod: period,
  };
}

// Stripeの冪等キーは永久ではない。再試行前に専用顧客の全契約を照合する。
// 取得中/ページ残り/不整合は作成せず、既存契約があれば終了済みでも同じ契約へ戻す。
// 同時実行は呼出側の永続予約で直列化し、初回試行時刻を先に保存する必要がある。
export function subscriptionRecoveryDecision({ subscriptions, hasMore, paymentIntentId, customerId, firstAttemptAt, now }) {
  requireId(paymentIntentId, 'pi_');
  requireId(customerId, 'cus_');
  if (!Array.isArray(subscriptions) || hasMore !== false || !Number.isSafeInteger(now)
    || !Number.isSafeInteger(firstAttemptAt) || firstAttemptAt < 0 || firstAttemptAt > now) return { action: 'review' };
  const matches = subscriptions.filter(sub => sub.metadata?.initialPaymentIntentId === paymentIntentId);
  if (matches.length === 1 && matches[0].customer === customerId
    && matches[0].metadata?.policyVersion === CALENDAR_POLICY_VERSION
    && typeof matches[0].id === 'string' && matches[0].id.startsWith('sub_')) return { action: 'reuse', subscriptionId: matches[0].id };
  if (matches.length || subscriptions.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) return { action: 'review' };
  // 24hの保持保証に近づいたら盲目的に再作成しない。人手照合へ回す。
  return { action: now - firstAttemptAt < 23 * 3600000 ? 'retry-same-key' : 'review' };
}
