// 承認済みの専用更新fixture最大16文書だけを一時保存/削除。Stripe操作は読取のみ。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCalendarRenewalProbeGuard } from '../functions/calendarRenewalProbeGuard.js';
import { createBillingPriceRegistry } from '../functions/billingPriceRegistry.js';
import { calendarRenewalGrant } from '../functions/calendarPaymentEvidence.js';

const args = process.argv.slice(2);
const seed = args.length === 3 && args[0] === '--seed-renewal-fixture' && args[1] === '--fixture';
const verify = args.length === 3 && args[0] === '--verify-renewal-fixture' && args[1] === '--fixture';
const cleanup = args.length === 4 && args[0] === '--cleanup-renewal-fixture' && args[1] === '--fixture' && args[3] === '--receiver-stopped';
if (!seed && !cleanup && !verify) { console.log('未実行。読取照合は --verify-renewal-fixture --fixture <専用fixture.json>。承認後のみ --seed-renewal-fixture --fixture <専用fixture.json>。削除は --cleanup-renewal-fixture --fixture <同ファイル> --receiver-stopped。'); process.exit(args.length ? 1 : 0); }
assert.match(args[2], /^\/tmp\/calendar-renewal-probe-[0-9a-f-]+\/fixture\.json$/i);
const source = JSON.parse(readFileSync(args[2], 'utf8'));
assert.match(source.runId, /^calendar-probe-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.ok(args[2].includes('/calendar-renewal-probe-' + source.runId.slice('calendar-probe-'.length) + '/'));
const targets = source.fixtures.flatMap(f => f.renewals.map(r => r.target));
createCalendarRenewalProbeGuard({ targets, db: {} });
const seedDocs = source.fixtures.flatMap(({ purchase, renewals }) => {
  const target = renewals[0].target;
  assert.equal(target.uid.slice(0, -2), source.runId);
  const expected = { uid: target.uid, attemptId: target.uid, customerId: target.customerId, subscriptionId: target.subscriptionId,
    joinedAt: target.joinedAt, createdAt: target.joinedAt, sessionId: target.sessionId, monthlyPriceId: source.priceIds.monthly,
    priceId: 'price_probeUnusedInitial', planId: 'monthly', status: 'complete', policyVersion: 'jst-calendar-v1',
    consentVersion: 'calendar-jst-v1', recurringConsent: true, revoked: false };
  for (const [key, value] of Object.entries(expected)) assert.equal(purchase[key], value);
  assert.match(purchase.paymentIntentId, /^pi_\w+$/);
  return [{ path: `sandboxBillingCustomers/${target.uid}`, data: { customerId: target.customerId } },
    { path: `users/${target.uid}/sandboxBillingPurchases/${target.attemptId}`, data: purchase }];
});
const grantDocs = source.fixtures.flatMap(f => f.renewals.map(({ target, grant }) => {
  for (const [key, value] of Object.entries({ id: target.invoiceId, subscriptionId: target.subscriptionId,
    startsAt: target.startsAt, expiresAt: target.expiresAt, joinedAt: target.joinedAt, priceId: target.monthlyPriceId,
    planId: 'monthly', policyVersion: 'jst-calendar-v1', revoked: false })) assert.equal(grant[key], value);
  assert.match(grant.chargeId, /^ch_\w+$/); assert.match(grant.paymentIntentId, /^pi_\w+$/);
  return { path: `users/${target.uid}/sandboxEntitlements/${target.invoiceId}`, data: grant };
}));
const docs = [...seedDocs, ...grantDocs];
assert.equal(new Set(docs.map(doc => doc.path)).size, 16);
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'package.json'), fnRequire = createRequire(root + 'functions/package.json');
const auth = require('firebase-tools/lib/auth.js');
const token = await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const { Firestore } = fnRequire('@google-cloud/firestore'), { OAuth2Client } = fnRequire('google-auth-library');
const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 45 * 60000 });
const db = new Firestore({ projectId: 'construction2nd', authClient });
try {
  if (seed || verify) {
    const key = execFileSync(root + 'node_modules/.bin/firebase', ['functions:secrets:access', 'STRIPE_SECRET_KEY', '--project', 'construction2nd'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert.ok(key.startsWith('sk_test_'));
    const { default: Stripe } = await import(pathToFileURL(root + 'functions/node_modules/stripe/esm/stripe.esm.node.js'));
    const stripe = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
    const registry = createBillingPriceRegistry({ sandbox: true, prices: {
      calendarInitial: source.priceIds.initial, calendarMonthly: source.priceIds.monthly, calendarPack: source.priceIds.pack,
    } });
    for (const { purchase, renewals } of source.fixtures) {
      const sub = await stripe.subscriptions.retrieve(purchase.subscriptionId);
      assert.equal(sub.livemode, false); assert.equal(sub.status, 'canceled'); assert.equal(sub.customer, purchase.customerId);
      for (const [key, value] of Object.entries({ uid: purchase.uid, attemptId: purchase.attemptId,
        initialPaymentIntentId: purchase.paymentIntentId, joinedAt: String(purchase.joinedAt), policyVersion: 'jst-calendar-v1' })) assert.equal(sub.metadata[key], value);
      for (const { target, grant } of renewals) {
        const invoice = await stripe.invoices.retrieve(target.invoiceId, { expand: ['charge'] });
        const event = await stripe.events.retrieve(target.eventId);
        // 通知の所有関係/保存fixtureも、実Stripe読取値に照合。DBへの書込はまだしない。
        const validationDb = {
          collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [{ id: purchase.uid }] }) }) }) }),
          doc: () => ({ get: async () => ({ data: () => purchase }) }),
        };
        assert.equal(await createCalendarRenewalProbeGuard({ targets, db: validationDb, stripe })(event), true);
        assert.deepEqual(calendarRenewalGrant({ invoice, purchase, registry, sandbox: true }), grant);
      }
    }
    if (!verify) {
      // commit応答喪失時も、今回対象を追跡できる。秘密値/Stripe本文は記録しない。
      writeFileSync(args[2] + '.checkpoint', JSON.stringify({ runId: source.runId, action: 'seed-requested', paths: docs.map(doc => doc.path) }), { mode: 0o600, flag: 'wx' });
      await db.runTransaction(async tx => {
        const snapshots = await Promise.all(docs.map(doc => tx.get(db.doc(doc.path))));
        assert.ok(snapshots.every(snap => !snap.exists), 'fixture-documents-already-exist');
        const owners = await Promise.all(source.fixtures.map(({ purchase }) => tx.get(db.collection('sandboxBillingCustomers').where('customerId', '==', purchase.customerId).limit(1))));
        const markers = await Promise.all(grantDocs.map(({ data }) => tx.get(db.doc(`sandboxBillingRevocations/${data.chargeId}`))));
        assert.ok(owners.every(query => query.empty)); assert.ok(markers.every(snap => !snap.exists));
        for (const doc of seedDocs) tx.set(db.doc(doc.path), doc.data);
      });
    }
  } else {
    const checkpoint = JSON.parse(readFileSync(args[2] + '.checkpoint', 'utf8'));
    assert.equal(checkpoint.runId, source.runId); assert.deepEqual(checkpoint.paths, docs.map(doc => doc.path));
    await db.runTransaction(async tx => {
      const snapshots = await Promise.all(docs.map(doc => tx.get(db.doc(doc.path))));
      snapshots.forEach((snap, index) => { if (snap.exists) {
        for (const [key, value] of Object.entries(docs[index].data)) assert.deepEqual(snap.data()[key], value, 'fixture-document-mismatch');
      } });
      snapshots.forEach((snap, index) => { if (snap.exists) tx.delete(db.doc(docs[index].path)); });
    });
    assert.ok((await Promise.all(docs.map(doc => db.doc(doc.path).get()))).every(snap => !snap.exists));
  }
  console.log(JSON.stringify({ action: verify ? 'stripe-read-only-verified' : seed ? 'seeded' : 'deleted-and-read-back', documents: verify ? 0 : seed ? seedDocs.length : docs.length, stripeMutations: 0 }));
} catch (error) {
  // Stripe本文・秘密値・assertの実値を表示せず、失敗箇所だけ示す。
  const location = error.stack?.split('\n').find(line => line.includes('calendar-renewal-probe-fixture.mjs:'))?.trim();
  console.error(JSON.stringify({ error: 'renewal-fixture-operation-failed', code: error.code || error.type || error.name, location }));
  process.exitCode = 1;
} finally { await db.terminate(); }
