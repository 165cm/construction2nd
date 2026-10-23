import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarBillingProcessor } from '../calendarBillingProcessor.js';
import { createCalendarPurchaseStore } from '../calendarPurchaseStore.js';
import { createBillingPriceRegistry } from '../billingPriceRegistry.js';
import { CALENDAR_POLICY_VERSION, calendarPeriod } from '../calendarBillingPolicy.js';
import { billingPaths } from '../billingEnvironment.js';
import { fakeDatabase } from './helpers/fakeCalendarDatabase.js';
const clone = value => structuredClone(value);
const joinedAt = Date.parse('2027-01-31T00:00:01+09:00');
const price = (id, amount, recurring = false) => ({ id, unit_amount: amount, currency: 'jpy', livemode: false, active: true,
  type: recurring ? 'recurring' : 'one_time', tax_behavior: 'inclusive', recurring: recurring ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null });
async function fixture(planId = 'monthly') {
  const paths = uid => billingPaths(true, uid);
  const db = fakeDatabase();
  const store = createCalendarPurchaseStore({ db, paths });
  const purchase = { uid: 'fixture-user', attemptId: 'fixture-attempt', customerId: 'cus_fixture', planId,
    priceId: planId === 'monthly' ? 'price_initial' : 'price_pack', ...(planId === 'monthly' ? { monthlyPriceId: 'price_month' } : {}),
    policyVersion: CALENDAR_POLICY_VERSION, consentVersion: 'calendar-jst-v1', recurringConsent: planId === 'monthly', createdAt: joinedAt - 120000 };
  await store.register(purchase); await store.bindSession(purchase.uid, purchase.attemptId, 'cs_fixture');
  const metadata = { uid: purchase.uid, attemptId: purchase.attemptId, planId, policyVersion: CALENDAR_POLICY_VERSION };
  const amount = planId === 'monthly' ? 600 : 980;
  const charge = { id: 'ch_fixture', customer: purchase.customerId, payment_intent: 'pi_fixture', livemode: false, currency: 'jpy', amount,
    amount_refunded: 0, disputed: false, paid: true, captured: true, created: (joinedAt - 120000) / 1000 };
  const payment = { id: 'pi_fixture', customer: purchase.customerId, metadata, livemode: false, status: 'succeeded', currency: 'jpy', amount,
    amount_received: amount, created: (joinedAt - 120000) / 1000, latest_charge: charge, payment_method: 'pm_fixture', setup_future_usage: planId === 'monthly' ? 'off_session' : null };
  const session = { id: 'cs_fixture', customer: purchase.customerId, client_reference_id: purchase.uid, mode: 'payment', status: 'complete',
    payment_status: 'paid', currency: 'jpy', livemode: false, amount_total: amount, metadata, payment_intent: payment,
    line_items: { has_more: false, data: [{ quantity: 1, price: price(purchase.priceId, amount) }] } };
  const event = { id: 'evt_fixture', type: 'payment_intent.succeeded', livemode: false, created: joinedAt / 1000, data: { object: clone(payment) } };
  const registry = createBillingPriceRegistry({ sandbox: true, prices: { calendarInitial: 'price_initial', calendarMonthly: 'price_month', calendarPack: 'price_pack' } });
  const state = { now: joinedAt + 1000, subscriptions: [], creates: 0, cancels: 0, events: 0, responseLost: false, refundDuringCreate: false, cancelFail: false, wrongBoundary: false, wrongConfig: false, incompleteList: false };
  const stripe = {
    checkout: { sessions: { retrieve: async id => { assert.equal(id, session.id); return clone(session); } } },
    events: { list: async () => { state.events++; return { data: [clone(event)], has_more: false }; } },
    prices: { retrieve: async id => { assert.equal(id, 'price_month'); return price(id, 600, true); } },
    subscriptions: {
      list: async () => ({ data: clone(state.subscriptions), has_more: state.incompleteList }),
      retrieve: async id => { const found = state.subscriptions.find(sub => sub.id === id); assert.ok(found); return clone(found); },
      create: async (params, options) => {
        assert.equal(options.idempotencyKey, 'calendar-subscription:pi_fixture');
        assert.equal(params.proration_behavior, 'none');
        const existing = state.subscriptions.find(sub => sub.metadata.initialPaymentIntentId === params.metadata.initialPaymentIntentId);
        if (existing) return clone(existing);
        state.creates++;
        const sub = { id: 'sub_fixture', customer: purchase.customerId, livemode: false, status: 'active', metadata: clone(params.metadata),
          currency: 'jpy', collection_method: 'charge_automatically', billing_cycle_anchor_config: state.wrongConfig ? null : clone(params.billing_cycle_anchor_config), created: Math.floor(state.now / 1000), current_period_start: Math.floor(state.now / 1000),
          current_period_end: calendarPeriod(joinedAt, 'monthly').expiresAt / 1000 + (state.wrongBoundary ? 86400 : 0),
          items: { has_more: false, data: [{ price: price('price_month', 600, true), quantity: 1 }] } };
        state.subscriptions.push(sub);
        if (state.refundDuringCreate) db.write(`${paths(purchase.uid).revocations}/${charge.id}`, { revoked: true });
        if (state.responseLost) { state.responseLost = false; throw Error('fixture-response-lost'); }
        return clone(sub);
      },
      cancel: async (id, params) => {
        assert.deepEqual(params, { invoice_now: false, prorate: false }); state.cancels++;
        if (state.cancelFail) { state.cancelFail = false; throw Error('fixture-cancel-retry'); }
        const found = state.subscriptions.find(sub => sub.id === id); assert.ok(found); found.status = 'canceled'; return clone(found);
      },
    },
  };
  const processor = createCalendarBillingProcessor({ stripe, store, registry, sandbox: true, now: () => state.now });
  const input = { uid: purchase.uid, attemptId: purchase.attemptId };
  const read = () => store.get(purchase.uid, purchase.attemptId);
  const gpath = `${paths(purchase.uid).grants}/${session.id}`;
  return { db, store, registry, stripe, processor, purchase, session, event, state, input, read, gpath, paths };
}

