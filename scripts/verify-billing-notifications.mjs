// Explicit sandbox-only integration check against the deployed webhook.
// Fresh fake customers only; no personal information or real payment cards.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv.includes('--run-sandbox-check')) {
  console.log('Explicit --run-sandbox-check required; creates test subscriptions, test payments and refunds.');
  process.exit(0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'package.json');
const runId = new Date().toISOString().replace(/[^0-9]/g, '');
const file = `/tmp/construction-notifications-${runId}.json`;
const state = { runId, targets: [], cases: [], replays: [] };
const save = () => writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const stable = value => JSON.stringify(canonical(value));
let stripe;
try {
  const config = Object.fromEntries(readFileSync(root + 'functions/.env.construction2nd', 'utf8').split('\n')
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
  assert.equal(config.BILLING_SANDBOX, 'true');
  const secret = name => execFileSync(root + 'node_modules/.bin/firebase',
    ['functions:secrets:access', name, '--project', 'construction2nd'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const key = secret('STRIPE_SECRET_KEY');
  assert.ok(key.startsWith('sk_test_'));
  const signing = secret('STRIPE_WEBHOOK_SECRET');
  const { default: Stripe } = await import(pathToFileURL(root + 'functions/node_modules/stripe/esm/stripe.esm.node.js'));
  const { accessSummary } = await import(pathToFileURL(root + 'functions/billingPolicy.js'));
  stripe = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
  const auth = require('firebase-tools/lib/auth.js');
  const token = await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const db = 'https://firestore.googleapis.com/v1/projects/construction2nd/databases/(default)/documents/';
  const headers = { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json' };
  const webhook = 'https://asia-northeast1-construction2nd.cloudfunctions.net/stripeWebhook';
  const record = (name, detail = {}) => { state.cases.push({ name, ...detail }); save(); console.log(JSON.stringify({ pass: name, ...detail })); };
  async function get(path) {
    const response = await fetch(db + path, { headers });
    if (response.status === 404) return null;
    assert.equal(response.status, 200, 'Firestore read failed');
    return response.json();
  }
  const grants = async uid => ((await get(`users/${uid}/sandboxEntitlements`))?.documents || []).sort((a, b) => a.name.localeCompare(b.name));
  const fields = docs => docs.map(doc => doc.fields);
  const grantValues = doc => Object.fromEntries(Object.entries(doc.fields).map(([key, value]) => [key,
    'integerValue' in value ? Number(value.integerValue) : 'booleanValue' in value ? value.booleanValue : value.stringValue]));
  async function poll(read, ready, name) {
    for (let count = 0; count < 40; count++) {
      const value = await read();
      if (ready(value)) return value;
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    throw new Error(name + '-timeout');
  }
  async function event(type, id) {
    return poll(async () => {
      for await (const item of stripe.events.list({ type, limit: 100 })) {
        if (item.data.object.id === id) { assert.equal(item.livemode, false); return item; }
      }
      return null;
    }, Boolean, 'event');
  }
  async function replay(item) {
    assert.equal(item.livemode, false);
    const payload = JSON.stringify(item);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: signing });
    const response = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': signature }, body: payload });
    assert.equal(response.status, 200, 'webhook replay failed');
    state.replays.push({ event: item.id, type: item.type, status: response.status }); save();
  }
  async function mapCustomer(target) {
    assert.ok(target.uid.startsWith(`billing-notification-${runId}-`));
    const response = await fetch(db + `sandboxBillingCustomers/${target.uid}?currentDocument.exists=false`, {
      method: 'PATCH', headers, body: JSON.stringify({ fields: { customerId: { stringValue: target.customer } } })
    });
    assert.equal(response.status, 200, 'fresh fake mapping failed');
  }
  const testerUids = config.BILLING_TESTER_UIDS.split(',').map(value => value.trim()).filter(Boolean);
  const testerBefore = await Promise.all(testerUids.map(async uid => stable(fields(await grants(uid)))));
  save();

  const old = JSON.parse(readFileSync('/tmp/construction-payment-failure-state.json', 'utf8')).renewal;
  assert.equal(old.uid, 'billing-failure-test-20261020-renewal');
  const oldBefore = await grants(old.uid);
  assert.equal(oldBefore.length, 2);
  for (const doc of oldBefore) {
    const id = doc.name.split('/').at(-1);
    const invoice = await stripe.invoices.retrieve(id);
    assert.equal(invoice.livemode, false); assert.equal(invoice.customer, old.customer);
    const item = await event('invoice.paid', id);
    await Promise.all([replay(item), replay(item)]);
  }
  assert.equal(stable(fields(await grants(old.uid))), stable(fields(oldBefore)));
  record('monthly invoice duplicate delivery: two grants and all periods unchanged');

  async function make(name, mapped) {
    const target = { uid: `billing-notification-${runId}-${name}` };
    state.targets.push(target); save();
    const customer = await stripe.customers.create({ metadata: { purpose: 'billing-notification-test', uid: target.uid } }, { idempotencyKey: target.uid + '-customer' });
    assert.equal(customer.livemode, false); target.customer = customer.id; save();
    if (mapped) await mapCustomer(target);
    const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } }, { idempotencyKey: target.uid + '-pm' });
    await stripe.paymentMethods.attach(pm.id, { customer: target.customer });
    const subscription = await stripe.subscriptions.create({ customer: target.customer, default_payment_method: pm.id,
      items: [{ price: config.STRIPE_MONTHLY_PRICE_ID }], payment_behavior: 'default_incomplete', metadata: { purpose: 'billing-notification-test' }
    }, { idempotencyKey: target.uid + '-sub' });
    assert.equal(subscription.livemode, false); target.subscription = subscription.id; target.invoice = subscription.latest_invoice; save();
    let invoice = await stripe.invoices.retrieve(target.invoice);
    if (invoice.status !== 'paid') await stripe.invoices.pay(invoice.id, { payment_method: pm.id }, { idempotencyKey: target.uid + '-pay' });
    invoice = await stripe.invoices.retrieve(target.invoice, { expand: ['charge'] });
    assert.equal(invoice.paid, true); assert.equal(invoice.amount_paid, 480); assert.equal(invoice.charge.livemode, false);
    target.charge = invoice.charge.id; save();
    return target;
  }
  const partial = await make('partial', true);
  const partialBefore = await poll(() => grants(partial.uid), docs => docs.length === 1 && docs[0].fields.revoked.booleanValue === false, 'paid grant');
  const refundedPart = await stripe.refunds.create({ charge: partial.charge, amount: 1 }, { idempotencyKey: partial.uid + '-refund' });
  assert.equal(refundedPart.status, 'succeeded'); partial.refund = refundedPart.id; save();
  const partialAfter = await poll(() => grants(partial.uid), docs => docs.length === 1 && docs[0].fields.revoked.booleanValue === true, 'partial refund notification');
  const expectedPartial = structuredClone(fields(partialBefore)); expectedPartial[0].revoked = { booleanValue: true };
  assert.equal(stable(fields(partialAfter)), stable(expectedPartial));
  assert.equal(accessSummary(partialAfter.map(grantValues)).hasAccess, false);
  const partialPaid = await event('invoice.paid', partial.invoice);
  await replay(partialPaid); await replay(partialPaid);
  assert.equal(stable(fields(await grants(partial.uid))), stable(fields(partialAfter)));
  record('1 JPY partial refund: actual notification revokes access; paid replays do not restore it', { invoice: partial.invoice, refund: partial.refund });

  const firstRefund = await make('refund-first', false);
  const paidEvent = await event('invoice.paid', firstRefund.invoice);
  const fullRefund = await stripe.refunds.create({ charge: firstRefund.charge }, { idempotencyKey: firstRefund.uid + '-refund' });
  assert.equal(fullRefund.status, 'succeeded'); firstRefund.refund = fullRefund.id; save();
  await poll(() => get(`sandboxBillingRevocations/${firstRefund.charge}`), Boolean, 'refund marker');
  assert.equal((await grants(firstRefund.uid)).length, 0);
  const refundEvent = await event('charge.refunded', firstRefund.charge);
  await mapCustomer(firstRefund);
  await replay(refundEvent); await replay(paidEvent);
  const revoked = await grants(firstRefund.uid);
  assert.equal(revoked.length, 1); assert.equal(revoked[0].fields.revoked.booleanValue, true);
  assert.equal(accessSummary(revoked.map(grantValues)).hasAccess, false);
  await Promise.all([replay(paidEvent), replay(refundEvent)]);
  assert.equal(stable(fields(await grants(firstRefund.uid))), stable(fields(revoked)));
  record('480 JPY full refund before grant: refund marker prevents late paid notification and concurrent replays restoring access', { invoice: firstRefund.invoice, refund: firstRefund.refund });

  const unsigned = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unsigned.status, 400);
  const wrongEnvironment = JSON.stringify({ ...paidEvent, livemode: true });
  const mismatch = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json',
    'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: wrongEnvironment, secret: signing }) }, body: wrongEnvironment });
  assert.equal(mismatch.status, 400);
  record('unsigned notification and signed environment mismatch: HTTP 400');
  assert.deepEqual(await Promise.all(testerUids.map(async uid => stable(fields(await grants(uid))))), testerBefore);
  record('original tester grants unchanged');
  state.result = 'passed';
} catch (error) {
  state.result = 'failed'; state.failure = { type: error.type || error.name, code: error.code || 'check-failed' };
  console.error(JSON.stringify(state.failure)); process.exitCode = 1;
} finally {
  if (stripe) for (const target of state.targets) if (target.subscription) {
    try {
      const subscription = await stripe.subscriptions.retrieve(target.subscription);
      assert.equal(subscription.livemode, false); assert.equal(subscription.customer, target.customer);
      assert.ok(target.uid.startsWith(`billing-notification-${runId}-`));
      if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id);
      target.subscriptionStopped = true;
    } catch (error) { state.cleanupFailure = { type: error.type || error.name, code: error.code || 'check-failed' }; process.exitCode = 1; }
  }
  save(); console.log(JSON.stringify({ result: state.result, cases: state.cases.length, replays: state.replays.length, file, cleanupFailure: state.cleanupFailure }));
}
