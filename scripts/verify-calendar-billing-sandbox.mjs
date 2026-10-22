// Opt-in Stripe-only probe. No Firebase writes, no existing customer/price/contract changes.
// Clock fixtures test subscription dates; they do not prove Checkout/3DS success timestamps.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calendarPeriod } from '../functions/calendarBillingPolicy.js';
import { calendarSubscriptionRequest, subscriptionRecoveryDecision } from '../functions/calendarPurchaseFlow.js';

if (!process.argv.includes('--run-calendar-sandbox')) {
  console.log('未実行。承認後に --run-calendar-sandbox を指定すると、専用テスト商品1件/価格1件/時計と顧客各4件を作成し、初回600円・更新2回・期間末解約を確認します。作成物だけを後片付けします。実請求/既存契約/Firebase変更なし。');
  process.exit(0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const runId = `calendar-probe-${randomUUID()}`;
const state = { runId, product: null, prices: [], clocks: [], results: [], cleanupErrors: [] };
const statePath = `/tmp/${runId}.json`;
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
const fixtures = ['2023-01-10T12:00:00+09:00', '2023-01-31T00:00:01+09:00', '2024-01-31T23:59:59+09:00', '2024-02-01T00:00:01+09:00'];
let stripe, failed = false;
const pause = () => new Promise(resolve => setTimeout(resolve, 2000));
async function waitFor(read, predicate, label) {
  for (let count = 0; count < 90; count += 1) {
    const value = await read();
    if (predicate(value)) return value;
    if (count % 15 === 0) console.log(`待機中: ${label}`);
    await pause();
  }
  throw new Error(`timeout:${label}`);
}
const invoicesFor = async customer => {
  const invoices = [];
  for await (const invoice of stripe.invoices.list({ customer, limit: 100 })) {
    assert.equal(invoice.livemode, false);
    invoices.push(invoice);
  }
  return invoices;
};
async function advance(clockId, timestamp) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: timestamp });
  await waitFor(() => stripe.testHelpers.testClocks.retrieve(clockId), clock => clock.status === 'ready', '時計の進行');
}

