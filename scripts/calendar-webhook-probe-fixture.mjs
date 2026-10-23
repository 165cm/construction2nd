// 承認済みの専用完了fixture6文書だけを一時保存/削除。Stripe操作は読取のみ。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCalendarWebhookProbeGuard } from '../functions/calendarWebhookProbeGuard.js';
import { createBillingPriceRegistry } from '../functions/billingPriceRegistry.js';
import { calendarInitialGrant } from '../functions/calendarPaymentEvidence.js';

const args = process.argv.slice(2);
const seed = args.length === 3 && args[0] === '--seed-probe-fixture' && args[1] === '--fixture';
const cleanup = args.length === 4 && args[0] === '--cleanup-probe-fixture' && args[1] === '--fixture' && args[3] === '--receiver-stopped';
if (!seed && !cleanup) { console.log('未実行。承認後のみ --seed-probe-fixture --fixture <専用fixture.json>。削除は --cleanup-probe-fixture --fixture <同ファイル> --receiver-stopped。'); process.exit(args.length ? 1 : 0); }
assert.match(args[2], /^\/tmp\/calendar-webhook-probe-[0-9a-f-]+\/fixture\.json$/i);
const source = JSON.parse(readFileSync(args[2], 'utf8'));
assert.match(source.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.ok(args[2].includes('/calendar-webhook-probe-' + source.runId + '/'));
createCalendarWebhookProbeGuard({ targets: source.fixtures.map(item => item.target), db: {} });
const docs = source.fixtures.flatMap(({ target, purchase, grant }) => {
  assert.equal(target.uid, `calendar-integration-${source.runId}-${target.planId}`);
  for (const [key, value] of Object.entries({ uid: target.uid, customerId: target.customerId, attemptId: target.attemptId,
    planId: target.planId, sessionId: target.sessionId, paymentIntentId: target.paymentIntentId, joinedAt: target.joinedAt,
    successEventId: target.eventId, status: 'complete', policyVersion: 'jst-calendar-v1' })) assert.equal(purchase[key], value);
  assert.equal(grant.id, target.sessionId); assert.equal(grant.chargeId, purchase.chargeId); assert.equal(grant.revoked, false);
  assert.match(grant.chargeId, /^ch_\w+$/);
  assert.equal(grant.priceId, source.priceIds[target.planId === 'monthly' ? 'initial' : 'pack']);
  return [{ path: `sandboxBillingCustomers/${target.uid}`, data: { customerId: target.customerId } },
    { path: `users/${target.uid}/sandboxBillingPurchases/${target.attemptId}`, data: purchase },
    { path: `users/${target.uid}/sandboxEntitlements/${target.sessionId}`, data: grant }];
});
assert.equal(new Set(docs.map(doc => doc.path)).size, 6);
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'package.json'), fnRequire = createRequire(root + 'functions/package.json');
const auth = require('firebase-tools/lib/auth.js');
const token = await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const { Firestore } = fnRequire('@google-cloud/firestore'), { OAuth2Client } = fnRequire('google-auth-library');
const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 45 * 60000 });
const db = new Firestore({ projectId: 'construction2nd', authClient });
try {
  if (seed) {
    const key = execFileSync(root + 'node_modules/.bin/firebase', ['functions:secrets:access', 'STRIPE_SECRET_KEY', '--project', 'construction2nd'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    assert.ok(key.startsWith('sk_test_'));
    const { default: Stripe } = await import(pathToFileURL(root + 'functions/node_modules/stripe/esm/stripe.esm.node.js'));
    const stripe = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
    const registry = createBillingPriceRegistry({ sandbox: true, prices: {
      calendarInitial: source.priceIds.initial, calendarMonthly: source.priceIds.monthly, calendarPack: source.priceIds.pack,
    } });
    for (const { target, purchase, grant } of source.fixtures) {
      const session = await stripe.checkout.sessions.retrieve(target.sessionId, { expand: ['line_items', 'payment_intent.latest_charge'] });
      const event = await stripe.events.retrieve(target.eventId);
      assert.deepEqual(calendarInitialGrant({ session, successEvents: [event], purchase, registry, sandbox: true }), grant);
      if (target.planId === 'monthly') {
        const sub = await stripe.subscriptions.retrieve(purchase.subscriptionId);
        assert.equal(sub.livemode, false); assert.equal(sub.status, 'canceled'); assert.equal(sub.customer, target.customerId);
        assert.equal(sub.metadata.uid, target.uid); assert.equal(sub.metadata.initialPaymentIntentId, target.paymentIntentId);
      }
    }
    // commit応答喪失時も、今回対象を追跡できる。秘密値/Stripe本文は記録しない。
    writeFileSync(args[2] + '.checkpoint', JSON.stringify({ runId: source.runId, action: 'seed-requested', paths: docs.map(doc => doc.path) }), { mode: 0o600, flag: 'wx' });
    await db.runTransaction(async tx => {
      const snapshots = await Promise.all(docs.map(doc => tx.get(db.doc(doc.path))));
      assert.ok(snapshots.every(snap => !snap.exists), 'fixture-documents-already-exist');
      const owners = await Promise.all(source.fixtures.map(({ target }) => tx.get(db.collection('sandboxBillingCustomers').where('customerId', '==', target.customerId).limit(1))));
      const markers = await Promise.all(source.fixtures.map(({ grant }) => tx.get(db.doc(`sandboxBillingRevocations/${grant.chargeId}`))));
      assert.ok(owners.every(query => query.empty)); assert.ok(markers.every(snap => !snap.exists));
      for (const doc of docs) tx.set(db.doc(doc.path), doc.data);
    });
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
  console.log(JSON.stringify({ action: seed ? 'seeded' : 'deleted-and-read-back', documents: docs.length, stripeMutations: 0 }));
} catch {
  console.error('probe-fixture-operation-failed; retain checkpoint and inspect dedicated documents'); process.exitCode = 1;
} finally { await db.terminate(); }
