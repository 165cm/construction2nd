import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingPriceRegistry, preserveGrantOnReplay } from '../billingPriceRegistry.js';
import { CALENDAR_POLICY_VERSION, calendarPeriod } from '../calendarBillingPolicy.js';
import { calendarInitialGrant, calendarRenewalGrant, selectPaymentSuccessEvent } from '../calendarPaymentEvidence.js';
const registry = createBillingPriceRegistry({ sandbox: true, prices: { calendarInitial: 'price_initial', calendarMonthly: 'price_monthly', calendarPack: 'price_pack', legacyPack: 'price_oldPack' } });
const price = (id, amount, recurring = false) => ({ id, amount, unit_amount: amount, currency: 'jpy', livemode: false, active: true, tax_behavior: 'inclusive', type: recurring ? 'recurring' : 'one_time', recurring: recurring ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null });
const seconds = Date.parse('2027-01-31T00:00:01+09:00') / 1000;
function fixture(planId = 'monthly') {
  const amount = planId === 'monthly' ? 600 : 980;
  const purchase = { consentVersion: 'calendar-jst-v1', recurringConsent: planId === 'monthly', uid: 'user', customerId: 'cus_test', sessionId: 'cs_test', attemptId: 'attempt', planId, priceId: planId === 'monthly' ? 'price_initial' : 'price_pack', policyVersion: CALENDAR_POLICY_VERSION };
  const metadata = { uid: purchase.uid, attemptId: purchase.attemptId, planId, policyVersion: CALENDAR_POLICY_VERSION };
  const charge = { id: 'ch_test', payment_intent: 'pi_test', customer: 'cus_test', livemode: false, amount, currency: 'jpy', paid: true, captured: true, created: seconds - 120, amount_refunded: 0, disputed: false };
  const payment = { setup_future_usage: planId === 'monthly' ? 'off_session' : null, payment_method: 'pm_test', id: 'pi_test', status: 'succeeded', customer: 'cus_test', livemode: false, amount, amount_received: amount, currency: 'jpy', created: seconds - 120, latest_charge: charge, metadata };
  const event = { id: 'evt_test', type: 'payment_intent.succeeded', created: seconds, livemode: false, data: { object: structuredClone(payment) } };
  const session = { id: 'cs_test', mode: 'payment', status: 'complete', payment_status: 'paid', livemode: false, amount_total: amount, currency: 'jpy', customer: 'cus_test', client_reference_id: 'user', metadata, line_items: { has_more: false, data: [{ price: price(purchase.priceId, amount), quantity: 1 }] }, payment_intent: payment };
  return { session, purchase, successEvents: [event], registry, sandbox: true };
}

test('初回600円と新980円は成功イベントの日を使い、作成日/受信日へ代用しない', () => {
  for (const planId of ['monthly', 'pack']) {
    const value = fixture(planId);
    const grant = calendarInitialGrant(value);
    assert.deepEqual({ startsAt: grant.startsAt, expiresAt: grant.expiresAt }, calendarPeriod(seconds * 1000, planId));
    assert.equal(grant.joinedAt, seconds * 1000);
    assert.equal(grant.successEventId, 'evt_test');
    assert.equal(grant.revoked, false);
  }
  assert.equal(calendarInitialGrant({ ...fixture(), successEvents: [] }), null);
});

test('初回の未払い/別人/別予約/別Price/環境/金額/未捕捉は付与しない', () => {
  const changes = [v => v.session.payment_status = 'unpaid', v => v.session.customer = 'cus_other', v => v.session.client_reference_id = 'other',
    v => v.session.metadata = { ...v.session.metadata, attemptId: 'other' }, v => v.session.line_items.data[0].price.id = 'price_unknown',
    v => v.session.line_items.has_more = true, v => v.session.line_items.data[0].quantity = 2, v => v.session.livemode = true,
    v => v.session.amount_total = 480, v => v.session.payment_intent.amount_received = 480,
    v => v.session.payment_intent.latest_charge.captured = false, v => v.session.payment_intent.latest_charge.customer = 'cus_other',
    v => v.session.payment_intent.latest_charge.payment_intent = 'pi_other', v => v.session.payment_intent.metadata = {}, v => v.purchase.consentVersion = 'old', v => v.purchase.recurringConsent = false, v => v.session.payment_intent.setup_future_usage = null, v => v.session.payment_intent.payment_method = null];
  for (const change of changes) { const value = fixture(); change(value); assert.equal(calendarInitialGrant(value), null); }
  const old = fixture('pack'); old.purchase.priceId = 'price_oldPack'; old.session.line_items.data[0].price.id = 'price_oldPack';
  assert.equal(calendarInitialGrant(old), null);
});

test('成功イベントの対象/環境/成功状態/時刻の食違いは自動で選ばない', () => {
  for (const change of [e => e.created = NaN, e => e.created = seconds - 121, e => e.livemode = true, e => e.data.object.id = 'pi_other', e => e.data.object.status = 'processing', e => e.data.object.customer = 'cus_other', e => e.data.object.amount_received = 1]) {
    const value = fixture(); change(value.successEvents[0]); assert.equal(calendarInitialGrant(value), null);
  }
  const value = fixture();
  const duplicate = { ...structuredClone(value.successEvents[0]), id: 'evt_another' };
  assert.ok(selectPaymentSuccessEvent([...value.successEvents, duplicate], value.session.payment_intent, true));
  duplicate.created += 1;
  assert.equal(selectPaymentSuccessEvent([...value.successEvents, duplicate], value.session.payment_intent, true), null);
});

