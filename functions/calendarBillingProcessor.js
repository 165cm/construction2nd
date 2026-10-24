import { randomUUID } from 'node:crypto';
import { CALENDAR_POLICY_VERSION, calendarBoundary, calendarAnchorConfig } from './calendarBillingPolicy.js';
import { calendarInitialGrant, calendarRenewalGrant, findCalendarSuccessEvent } from './calendarPaymentEvidence.js';
import { calendarSubscriptionRequest, subscriptionRecoveryDecision } from './calendarPurchaseFlow.js';
const reference = value => typeof value === 'string' ? value : value?.id;

// storeは永続transaction、stripeはサーバー秘密鍵のクライアントを注入する。
// 公開購入の受付とは独立に通知の再送を回復できるようにする。
export function createCalendarBillingProcessor({ stripe, store, registry, sandbox, now = Date.now }) {
  async function subscriptionsFor(customer) {
    const result = [];
    let cursor;
    for (let page = 0; page < 10; page += 1) {
      const response = await stripe.subscriptions.list({ customer, status: 'all', limit: 100,
        ...(cursor ? { starting_after: cursor } : {}) });
      if (!Array.isArray(response.data) || typeof response.has_more !== 'boolean') return null;
      if (response.data.some(item => item.livemode !== !sandbox || reference(item.customer) !== customer)) throw new Error('subscription-environment-mismatch');
      result.push(...response.data);
      if (!response.has_more) return result;
      const next = response.data.at(-1)?.id;
      if (!next || next === cursor) return null;
      cursor = next;
    }
    return null;
  }
  function assertSubscription(subscription, purchase) {
    const metadata = subscription.metadata;
    const item = subscription.items?.data?.[0];
    let price;
    try { price = registry.resolve(item?.price); } catch { throw new Error('subscription-price-mismatch'); }
    if (typeof subscription.id !== 'string' || !subscription.id.startsWith('sub_') || subscription.livemode !== !sandbox
      || reference(subscription.customer) !== purchase.customerId || metadata?.uid !== purchase.uid
      || metadata.attemptId !== purchase.attemptId || metadata.initialPaymentIntentId !== purchase.paymentIntentId
      || metadata.policyVersion !== CALENDAR_POLICY_VERSION || metadata.joinedAt !== String(purchase.joinedAt)
      || subscription.items?.data?.length !== 1 || subscription.items.has_more !== false
      || price.role !== 'calendarMonthly' || item.price.id !== purchase.monthlyPriceId || item.quantity !== 1
      || subscription.currency !== 'jpy' || subscription.collection_method !== 'charge_automatically') throw new Error('subscription-evidence-mismatch');
  }
  function correctSubscriptionPeriod(subscription, purchase) {
    if (['canceled', 'incomplete_expired'].includes(subscription.status)) return true;
    const expectedConfig = calendarAnchorConfig(purchase.joinedAt);
    const config = subscription.billing_cycle_anchor_config;
    const anchor = new Date(subscription.billing_cycle_anchor * 1000);
    if (!config || config.day_of_month !== expectedConfig.day_of_month || config.month != null
      || (config.hour ?? anchor.getUTCHours()) !== expectedConfig.hour
      || (config.minute ?? anchor.getUTCMinutes()) !== expectedConfig.minute
      || (config.second ?? anchor.getUTCSeconds()) !== expectedConfig.second) return false;
    const created = subscription.created * 1000;
    const start = subscription.current_period_start * 1000;
    const end = subscription.current_period_end * 1000;
    if (!Number.isSafeInteger(created) || created < purchase.joinedAt || created >= purchase.expiresAt
      || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return false;
    const original = new Date(purchase.joinedAt + 9 * 3600000);
    const ending = new Date(end + 9 * 3600000);
    const months = (ending.getUTCFullYear() - original.getUTCFullYear()) * 12 + ending.getUTCMonth() - original.getUTCMonth();
    for (const index of [months - 1, months, months + 1]) {
      if (index >= 1 && calendarBoundary(purchase.joinedAt, index) === end
        && (index === 1 ? start >= purchase.joinedAt && start < purchase.expiresAt
          : start === calendarBoundary(purchase.joinedAt, index - 1))) return true;
    }
    return false;
  }
  async function stopIncomplete(purchase) {
    // finishの直前に失効した、当該支払いの未完了契約だけを補償取消しする。
    // 通常の完了済み契約の返金と解約を自動で結び付けない。
    const subscription = await stripe.subscriptions.retrieve(purchase.subscriptionId);
    assertSubscription(subscription, purchase);
    if (!['canceled', 'incomplete_expired'].includes(subscription.status)) {
      await stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false });
    }
    await store.markStopped(purchase.uid, purchase.attemptId, subscription.id);
    return { status: 'review' };
  }

  async function initial({ uid, attemptId, session: suppliedSession, successEvent }) {
    let purchase = await store.get(uid, attemptId);
    if (!purchase?.sessionId) return { status: 'pending' };
    const session = suppliedSession || await stripe.checkout.sessions.retrieve(purchase.sessionId,
      { expand: ['line_items', 'payment_intent.latest_charge'] });
    if (session.id !== purchase.sessionId) throw new Error('checkout-reservation-mismatch');
    let events;
    if (purchase.successEventId && Number.isSafeInteger(purchase.joinedAt)) {
      // 初回に検証して保存した正本を再利用。30日経過や別通知で日時を再計算しない。
      events = [{ id: purchase.successEventId, type: 'payment_intent.succeeded', created: purchase.joinedAt / 1000,
        livemode: !sandbox, data: { object: session.payment_intent } }];
    } else if (successEvent?.type === 'payment_intent.succeeded'
      && reference(successEvent.data?.object) === reference(session.payment_intent)) {
      events = [successEvent];
    } else {
      const found = await findCalendarSuccessEvent({ stripe, payment: session.payment_intent, sandbox, now: now() });
      if (found.status !== 'ready') return { status: found.status };
      events = [found.event];
    }
    const grant = calendarInitialGrant({ session, successEvents: events, purchase, registry, sandbox });
    if (!grant) return { status: 'review' };
    purchase = await store.recordInitial(purchase, grant, reference(session.payment_intent.payment_method) || null);
    if (purchase.planId === 'pack') return { status: 'complete' };
    if (purchase.status === 'stop_required') return stopIncomplete(purchase);
    if (purchase.status === 'complete') return { status: 'complete' };
    if (grant.revoked || purchase.revoked || purchase.status === 'review') return { status: 'review' };
    const token = randomUUID();
    const lease = await store.claim(uid, attemptId, token, now());
    if (lease.action === 'done') return { status: 'complete' };
    if (lease.action === 'stop') return stopIncomplete(lease.purchase);
    if (lease.action !== 'claimed') return { status: lease.action === 'review' ? 'review' : 'pending' };
    purchase = lease.purchase;
    try {
      const subscriptions = await subscriptionsFor(purchase.customerId);
      if (!subscriptions) { await store.release(uid, attemptId, token); return { status: 'pending' }; }
      const decision = subscriptionRecoveryDecision({ subscriptions, hasMore: false,
        paymentIntentId: purchase.paymentIntentId, customerId: purchase.customerId,
        firstAttemptAt: purchase.firstAttemptAt, now: now() });
      let subscription;
      let newlyCreated = false;
      if (decision.action === 'reuse') {
        subscription = subscriptions.find(item => item.id === decision.subscriptionId);
        assertSubscription(subscription, purchase);
      } else if (decision.action === 'retry-same-key') {
        const price = registry.resolve(await stripe.prices.retrieve(purchase.monthlyPriceId), { forPurchase: true });
        if (price.role !== 'calendarMonthly') throw new Error('subscription-price-mismatch');
        const request = calendarSubscriptionRequest({ ...purchase, now: now() });
        subscription = await stripe.subscriptions.create(request.params, request.options);
        newlyCreated = true;
        assertSubscription(subscription, purchase);
      } else {
        await store.release(uid, attemptId, token, true); return { status: 'review' };
      }
      const wrongPeriod = !correctSubscriptionPeriod(subscription, purchase)
        || (newlyCreated && subscription.current_period_end * 1000 !== purchase.expiresAt);
      const completed = await store.finish(uid, attemptId, token, subscription.id, { stop: wrongPeriod });
      if (completed.action === 'revoked') return stopIncomplete(completed.purchase);
      return { status: completed.action === 'complete' ? 'complete' : 'pending' };
    } catch (error) {
      // 応答喪失でも同じfirstAttempt/冪等キーを保存して、次回は既存契約を探す。
      await store.release(uid, attemptId, token);
      throw error;
    }
  }

  async function renewal({ uid, attemptId, invoice }) {
    if (invoice.billing_reason === 'subscription_create' && invoice.amount_due === 0 && invoice.amount_paid === 0) return { status: 'ignored' };
    let purchase = await store.get(uid, attemptId);
    if (!purchase) return { status: 'pending' };
    if (!purchase.subscriptionId) {
      // 作成済みだが保存前に中断した契約を、初回正本から照合して回復する。
      const recovered = await initial({ uid, attemptId });
      if (recovered.status !== 'complete') return recovered;
      purchase = await store.get(uid, attemptId);
    }
    const grant = calendarRenewalGrant({ invoice, purchase, registry, sandbox });
    if (!grant) return { status: 'review' };
    await store.saveRenewal(purchase, grant);
    return { status: 'complete' };
  }
  return { initial, renewal };
}