test('初回支払い→正本保存→月次契約→利用権。並行通知/再送でも契約と初回権利は1件', async () => {
  const f = await fixture();
  const results = await Promise.all(Array.from({ length: 8 }, () => f.processor.initial(f.input)));
  assert.ok(results.some(result => result.status === 'complete'));
  assert.equal(f.state.creates, 1);
  assert.equal((await f.processor.initial(f.input)).status, 'complete');
  const saved = await f.read();
  assert.equal(saved.status, 'complete'); assert.equal(saved.subscriptionId, 'sub_fixture');
  assert.equal(saved.joinedAt, joinedAt); assert.equal(saved.successEventId, f.event.id);
  assert.equal(f.db.documents.get(f.gpath).expiresAt, Date.parse('2027-03-01T00:00:00+09:00'));
  assert.equal([...f.db.documents.keys()].filter(path => path.includes('/sandboxEntitlements/')).length, 1);
});

test('Stripe作成成功後の応答喪失は保存済み初回を提供し、既存契約照合で回復する', async () => {
  const f = await fixture(); f.state.responseLost = true;
  await assert.rejects(f.processor.initial(f.input), /response-lost/);
  const pending = await f.read(); assert.equal(pending.status, 'paid'); assert.ok(f.db.documents.has(f.gpath));
  const firstAttempt = pending.firstAttemptAt;
  f.state.now += 2 * 86400000; // 冪等キー保持期間後でも、既存を照合できれば再作成しない。
  assert.equal((await f.processor.initial(f.input)).status, 'complete');
  assert.equal(f.state.creates, 1); assert.equal((await f.read()).firstAttemptAt, firstAttempt);
});

test('Stripe応答成功→DB結果保存失敗も同じ契約へ戻る', async () => {
  const f = await fixture();
  const original = f.store.finish; let fail = true;
  f.store.finish = async (...args) => { if (fail) { fail = false; throw Error('fixture-db-failed'); } return original(...args); };
  await assert.rejects(f.processor.initial(f.input), /db-failed/);
  assert.equal(f.state.subscriptions.length, 1);
  assert.equal((await f.processor.initial(f.input)).status, 'complete'); assert.equal(f.state.creates, 1);
});

test('作成中の失効は契約IDを保持して補償取消し。取消し失敗も再送で回復', async () => {
  const f = await fixture(); f.state.refundDuringCreate = true; f.state.cancelFail = true;
  await assert.rejects(f.processor.initial(f.input), /cancel-retry/);
  assert.equal((await f.read()).status, 'stop_required'); assert.equal((await f.read()).subscriptionId, 'sub_fixture');
  assert.equal((await f.processor.initial(f.input)).status, 'review');
  assert.equal(f.state.subscriptions[0].status, 'canceled'); assert.equal(f.state.creates, 1);
  assert.equal(f.db.documents.get(f.gpath).revoked, true); assert.equal((await f.read()).stopped, true);
});