function renewal(index = 1, joinedAt = seconds * 1000) {
  const source = fixture();
  const purchase = { ...source.purchase, joinedAt, subscriptionId: 'sub_test', monthlyPriceId: 'price_monthly' };
  const period = calendarPeriod(joinedAt, 'monthly', index);
  const charge = { ...source.session.payment_intent.latest_charge, id: 'ch_renewal', payment_intent: 'pi_renewal' };
  const invoice = { id: 'in_renewal', livemode: false, paid: true, status: 'paid', billing_reason: 'subscription_cycle', amount_paid: 600, amount_due: 600, currency: 'jpy', customer: 'cus_test', subscription: 'sub_test', payment_intent: 'pi_renewal', charge,
    lines: { has_more: false, data: [{ price: price('price_monthly', 600, true), quantity: 1, amount: 600, subscription: 'sub_test', proration: false, period: { start: period.startsAt / 1000, end: period.expiresAt / 1000 } }] } };
  return { purchase, invoice, registry, sandbox: true };
}

test('更新は600円支払済みで元加入日の正しい1期間だけを付与する', () => {
  for (const date of ['2027-01-31T00:00:01+09:00', '2028-01-31T23:59:59+09:00', '2027-02-01T12:00:00+09:00']) {
    for (let index = 1; index <= 24; index += 1) {
      const value = renewal(index, Date.parse(date));
      const grant = calendarRenewalGrant(value);
      const expected = calendarPeriod(value.purchase.joinedAt, 'monthly', index);
      assert.deepEqual({ startsAt: grant.startsAt, expiresAt: grant.expiresAt }, expected);
    }
  }
});

test('0円/未払い/一部支払/按分/異なる契約/期限を更新分として付与しない', () => {
  for (const change of [v => v.invoice.paid = false, v => v.invoice.status = 'open', v => v.invoice.amount_paid = 0,
    v => v.invoice.amount_due = 1, v => v.invoice.billing_reason = 'subscription_create', v => v.invoice.customer = 'cus_other',
    v => v.invoice.subscription = 'sub_other', v => v.invoice.lines.has_more = true, v => v.invoice.lines.data[0].proration = true,
    v => v.invoice.lines.data[0].period.end += 1, v => v.invoice.lines.data[0].period.start += 1,
    v => v.invoice.lines.data[0].amount = 480, v => v.invoice.lines.data[0].price.id = 'price_initial', v => v.invoice.charge = 'ch_unexpanded',
    v => v.invoice.charge.amount = 480, v => v.invoice.livemode = true, v => v.purchase.policyVersion = 'old']) {
    const value = renewal(); change(value); assert.equal(calendarRenewalGrant(value), null);
  }
});

test('返金/異議申立てと再送でも失効は復活せず、保存済み時刻を保持', () => {
  for (const value of [fixture(), renewal()]) {
    const initial = !!value.session;
    const make = initial ? calendarInitialGrant : calendarRenewalGrant;
    const charge = initial ? value.session.payment_intent.latest_charge : value.invoice.charge;
    charge.amount_refunded = 1;
    const revoked = make(value); assert.equal(revoked.revoked, true);
    charge.amount_refunded = 0;
    const valid = make(value);
    assert.equal(preserveGrantOnReplay(revoked, valid).revoked, true);
    charge.disputed = true; assert.equal(make(value).revoked, true);
    assert.equal(preserveGrantOnReplay(valid, { ...valid, expiresAt: valid.expiresAt + 1000 }).expiresAt, valid.expiresAt);
  }
});

test('完了通知の先着時は成功イベントを全ページ照合し、受信日時を代用しない', async () => {
  const { findCalendarSuccessEvent } = await import('../calendarPaymentEvidence.js');
  const value = fixture(); const calls = [];
  const unrelated = { ...structuredClone(value.successEvents[0]), id: 'evt_other' }; unrelated.data.object.id = 'pi_other';
  const pages = [{ data: [unrelated], has_more: true }, { data: value.successEvents, has_more: false }];
  const stripe = { events: { list: async params => { calls.push(params); return pages.shift(); } } };
  const result = await findCalendarSuccessEvent({ stripe, payment: value.session.payment_intent, sandbox: true, now: seconds * 1000 + 1000 });
  assert.equal(result.status, 'ready'); assert.equal(result.event.created, seconds);
  assert.equal(calls[0].type, 'payment_intent.succeeded'); assert.equal(calls[0].limit, 100);
  assert.equal(calls[1].starting_after, 'evt_other'); assert.equal(calls[0]['data.object.id'], undefined);
  assert.ok(calls[0].created.lte > seconds);
});

test('イベント未到着/ページ残り/探索期限切れ/成功時刻競合は付与可能と扱わない', async () => {
  const { findCalendarSuccessEvent } = await import('../calendarPaymentEvidence.js');
  const value = fixture();
  const input = { payment: value.session.payment_intent, sandbox: true, now: seconds * 1000 + 1000 };
  for (const [response, expected] of [
    [{ data: [], has_more: false }, 'pending'],
    [{ data: value.successEvents, has_more: true }, 'pending'],
    [{ data: [], has_more: true }, 'pending'],
    [{ data: [...value.successEvents, { ...value.successEvents[0], id: 'evt_conflict', created: seconds + 1 }], has_more: false }, 'review'],
  ]) {
    const stripe = { events: { list: async () => response } };
    assert.equal((await findCalendarSuccessEvent({ ...input, stripe, maxPages: 1 })).status, expected);
  }
  const stripe = { events: { list: async () => { throw Error('must not query outside retention'); } } };
  assert.equal((await findCalendarSuccessEvent({ ...input, stripe, now: (value.session.payment_intent.created + 30 * 86400) * 1000 })).status, 'review');
});
