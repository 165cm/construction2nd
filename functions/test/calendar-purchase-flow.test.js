import test from 'node:test';
import assert from 'node:assert/strict';
import { initialMonthlyCheckout, calendarSubscriptionRequest, subscriptionRecoveryDecision } from '../calendarPurchaseFlow.js';
import { CALENDAR_POLICY_VERSION } from '../calendarBillingPolicy.js';
const joinedAt = Date.parse('2027-01-31T00:01:00+09:00');
const args = { uid: 'fake-user', attemptId: 'fake-attempt', customerId: 'cus_fake', paymentIntentId: 'pi_fake', paymentMethodId: 'pm_fake', monthlyPriceId: 'price_month', joinedAt, now: joinedAt + 1000 };

test('初回は単発600円Priceを1個、将来のカード請求用に保存する構成', () => {
  const result = initialMonthlyCheckout({ ...args, oneTimePriceId: 'price_initial', origin: 'https://example.com', expiresAt: 1800000000 });
  assert.equal(result.mode, 'payment');
  assert.deepEqual(result.line_items, [{ price: 'price_initial', quantity: 1 }]);
  assert.equal(result.payment_intent_data.setup_future_usage, 'off_session');
  assert.equal(result.metadata.policyVersion, CALENDAR_POLICY_VERSION);
  assert.equal(result.metadata.attemptId, args.attemptId);
  assert.equal(result.subscription_data, undefined);
  assert.match(result.custom_text.submit.message, /毎月600円/);
  for (const origin of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/?x=1', 'https://example.com/#x', 'https://example.com/path']) assert.throws(() => initialMonthlyCheckout({ ...args, oneTimePriceId: 'price_initial', origin, expiresAt: 1800000000 }));
});

test('支払成功日が翌日なら翌日を基準にし、再試行では要求と冪等キーを固定', () => {
  const request = calendarSubscriptionRequest(args);
  const retry = calendarSubscriptionRequest({ ...args, now: joinedAt + 86400000 });
  assert.deepEqual(request, retry);
  assert.deepEqual(request.params.billing_cycle_anchor_config, { day_of_month: 30, hour: 15, minute: 0, second: 0 });
  assert.equal(request.initialPeriod.expiresAt, Date.parse('2027-03-01T00:00:00+09:00'));
  assert.equal(request.params.proration_behavior, 'none');
  assert.equal(request.options.idempotencyKey, 'calendar-subscription:pi_fake');
  const beforeMidnight = calendarSubscriptionRequest({ ...args, joinedAt: Date.parse('2027-01-30T23:59:00+09:00') });
  assert.equal(beforeMidnight.params.billing_cycle_anchor_config.day_of_month, 29);
});

test('初回期限を過ぎた復旧は過去起点で契約を新規作成しない', () => {
  const end = calendarSubscriptionRequest(args).initialPeriod.expiresAt;
  for (const now of [joinedAt - 1, end, end + 1, NaN]) assert.throws(() => calendarSubscriptionRequest({ ...args, now }), /reconciliation/);
  for (const patch of [{ uid: '' }, { customerId: 'other' }, { attemptId: '' }, { paymentIntentId: '' }, { monthlyPriceId: 'monthly' }]) assert.throws(() => calendarSubscriptionRequest({ ...args, ...patch }));
});

const recovery = { subscriptions: [], hasMore: false, paymentIntentId: 'pi_fake', customerId: 'cus_fake', firstAttemptAt: joinedAt, now: joinedAt + 1000 };
const sub = { id: 'sub_fake', customer: 'cus_fake', status: 'active', metadata: { initialPaymentIntentId: 'pi_fake', policyVersion: CALENDAR_POLICY_VERSION } };
test('応答を失った後も、同じ支払の既存契約へ戻し、二重契約を作らない', () => {
  assert.deepEqual(subscriptionRecoveryDecision(recovery), { action: 'retry-same-key' });
  for (const status of ['active', 'past_due', 'canceled', 'incomplete_expired']) {
    assert.deepEqual(subscriptionRecoveryDecision({ ...recovery, subscriptions: [{ ...sub, status }], now: joinedAt + 48 * 3600000 }), { action: 'reuse', subscriptionId: sub.id });
  }
});

test('24時間後の再送・全件未取得・競合・別顧客/別版は自動作成を止める', () => {
  for (const patch of [
    { now: joinedAt + 23 * 3600000 }, { hasMore: true }, { subscriptions: [sub, sub] },
    { subscriptions: [{ ...sub, customer: 'cus_other' }] },
    { subscriptions: [{ ...sub, metadata: { initialPaymentIntentId: 'pi_fake' } }] },
    { subscriptions: [{ ...sub, metadata: {} }] }, { firstAttemptAt: joinedAt + 2000 },
  ]) assert.deepEqual(subscriptionRecoveryDecision({ ...recovery, ...patch }), { action: 'review' });
});