test('新規契約が希望境界に合わない場合は自動更新を続けず、初回支払済み期間は維持', async () => {
  const f = await fixture(); f.state.wrongBoundary = true;
  assert.equal((await f.processor.initial(f.input)).status, 'review');
  assert.equal(f.state.cancels, 1); assert.equal(f.state.subscriptions[0].status, 'canceled');
  assert.equal(f.db.documents.get(f.gpath).revoked, false);
});

test('イベント先着/未着/探索不完了は正本日時を推定せず、契約を作成しない', async () => {
  const f = await fixture();
  f.stripe.events.list = async () => ({ data: [], has_more: false });
  assert.equal((await f.processor.initial(f.input)).status, 'pending'); assert.equal(f.state.creates, 0);
  assert.equal(f.db.documents.has(f.gpath), false);
  assert.equal((await f.processor.initial({ ...f.input, successEvent: f.event })).status, 'complete');
});

test('全件未照合/23h後に既存不明/初回期限経過は自動再作成しない', async () => {
  const f = await fixture(); f.state.incompleteList = true;
  assert.equal((await f.processor.initial(f.input)).status, 'pending'); assert.equal(f.state.creates, 0);
  const firstAttempt = (await f.read()).firstAttemptAt;
  f.state.incompleteList = false; f.state.now = firstAttempt + 23 * 3600000;
  assert.equal((await f.processor.initial(f.input)).status, 'review'); assert.equal(f.state.creates, 0);
  const expired = await fixture(); expired.state.now = calendarPeriod(joinedAt, 'monthly').expiresAt;
  await assert.rejects(expired.processor.initial(expired.input), /reconciliation/); assert.equal(expired.state.creates, 0);
});

test('パックは新規契約なしで初回提供。後日の返金を通常完了した月額の自動解約にはしない', async () => {
  const pack = await fixture('pack'); assert.equal((await pack.processor.initial(pack.input)).status, 'complete'); assert.equal(pack.state.creates, 0);
  const f = await fixture(); await f.processor.initial(f.input);
  f.session.payment_intent.latest_charge.amount_refunded = 1;
  assert.equal((await f.processor.initial(f.input)).status, 'complete');
  assert.equal(f.db.documents.get(f.gpath).revoked, true); assert.equal(f.state.cancels, 0);
});

test('更新の600円支払済み1期間のみ付与し、再送/0円作成時請求で追加しない', async () => {
  const f = await fixture(); await f.processor.initial(f.input);
  const period = calendarPeriod(joinedAt, 'monthly', 1);
  const invoice = { id: 'in_fixture', customer: f.purchase.customerId, subscription: 'sub_fixture', livemode: false,
    paid: true, status: 'paid', currency: 'jpy', billing_reason: 'subscription_cycle', amount_paid: 600, amount_due: 600,
    payment_intent: 'pi_renewal', charge: { ...f.session.payment_intent.latest_charge, id: 'ch_renewal', payment_intent: 'pi_renewal' },
    lines: { has_more: false, data: [{ subscription: 'sub_fixture', price: price('price_month', 600, true), quantity: 1, amount: 600,
      proration: false, period: { start: period.startsAt / 1000, end: period.expiresAt / 1000 } }] } };
  assert.equal((await f.processor.renewal({ ...f.input, invoice })).status, 'complete');
  assert.equal((await f.processor.renewal({ ...f.input, invoice })).status, 'complete');
  const path = `${f.paths(f.purchase.uid).grants}/${invoice.id}`;
  assert.equal(f.db.documents.get(path).expiresAt, period.expiresAt);
  assert.equal((await f.processor.renewal({ ...f.input, invoice: { ...invoice, amount_paid: 0 } })).status, 'review');
  assert.equal((await f.processor.renewal({ ...f.input, invoice: { billing_reason: 'subscription_create', amount_paid: 0, amount_due: 0 } })).status, 'ignored');
});


test('初回終了日だけ合っても元加入日へ戻るconfigが不明な契約は回復時も止める', async () => {
  const f = await fixture(); f.state.wrongConfig = true; f.state.responseLost = true;
  await assert.rejects(f.processor.initial(f.input), /response-lost/);
  assert.equal((await f.processor.initial(f.input)).status, 'review');
  assert.equal(f.state.creates, 1); assert.equal(f.state.cancels, 1);
  assert.equal(f.db.documents.get(f.gpath).revoked, false);
});
