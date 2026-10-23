import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString, defineBoolean } from 'firebase-functions/params';
import Stripe from 'stripe';
import { assertStripeEnvironment } from './billingEnvironment.js';
import { billingSandbox, allowedBillingUser, currentBillingPaths } from './billingEnvironmentConfig.js';
import { requirePlan, checkoutParams, assertConfiguredPrice, packGrant, monthlyGrant, accessSummary } from './billingPolicy.js';
import { createBillingPriceRegistry, preserveGrantOnReplay } from './billingPriceRegistry.js';
import { CALENDAR_POLICY_VERSION } from './calendarBillingPolicy.js';
import { initialMonthlyCheckout } from './calendarPurchaseFlow.js';
import { createCalendarPurchaseStore } from './calendarPurchaseStore.js';
import { createCalendarBillingProcessor } from './calendarBillingProcessor.js';

initializeApp();
const db = getFirestore();
const stripeKey = defineSecret('STRIPE_SECRET_KEY');
const webhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const siteUrl = defineString('SITE_URL', { default: '' });
const monthlyPrice = defineString('STRIPE_MONTHLY_PRICE_ID', { default: '' });
const portalConfiguration = defineString('STRIPE_PORTAL_CONFIGURATION_ID', { default: '' });
const packPrice = defineString('STRIPE_PACK_PRICE_ID', { default: '' });
// 新旧のPriceを置き換えず、新方式は別ID・既定停止で準備する。
const calendarEnabled = defineBoolean('CALENDAR_BILLING_ENABLED', { default: false });
const initialCalendarPrice = defineString('STRIPE_CALENDAR_INITIAL_PRICE_ID', { default: '' });
const monthlyCalendarPrice = defineString('STRIPE_CALENDAR_MONTHLY_PRICE_ID', { default: '' });
const packCalendarPrice = defineString('STRIPE_CALENDAR_PACK_PRICE_ID', { default: '' });
// 有料配信・契約表示・実結合テストが揃うまでは購入開始を拒否する。
const billingEnabled = defineBoolean('BILLING_ENABLED', { default: false });
const region = 'asia-northeast1';
const options = { region, secrets: [stripeKey], maxInstances: 3 };
// invoice.charge / invoice.subscription / lines.price の契約を固定。Webhookも同じ版を設定する。
const stripeClient = () => {
  const key = stripeKey.value();
  assertStripeEnvironment(key, billingSandbox.value());
  return new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
};
const priceFor = planId => planId === 'monthly' ? monthlyPrice.value() : packPrice.value();
const calendarPriceFor = planId => planId === 'monthly' ? initialCalendarPrice.value() : packCalendarPrice.value();
const calendarRegistry = () => createBillingPriceRegistry({ sandbox: billingSandbox.value(), prices: {
  calendarInitial: initialCalendarPrice.value(), calendarMonthly: monthlyCalendarPrice.value(), calendarPack: packCalendarPrice.value(),
} });
const calendarStore = () => createCalendarPurchaseStore({ db, paths: currentBillingPaths });
const calendarProcessor = stripe => createCalendarBillingProcessor({ stripe, store: calendarStore(), registry: calendarRegistry(), sandbox: billingSandbox.value() });
function requireCalendarResult(result) {
  if (!['complete', 'ignored'].includes(result.status)) throw new Error('calendar-payment-needs-retry-or-review');
}
const uidOf = request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインしてください');
  return request.auth.uid;
};
const customerRef = uid => db.doc(`${currentBillingPaths(uid).customers}/${uid}`);
const grantsRef = uid => db.collection(currentBillingPaths(uid).grants);
async function grants(uid) { return (await grantsRef(uid).where('expiresAt', '>', Date.now()).get()).docs.map(d => d.data()); }

export const billingAccess = onCall({ region, maxInstances: 3 }, async request => {
  const uid = uidOf(request);
  return { ...accessSummary(allowedBillingUser(uid) ? await grants(uid) : []), serverNow: Date.now(), billingEnabled: billingEnabled.value() && allowedBillingUser(uid), sandbox: billingSandbox.value() };
});