try {
  const config = readFileSync(root + 'functions/.env.construction2nd', 'utf8');
  assert.match(config, /^BILLING_SANDBOX=true\s*$/m);
  const key = execFileSync(root + 'node_modules/.bin/firebase', ['functions:secrets:access', 'STRIPE_SECRET_KEY', '--project', 'construction2nd'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.ok(key.startsWith('sk_test_'), 'test key only');
  const { default: Stripe } = await import(pathToFileURL(root + 'functions/node_modules/stripe/esm/stripe.esm.node.js'));
  stripe = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
  save();
  const product = await stripe.products.create({ name: '利用期間の専用テスト（販売不可）', metadata: { runId } }, { idempotencyKey: `${runId}:product` });
  assert.equal(product.livemode, false);
  state.product = product.id; save();
  const priceIds = {};
  for (const role of ['monthly']) {
    const price = await stripe.prices.create({ product: product.id, currency: 'jpy', unit_amount: 600, tax_behavior: 'inclusive', metadata: { runId, role }, ...(role === 'monthly' ? { recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } } : {}) }, { idempotencyKey: `${runId}:price:${role}` });
    assert.equal(price.livemode, false);
    state.prices.push(price.id); priceIds[role] = price.id; save();
  }
  for (const [index, fixture] of fixtures.entries()) {
    const joinedAt = Date.parse(fixture);
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: joinedAt / 1000, name: `${runId}:${index}` }, { idempotencyKey: `${runId}:clock:${index}` });
    const target = { id: clock.id, fixture, deleted: false }; state.clocks.push(target); save();
    const customer = await stripe.customers.create({ test_clock: clock.id, metadata: { runId } }, { idempotencyKey: `${runId}:customer:${index}` });
    assert.equal(customer.livemode, false); target.customer = customer.id; save();
    // Initial API payment is a separate probe, not a Checkout/card-consent/3DS test.
    const payment = await stripe.paymentIntents.create({ customer: customer.id, amount: 600, currency: 'jpy', payment_method: 'pm_card_visa', payment_method_types: ['card'], setup_future_usage: 'off_session', confirm: true, metadata: { runId } }, { idempotencyKey: `${runId}:payment:${index}` });
    assert.equal(payment.livemode, false); assert.equal(payment.status, 'succeeded'); assert.equal(payment.amount_received, 600);
    target.initialPayment = payment.id; save();
    const request = calendarSubscriptionRequest({ uid: `${runId}-${index}`, attemptId: `${runId}-${index}`, customerId: customer.id, paymentIntentId: payment.id, paymentMethodId: payment.payment_method, joinedAt, monthlyPriceId: priceIds.monthly, now: joinedAt });
    const sub = await stripe.subscriptions.create(request.params, request.options);
    assert.equal(sub.livemode, false); assert.equal(sub.customer, customer.id); target.subscription = sub.id; save();
    assert.equal(sub.current_period_end * 1000, request.initialPeriod.expiresAt, 'first renewal boundary');
    const repeated = await stripe.subscriptions.create(request.params, request.options);
    assert.equal(repeated.id, sub.id, 'same request must not create a second contract');
    const all = [];
    for await (const item of stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 })) all.push(item);
    assert.equal(all.length, 1);
    assert.deepEqual(subscriptionRecoveryDecision({ subscriptions: all, hasMore: false, paymentIntentId: payment.id, customerId: customer.id, firstAttemptAt: joinedAt, now: joinedAt + 48 * 3600000 }), { action: 'reuse', subscriptionId: sub.id });
    assert.equal((await invoicesFor(customer.id)).filter(invoice => invoice.amount_due > 0).length, 0, 'no extra initial charge');
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const period = calendarPeriod(joinedAt, 'monthly', cycle);
      await advance(clock.id, period.startsAt / 1000 - 1);
      assert.equal((await invoicesFor(customer.id)).filter(invoice => invoice.amount_due > 0).length, cycle - 1, 'no early invoice');
      await advance(clock.id, period.startsAt / 1000 + 3600);
      const invoices = await waitFor(() => invoicesFor(customer.id), rows => rows.filter(invoice => invoice.status === 'paid' && invoice.amount_paid === 600).length === cycle, '更新600円の支払');
      const paid = invoices.filter(invoice => invoice.amount_due > 0);
      assert.equal(paid.length, cycle);
      assert.ok(paid.every(invoice => invoice.amount_due === 600 && invoice.amount_paid === 600 && invoice.currency === 'jpy'));
      const current = await stripe.subscriptions.retrieve(sub.id);
      assert.equal(current.current_period_end * 1000, period.expiresAt, 'renewal preserves original date');
    }
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
    const end = calendarPeriod(joinedAt, 'monthly', 2).expiresAt;
    await advance(clock.id, end / 1000 + 3600);
    const canceled = await stripe.subscriptions.retrieve(sub.id);
    assert.equal(canceled.status, 'canceled');
    assert.equal((await invoicesFor(customer.id)).filter(invoice => invoice.amount_due > 0).length, 2, 'no renewal after cancellation');
    state.results.push({ fixture, initial: 600, renewals: [600, 600], cancellation: 'passed' }); save();
    console.log(`成功: ${fixture} 初回/更新2回/期間末解約`);
  }
} catch (error) {
  failed = true;
  state.error = { type: error.type || error.name, code: error.code || 'probe-failed' }; save();
  console.error('検証停止。秘密情報を含まない結果ファイルを確認してください。');
} finally {
  if (stripe) {
    // Only this invocation's recorded IDs; no list-all deletion or existing objects.
    for (const clock of state.clocks) {
      try {
        const found = await stripe.testHelpers.testClocks.retrieve(clock.id);
        assert.ok(found.name.startsWith(runId + ':'));
        await stripe.testHelpers.testClocks.del(clock.id); clock.deleted = true; save();
      } catch { state.cleanupErrors.push({ type: 'clock', id: clock.id }); }
    }
    for (const id of state.prices) {
      try { const found = await stripe.prices.retrieve(id); assert.equal(found.metadata.runId, runId); assert.equal(found.livemode, false); await stripe.prices.update(id, { active: false }); }
      catch { state.cleanupErrors.push({ type: 'price', id }); }
    }
    if (state.product) {
      try { const found = await stripe.products.retrieve(state.product); assert.equal(found.metadata.runId, runId); assert.equal(found.livemode, false); await stripe.products.update(found.id, { active: false }); }
      catch { state.cleanupErrors.push({ type: 'product', id: state.product }); }
    }
  }
  save();
  console.log(`結果: ${statePath}`);
  if (failed || state.cleanupErrors.length) process.exitCode = 1;
}
