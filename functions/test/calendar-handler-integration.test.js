import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fakeDatabase } from './helpers/fakeCalendarDatabase.js';
import { calendarPeriod } from '../calendarBillingPolicy.js';

// 実createCheckout/onRequest通知/保存adapter/processorを通す。
// Stripe応答・署名・Firestoreは模擬。ネットワーク/実秘密鍵は使わない。
test('新購入→通知の順序逆転/再送→契約/初回権利→購入停止後も更新。旧クライアントは拒否', async () => {
  const db = fakeDatabase();
  const uid = 'calendar-handler-fixture';
  const joinedAt = Math.floor(Date.now() / 1000) * 1000;
  const price = (id, amount, recurring = false) => ({ id, unit_amount: amount, active: true, livemode: false, currency: 'jpy', tax_behavior: 'inclusive', type: recurring ? 'recurring' : 'one_time', recurring: recurring ? { interval: 'month', interval_count: 1, usage_type: 'licensed' } : null });
  const prices = { price_initial: price('price_initial', 600), price_month: price('price_month', 600, true), price_pack: price('price_pack', 980) };
  const state = { checkouts: [], subscriptions: [], successEvents: [], invoices: new Map(), customersCreated: 0 };
  const apiList = rows => {
    const result = Promise.resolve({ data: structuredClone(rows), has_more: false });
    result[Symbol.asyncIterator] = async function* () { yield* structuredClone(rows); };
    return result;
  };
  const fixtureStripe = {
    customers: { create: async () => { state.customersCreated++; return { id: 'cus_handler' }; } },
    prices: { retrieve: async id => { assert.ok(prices[id]); return structuredClone(prices[id]); } },
    checkout: { sessions: {
      list: () => apiList(state.checkouts),
      create: async params => {
        assert.equal(params.mode, 'payment'); assert.equal(params.line_items[0].price, 'price_initial');
        assert.equal(params.payment_intent_data.setup_future_usage, 'off_session');
        if (state.checkouts.length) return structuredClone(state.checkouts[0]);
        const metadata = structuredClone(params.metadata);
        const charge = { id: 'ch_handler', customer: 'cus_handler', payment_intent: 'pi_handler', livemode: false,
          paid: true, captured: true, amount: 600, currency: 'jpy', created: joinedAt / 1000 - 1, amount_refunded: 0, disputed: false };
        const payment = { id: 'pi_handler', customer: 'cus_handler', livemode: false, metadata, status: 'succeeded',
          amount: 600, amount_received: 600, currency: 'jpy', created: joinedAt / 1000 - 1, payment_method: 'pm_handler', setup_future_usage: 'off_session', latest_charge: charge };
        const session = { id: 'cs_handler', url: 'https://checkout.stripe.com/c/pay/fixture', mode: 'payment', status: 'open', payment_status: 'unpaid',
          customer: 'cus_handler', client_reference_id: uid, metadata, amount_total: 600, currency: 'jpy', livemode: false,
          line_items: { data: [{ price: prices.price_initial, quantity: 1 }], has_more: false }, payment_intent: payment };
        state.checkouts.push(session); return structuredClone(session);
      },
      retrieve: async id => { assert.equal(id, 'cs_handler'); return structuredClone(state.checkouts[0]); },
    } },
    paymentIntents: { retrieve: async id => { assert.equal(id, 'pi_handler'); return structuredClone(state.checkouts[0].payment_intent); } },
    events: { list: async () => ({ data: structuredClone(state.successEvents), has_more: false }) },
    subscriptions: {
      list: () => apiList(state.subscriptions),
      retrieve: async id => { const sub = state.subscriptions.find(item => item.id === id); assert.ok(sub); return structuredClone(sub); },
      create: async (params, options) => {
        assert.equal(options.idempotencyKey, 'calendar-subscription:pi_handler');
        assert.equal(params.items[0].price, 'price_month'); assert.equal(params.proration_behavior, 'none');
        const original = state.subscriptions.find(item => item.metadata.initialPaymentIntentId === 'pi_handler');
        if (original) return structuredClone(original);
        const sub = { id: 'sub_handler', customer: 'cus_handler', currency: 'jpy', livemode: false, status: 'active', collection_method: 'charge_automatically',
          metadata: structuredClone(params.metadata), billing_cycle_anchor_config: structuredClone(params.billing_cycle_anchor_config), created: Math.floor(Date.now() / 1000), current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: calendarPeriod(joinedAt, 'monthly').expiresAt / 1000,
          items: { data: [{ price: prices.price_month, quantity: 1 }], has_more: false } };
        state.subscriptions.push(sub); return structuredClone(sub);
      },
    },
    invoices: { retrieve: async id => { assert.ok(state.invoices.has(id)); return structuredClone(state.invoices.get(id)); } },
    webhooks: { constructEvent: raw => JSON.parse(raw.toString()) },
  };
  Object.assign(process.env, { GOOGLE_CLOUD_PROJECT: 'calendar-handler-local', BILLING_ENABLED: 'true', BILLING_SANDBOX: 'true',
    BILLING_TESTER_UIDS: uid, CALENDAR_BILLING_ENABLED: 'true', SITE_URL: 'https://example.com',
    STRIPE_SECRET_KEY: 'sk_test_local_calendar_fixture', STRIPE_WEBHOOK_SECRET: 'whsec_local_calendar_fixture',
    STRIPE_CALENDAR_INITIAL_PRICE_ID: 'price_initial', STRIPE_CALENDAR_MONTHLY_PRICE_ID: 'price_month', STRIPE_CALENDAR_PACK_PRICE_ID: 'price_pack' });
  const symbol = Symbol.for('calendar-handler-fixture');
  globalThis[symbol] = { db, stripe: fixtureStripe };
  const hooks = registerHooks({ resolve(specifier, context, next) {
    const sources = {
      'firebase-admin/firestore': "export const getFirestore=()=>globalThis[Symbol.for('calendar-handler-fixture')].db;",
      stripe: "export default class Stripe {constructor(){return globalThis[Symbol.for('calendar-handler-fixture')].stripe;}}",
    };
    if (Object.hasOwn(sources, specifier)) return { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true };
    return next(specifier, context);
  } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error('network-prohibited'); };
  const originalError = console.error;
  console.error = (...args) => { assert.equal(args[0], 'billing-webhook-retry'); };
  try {
    const { createCheckout, stripeWebhook } = await import('../index.js');
    const data = { planId: 'monthly', consentVersion: 'calendar-jst-v1', recurringConsent: true };
    await assert.rejects(createCheckout.run({ auth: { uid }, data: { planId: 'monthly' } }), error => error.code === 'failed-precondition');
    assert.equal(state.customersCreated, 0);
    const result = await createCheckout.run({ auth: { uid }, data });
    assert.equal(result.url, 'https://checkout.stripe.com/c/pay/fixture'); assert.equal(state.checkouts.length, 1);
    const session = state.checkouts[0]; session.status = 'complete'; session.payment_status = 'paid';
    const emit = async (type, object, id) => {
      const event = { id, type, livemode: false, created: joinedAt / 1000, data: { object } };
      const response = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; }, sendStatus(code) { this.code = code; return this; } };
      await stripeWebhook({ method: 'POST', headers: { 'stripe-signature': 'fixture-only' }, rawBody: Buffer.from(JSON.stringify(event)) }, response);
      return { event, response };
    };
    const first = await emit('checkout.session.completed', session, 'evt_checkout');
    assert.equal(first.response.code, 500, '成功イベントが未着なら推定付与しない'); assert.equal(state.subscriptions.length, 0);
    const success = await emit('payment_intent.succeeded', session.payment_intent, 'evt_success');
    assert.equal(success.response.code, 200); assert.equal(state.subscriptions.length, 1);
    state.successEvents.push(success.event);
    assert.equal((await emit('checkout.session.completed', session, 'evt_checkout')).response.code, 200);
    assert.equal((await emit('payment_intent.succeeded', session.payment_intent, 'evt_success')).response.code, 200);
    const gpath = `users/${uid}/sandboxEntitlements/cs_handler`;
    assert.equal(db.documents.get(gpath).expiresAt, calendarPeriod(joinedAt, 'monthly').expiresAt);
    assert.equal(db.documents.get(gpath).joinedAt, joinedAt); assert.equal(state.subscriptions.length, 1);
    process.env.CALENDAR_BILLING_ENABLED = 'false'; // 受付停止と通知処理を独立させる。
    const period = calendarPeriod(joinedAt, 'monthly', 1);
    const invoice = { id: 'in_handler', customer: 'cus_handler', subscription: 'sub_handler', livemode: false, paid: true, status: 'paid',
      currency: 'jpy', billing_reason: 'subscription_cycle', amount_due: 600, amount_paid: 600, payment_intent: 'pi_renewal',
      charge: { ...session.payment_intent.latest_charge, id: 'ch_renewal', payment_intent: 'pi_renewal' },
      lines: { data: [{ price: prices.price_month, amount: 600, quantity: 1, proration: false, subscription: 'sub_handler', period: { start: period.startsAt / 1000, end: period.expiresAt / 1000 } }], has_more: false } };
    state.invoices.set(invoice.id, invoice);
    assert.equal((await emit('invoice.paid', invoice, 'evt_renewal')).response.code, 200);
    assert.equal(db.documents.get(`users/${uid}/sandboxEntitlements/${invoice.id}`).expiresAt, period.expiresAt);
    assert.equal((await emit('invoice.paid', invoice, 'evt_renewal')).response.code, 200);
    assert.equal(state.subscriptions.length, 1);
    await assert.rejects(createCheckout.run({ auth: { uid }, data }), error => error.code === 'failed-precondition');
  } finally {
    console.error = originalError; globalThis.fetch = originalFetch; hooks.deregister(); delete globalThis[symbol];
  }
});