export const createCheckout = onCall(options, async request => {
  const uid = uidOf(request);
  if (!billingEnabled.value()) throw new HttpsError('failed-precondition', '購入の受付はまだ開始していません');
  if (!allowedBillingUser(uid)) throw new HttpsError('permission-denied', '現在は指定アカウントでのみテストできます');
  const calendar = calendarEnabled.value();
  // 本番では同意情報を省いた直接呼出しでも旧価格の新規販売を再開しない。
  // 旧経路を残すのは既存サンドボックス検証用だけ。通知/契約管理は別に維持する。
  if (!calendar && !billingSandbox.value()) {
    throw new HttpsError('failed-precondition', '新料金の購入手続きを準備中です。購入受付の開始までお待ちください。');
  }
  // 新確認の要求を旧480円へ流さず、新方式有効時は旧クライアント購入も止める。
  if (!calendar && (request.data?.consentVersion !== undefined || request.data?.recurringConsent !== undefined)) {
    throw new HttpsError('failed-precondition', '新料金の購入手続きを準備中です。購入受付の開始までお待ちください。');
  }
  const planId = request.data?.planId;
  if (calendar && (request.data?.consentVersion !== 'calendar-jst-v1'
    || request.data?.recurringConsent !== (planId === 'monthly'))) {
    throw new HttpsError('failed-precondition', '購入条件を改めて確認してください');
  }
  try { requirePlan(planId); } catch { throw new HttpsError('invalid-argument', 'プランを選んでください'); }
  const stripe = stripeClient();
  try {
    if (calendar) {
      const registry = calendarRegistry();
      const first = registry.resolve(await stripe.prices.retrieve(calendarPriceFor(planId)), { forPurchase: true });
      if (first.role !== (planId === 'monthly' ? 'calendarInitial' : 'calendarPack')) throw new Error('invalid-first-price');
      if (planId === 'monthly') registry.resolve(await stripe.prices.retrieve(monthlyCalendarPrice.value()), { forPurchase: true });
    } else assertConfiguredPrice(await stripe.prices.retrieve(priceFor(planId)), planId);
  }
  catch { throw new HttpsError('failed-precondition', '料金設定を確認中です'); }
  const ref = customerRef(uid);
  let customer = (await ref.get()).data()?.customerId;
  if (!customer) {
    // 同時クリックでもStripe側に同一の顧客を作る。
    const created = await stripe.customers.create({ metadata: { uid } }, { idempotencyKey: `customer:${uid}` });
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      customer = snap.data()?.customerId || created.id;
      tx.set(ref, { customerId: customer }, { merge: true });
    });
  }
  for await (const subscription of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      throw new HttpsError('already-exists', '月額契約があります。契約管理で状態を確認してください');
    }
  }
  // 期限だけで予約を破棄しない。支払済み・Webhook遅延中の二重購入を防ぐ。
  const previous = (await ref.get()).data()?.pending;
  let replaceAttempt = null;
  if (previous && previous.expiresAt <= Date.now()) {
    let previousSession;
    for await (const candidate of stripe.checkout.sessions.list({ customer, limit: 100,
      created: { gte: Math.floor(previous.createdAt / 1000) - 60 } })) {
      if (candidate.metadata?.attemptId === previous.attemptId) { previousSession = candidate; break; }
    }
    if (previousSession?.status === 'expired') replaceAttempt = previous.attemptId;
    else if (previousSession?.status === 'complete') {
      const recorded = previousSession.mode === 'payment'
        ? (await grantsRef(uid).doc(previousSession.id).get()).exists
        : !(await grantsRef(uid).where('subscriptionId', '==', previousSession.subscription).limit(1).get()).empty;
      if (recorded) replaceAttempt = previous.attemptId; // 有効期間は下のtransactionで再確認
      else throw new HttpsError('failed-precondition', '支払い結果を確認中です。再購入せず、しばらくして確認してください');
    } else if (!previousSession) {
      // セッション作成前の失敗。24時間以内は同じ冪等キーでの遅延リクエストを考慮する。
      if (Date.now() > previous.createdAt + 24 * 3600000) replaceAttempt = previous.attemptId;
      else throw new HttpsError('failed-precondition', '購入手続きの状態を確認中です。時間をおいて再試行してください');
    } else throw new HttpsError('failed-precondition', '購入手続き中です。時間をおいて再試行してください');
  }
  const now = Date.now();
  const reservation = await db.runTransaction(async tx => {
    const [snap, active] = await Promise.all([tx.get(ref), tx.get(grantsRef(uid).where('expiresAt', '>', now))]);
    if (accessSummary(active.docs.map(d => d.data()), now).hasAccess) throw new HttpsError('already-exists', '有効な利用期間が残っています');
    const pending = snap.data()?.pending;
    if (pending && pending.attemptId !== replaceAttempt) {
      if (pending.expiresAt <= now) throw new HttpsError('aborted', '購入状態が変わりました。再試行してください');
      if ((calendar ? pending.policyVersion !== CALENDAR_POLICY_VERSION : !!pending.policyVersion)) throw new HttpsError('already-exists', '以前の購入手続きを確認中です。追加購入せず、利用状態を再確認してください');
      if (pending.planId !== planId) throw new HttpsError('already-exists', '別プランの購入手続き中です。手続き終了後にやり直してください');
      return pending;
    }
    const next = { attemptId: randomUUID(), planId, createdAt: now, expiresAt: now + 60 * 60000,
      ...(calendar ? { policyVersion: CALENDAR_POLICY_VERSION, priceId: calendarPriceFor(planId),
        ...(planId === 'monthly' ? { monthlyPriceId: monthlyCalendarPrice.value() } : {}),
        consentVersion: 'calendar-jst-v1', recurringConsent: planId === 'monthly' } : {}) };
    tx.set(ref, { pending: next }, { merge: true });
    return next;
  });
  const checkoutInput = {
    planId, priceId: calendar ? reservation.priceId : priceFor(planId), customerId: customer, uid, origin: siteUrl.value(),
    expiresAt: Math.floor(reservation.expiresAt / 1000), attemptId: reservation.attemptId,
  };
  let params;
  if (calendar) {
    const purchase = { uid, customerId: customer, attemptId: reservation.attemptId, planId,
      priceId: reservation.priceId, ...(planId === 'monthly' ? { monthlyPriceId: reservation.monthlyPriceId } : {}),
      policyVersion: CALENDAR_POLICY_VERSION, consentVersion: reservation.consentVersion,
      recurringConsent: reservation.recurringConsent, createdAt: reservation.createdAt };
    await calendarStore().register(purchase);
    params = planId === 'monthly' ? initialMonthlyCheckout({ ...checkoutInput, oneTimePriceId: reservation.priceId }) : checkoutParams(checkoutInput);
    if (planId === 'pack') {
      params.metadata = { ...params.metadata, attemptId: reservation.attemptId, policyVersion: CALENDAR_POLICY_VERSION };
      params.payment_intent_data.metadata = params.metadata;
    }
  } else {
    params = checkoutParams(checkoutInput);
    params.metadata.attemptId = reservation.attemptId;
  }
  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout:${reservation.attemptId}` });
  if (calendar) await calendarStore().bindSession(uid, reservation.attemptId, session.id);
  if (session.status !== 'open' || !session.url) throw new HttpsError('failed-precondition', '支払い結果を確認中です。再購入せず、しばらくして確認してください');
  return { url: session.url };
});

export const createBillingPortal = onCall(options, async request => {
  const uid = uidOf(request);
  if (!allowedBillingUser(uid)) throw new HttpsError('permission-denied', '現在は指定アカウントでのみテストできます');
  const customer = (await customerRef(uid).get()).data()?.customerId;
  if (!customer) throw new HttpsError('not-found', '契約はまだありません');
  const stripe = stripeClient();
  const configId = portalConfiguration.value();
  if (!configId) throw new HttpsError('failed-precondition', '契約管理を準備中です');
  const config = await stripe.billingPortal.configurations.retrieve(configId);
  if (!config.active || !config.features.subscription_cancel.enabled
    || config.features.subscription_cancel.mode !== 'at_period_end'
    || config.features.subscription_update.enabled) {
    throw new HttpsError('failed-precondition', '契約管理の設定を確認中です');
  }
  const session = await stripe.billingPortal.sessions.create({ customer, configuration: configId, return_url: siteUrl.value() });
  return { url: session.url };
});

async function ownerFor(customerId) {
  if (typeof customerId !== 'string') customerId = customerId?.id;
  if (!customerId) return null;
  const result = await db.collection(currentBillingPaths().customers).where('customerId', '==', customerId).limit(1).get();
  return result.empty ? null : result.docs[0].id;
}
async function saveGrant(uid, grant) {
  const ref = grantsRef(uid).doc(grant.id);
  await db.runTransaction(async tx => {
    const [old, revoked] = await Promise.all([tx.get(ref), tx.get(db.doc(`${currentBillingPaths().revocations}/${grant.chargeId}`))]);
    // 旧Priceの再送も、保存済み期限・版を保持して失効だけを単調に反映する。
    tx.set(ref, preserveGrantOnReplay(old.data(), grant, revoked.exists));
    // checkout予約と同じ文書を更新し、並行する購入判定と競合させる。
    tx.set(customerRef(uid), { updatedAt: Date.now() }, { merge: true });
  });
}
async function revokeCharge(chargeId, customerId) {
  // 解放イベントより先に返金が届いても、後から解放しない。
  await db.doc(`${currentBillingPaths().revocations}/${chargeId}`).set({ revoked: true });
  const uid = await ownerFor(customerId);
  if (!uid) return;
  const matches = await grantsRef(uid).where('chargeId', '==', chargeId).get();
  const batch = db.batch();
  matches.docs.forEach(doc => batch.update(doc.ref, { revoked: true }));
  await batch.commit();
}
export const stripeWebhook = onRequest({ ...options, secrets: [stripeKey, webhookSecret] }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.sendStatus(405);
  const stripe = stripeClient();
  let event;
  try { event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], webhookSecret.value()); }
  catch { return res.status(400).send('Invalid signature'); }
  if (event.livemode !== !billingSandbox.value()) return res.status(400).send('Environment mismatch');
  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = await stripe.checkout.sessions.retrieve(event.data.object.id, { expand: ['line_items', 'payment_intent.latest_charge'] });
      const uid = await ownerFor(session.customer);
      if (session.metadata?.policyVersion === CALENDAR_POLICY_VERSION) {
        if (uid && session.client_reference_id === uid) {
          requireCalendarResult(await calendarProcessor(stripe).initial({ uid, attemptId: session.metadata.attemptId, session }));
        }
      } else {
        const grant = packGrant(session, packPrice.value());
        if (uid && grant && session.client_reference_id === uid) await saveGrant(uid, grant);
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const payment = await stripe.paymentIntents.retrieve(event.data.object.id);
      const uid = await ownerFor(payment.customer);
      if (uid && payment.metadata?.policyVersion === CALENDAR_POLICY_VERSION && payment.metadata.uid === uid) {
        requireCalendarResult(await calendarProcessor(stripe).initial({ uid, attemptId: payment.metadata.attemptId, successEvent: event }));
      }
    } else if (event.type === 'invoice.paid') {
      const invoice = await stripe.invoices.retrieve(event.data.object.id, { expand: ['charge'] });
      const uid = await ownerFor(invoice.customer);
      const subscription = uid && invoice.subscription ? await stripe.subscriptions.retrieve(typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id) : null;
      if (subscription?.metadata?.policyVersion === CALENDAR_POLICY_VERSION) {
        if (subscription.metadata.uid !== uid) throw new Error('calendar-owner-mismatch');
        requireCalendarResult(await calendarProcessor(stripe).renewal({ uid, attemptId: subscription.metadata.attemptId, invoice }));
      } else {
        const grant = monthlyGrant(invoice, monthlyPrice.value());
        if (uid && grant) await saveGrant(uid, grant);
      }
    } else if (event.type === 'charge.refunded') {
      const charge = await stripe.charges.retrieve(event.data.object.id);
      if (charge.amount_refunded > 0) await revokeCharge(charge.id, charge.customer);
    } else if (event.type === 'charge.dispute.created') {
      const charge = await stripe.charges.retrieve(event.data.object.charge);
      await revokeCharge(charge.id, charge.customer);
    }
    return res.status(200).send('ok');
  } catch {
    console.error('billing-webhook-retry', { eventId: event.id, type: event.type });
    // Stripeの再送で回復させる。秘密値や支払い情報を応答に含めない。
    return res.status(500).send('Retry later');
  }
});

export { privateContent } from './privateContent.js';
