import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { calendarPeriod } from '../calendarBillingPolicy.js';
import { createCalendarRenewalProbeGuard } from '../calendarRenewalProbeGuard.js';
import { fakeDatabase } from './helpers/fakeCalendarDatabase.js';
import { createCalendarPurchaseStore } from '../calendarPurchaseStore.js';
import { billingPaths } from '../billingEnvironment.js';

function fixture() {
  const runId = 'calendar-probe-' + randomUUID(), db = fakeDatabase();
  const dates = ['2023-01-10T12:00:00+09:00', '2023-01-31T00:00:01+09:00', '2024-01-31T23:59:59+09:00', '2024-02-01T12:00:00+09:00'];
  const cases = dates.map((date, index) => {
    const uid = `${runId}-${index}`, joinedAt = Date.parse(date);
    const purchase = { uid, attemptId: uid, customerId: 'cus_' + index, subscriptionId: 'sub_' + index,
      joinedAt, createdAt: joinedAt, sessionId: 'cs_renewal_fixture_' + index, monthlyPriceId: 'price_monthly',
      priceId: 'price_probeUnusedInitial', planId: 'monthly', status: 'complete', policyVersion: 'jst-calendar-v1',
      consentVersion: 'calendar-jst-v1', recurringConsent: true, revoked: false, paymentIntentId: 'pi_initial' + index };
    db.write(`sandboxBillingCustomers/${uid}`, { customerId: purchase.customerId });
    db.write(`users/${uid}/sandboxBillingPurchases/${uid}`, purchase);
    const invoices = [1, 2].map(periodIndex => {
      const id = `${index}_${periodIndex}`, period = calendarPeriod(joinedAt, 'monthly', periodIndex);
      const target = { uid, attemptId: uid, customerId: purchase.customerId, subscriptionId: purchase.subscriptionId,
        joinedAt, sessionId: purchase.sessionId, monthlyPriceId: 'price_monthly', eventId: 'evt_' + id,
        eventCreated: 1792712000 + index * 2 + periodIndex, invoiceId: 'in_' + id, periodIndex, ...period };
      const grant = { id: target.invoiceId, planId: 'monthly', chargeId: 'ch_' + id, subscriptionId: purchase.subscriptionId,
        paymentIntentId: 'pi_' + id, ...period, joinedAt, policyVersion: 'jst-calendar-v1', priceId: 'price_monthly', revoked: false };
      const event = { id: target.eventId, type: 'invoice.paid', livemode: false, created: target.eventCreated, data: { object: {
        id: target.invoiceId, livemode: false, customer: purchase.customerId, subscription: purchase.subscriptionId,
        paid: true, status: 'paid', billing_reason: 'subscription_cycle', currency: 'jpy', amount_paid: 600, amount_due: 600,
        lines: { has_more: false, data: [{ price: { id: 'price_monthly' }, quantity: 1, amount: 600, proration: false,
          subscription: purchase.subscriptionId, period: { start: period.startsAt / 1000, end: period.expiresAt / 1000 } }] },
      } } };
      return { target, grant, event };
    });
    return { index, fixture: date, uid, attemptId: uid, joinedAt, customerId: purchase.customerId,
      subscriptionId: purchase.subscriptionId, initialPaymentIntentId: purchase.paymentIntentId, subscriptionStatus: 'canceled', purchase, invoices };
  });
  return { runId, db, cases, stripe: { invoices: { retrieve: async id => structuredClone(cases.flatMap(c => c.invoices).find(i => i.target.invoiceId === id).event.data.object) } }, targets: cases.flatMap(c => c.invoices.map(i => i.target)) };
}
test('隔離時計4種類の更新8通知だけを許可し、未知通知は処理しない', async () => {
  const f = fixture(), guard = createCalendarRenewalProbeGuard({ targets: f.targets, db: f.db, stripe: f.stripe });
  for (const c of f.cases) for (const i of c.invoices) assert.equal(await guard(i.event), true);
  assert.equal(await guard({ id: 'evt_unknown' }), false);
});
test('既知IDでも環境・料金・所有者・期間・未完了購入の不一致は拒否', async () => {
  const mutations = [e => e.livemode = true, e => e.type = 'payment_intent.succeeded', e => e.created++,
    e => e.data.object.amount_paid = 480, e => e.data.object.customer = 'cus_other',
    e => e.data.object.lines.data[0].period.end++, e => e.data.object.lines.data[0].proration = true];
  for (const mutate of mutations) {
    const f = fixture(), event = f.cases[0].invoices[0].event; mutate(event);
    await assert.rejects(createCalendarRenewalProbeGuard({ targets: f.targets, db: f.db, stripe: f.stripe })(event), /event-mismatch/);
  }
  for (const field of ['status', 'joinedAt', 'monthlyPriceId', 'recurringConsent']) {
    const f = fixture(), c = f.cases[0];
    f.db.write(`users/${c.uid}/sandboxBillingPurchases/${c.uid}`, { ...c.purchase, [field]: 'wrong' });
    await assert.rejects(createCalendarRenewalProbeGuard({ targets: f.targets, db: f.db, stripe: f.stripe })(c.invoices[0].event), /purchase-mismatch/);
  }
  const f = fixture(); f.db.write('sandboxBillingCustomers/other', { customerId: f.cases[0].customerId });
  await assert.rejects(createCalendarRenewalProbeGuard({ targets: f.targets, db: f.db, stripe: f.stripe })(f.cases[0].invoices[0].event), /owner-mismatch/);
});
test('保存Eventが新API形式でも固定APIの正本を照合し、正本の別契約を拒否', async () => {
  const f = fixture(), event = structuredClone(f.cases[0].invoices[0].event);
  delete event.data.object.subscription; delete event.data.object.paid;
  delete event.data.object.lines.data[0].price; delete event.data.object.lines.data[0].subscription;
  const guard = createCalendarRenewalProbeGuard({ targets: f.targets, db: f.db, stripe: f.stripe });
  assert.equal(await guard(event), true);
  f.cases[0].invoices[0].event.data.object.subscription = 'sub_other';
  await assert.rejects(guard(event), /event-mismatch/);
});
test('対象リストの複製・別UID・任意期間・別契約への拡張は拒否', () => {
  const f = fixture();
  for (const mutate of [t => t[1] = structuredClone(t[0]), t => t[0].uid = 'real_user',
    t => t[0].expiresAt++, t => t[0].subscriptionId = 'sub_other', t => t.pop()]) {
    const targets = structuredClone(f.targets); mutate(targets);
    assert.throws(() => createCalendarRenewalProbeGuard({ targets, db: f.db }), /invalid-renewal/);
  }
});
test('完了fixtureからの更新保存は並行再送でも8件だけ、購入不変・失効マーカー保持', async () => {
  const f = fixture(), store = createCalendarPurchaseStore({ db: f.db, paths: uid => billingPaths(true, uid) });
  const jobs = f.cases.flatMap(c => c.invoices.map(i => [c, i]));
  await Promise.all([...jobs, ...jobs].map(([c, i]) => store.saveRenewal(c.purchase, i.grant)));
  assert.equal([...f.db.documents.keys()].filter(p => p.includes('/sandboxEntitlements/')).length, 8);
  for (const c of f.cases) assert.deepEqual(await store.get(c.uid, c.uid), c.purchase);
  const c = f.cases[0], invoice = c.invoices[0];
  f.db.write(`sandboxBillingRevocations/${invoice.grant.chargeId}`, { revoked: true });
  await store.saveRenewal(c.purchase, invoice.grant);
  assert.equal(f.db.documents.get(`users/${c.uid}/sandboxEntitlements/${invoice.grant.id}`).revoked, true);
});
test('更新用配備資料は公開export1/専用Secret/最大1instance、外部操作0で生成', () => {
  const f = fixture(), input = mkdtempSync('/tmp/calendar-renewal-package-test-');
  const output = `/tmp/calendar-renewal-probe-${f.runId.slice('calendar-probe-'.length)}`;
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const evidence = { runId: f.runId, monthlyPriceId: 'price_monthly', cases: f.cases.map(c => ({ ...c,
    invoices: c.invoices.map(i => ({ invoiceId: i.target.invoiceId, eventId: i.target.eventId, eventCreated: i.target.eventCreated, grant: i.grant })) })) };
  const state = { runId: f.runId, cleanupErrors: [], prices: ['price_monthly'], clocks: f.cases.map(c => ({
    deleted: true, fixture: c.fixture, customer: c.customerId, subscription: c.subscriptionId, initialPayment: c.initialPaymentIntentId })) };
  writeFileSync(input + '/state.json', JSON.stringify(state)); writeFileSync(input + '/evidence.json', JSON.stringify(evidence));
  try {
    const result = JSON.parse(execFileSync(process.execPath, [root + 'scripts/prepare-calendar-renewal-probe.mjs', '--prepare-renewal-probe', '--state', input + '/state.json', '--evidence', input + '/evidence.json'], { encoding: 'utf8' }));
    assert.equal(result.externalActions, 0); assert.equal(result.seedDocuments, 8); assert.equal(result.maximumDocuments, 16);
    const env = readFileSync(output + '/functions/.env.construction2nd', 'utf8');
    for (const entry of ['BILLING_ENABLED=false', 'CALENDAR_BILLING_ENABLED=false', 'PRIVATE_CONTENT_ENABLED=false', 'SITE_URL=https://example.invalid']) assert.ok(env.includes(entry));
    assert.doesNotMatch(env, /SECRET|sk_test_|whsec_/);
    const inspect = `import {registerHooks} from 'node:module'; import assert from 'node:assert/strict';
      registerHooks({resolve(specifier,context,next){if(specifier.startsWith('firebase-')||specifier==='stripe')return next(specifier,{...context,parentURL:${JSON.stringify(new URL('../index.js', import.meta.url).href)}}); return next(specifier,context);}});
      const module=await import(${JSON.stringify('file://' + output + '/functions/probeEntry.js')});
      assert.deepEqual(Object.keys(module),['calendarRenewalWebhookProbe']);
      const endpoint=module.calendarRenewalWebhookProbe.__endpoint;
      assert.deepEqual(endpoint.secretEnvironmentVariables.map(s=>s.key).sort(),['CALENDAR_RENEWAL_PROBE_WEBHOOK_SECRET','STRIPE_SECRET_KEY']);
      assert.equal(endpoint.maxInstances,1);`;
    execFileSync(process.execPath, ['--input-type=module', '-e', inspect], { encoding: 'utf8' });
  } finally { rmSync(input, { recursive: true, force: true }); rmSync(output, { recursive: true, force: true }); }
});
