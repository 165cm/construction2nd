import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarPurchaseStore } from '../calendarPurchaseStore.js';
import { CALENDAR_POLICY_VERSION } from '../calendarBillingPolicy.js';
import { fakeDatabase } from './helpers/fakeCalendarDatabase.js';

// Firestoreの読取後書込・競合時再実行を模擬。実Firestore/Stripeには接続しない。

const paths = uid => ({ customers: 'sandboxBillingCustomers', revocations: 'sandboxBillingRevocations',
  grants: `users/${uid}/sandboxEntitlements`, purchases: `users/${uid}/sandboxBillingPurchases` });
function fixture(planId = 'monthly') {
  const db = fakeDatabase();
  const store = createCalendarPurchaseStore({ db, paths });
  const purchase = { uid: 'fixture-user', attemptId: 'attempt-one', customerId: 'cus_fixture', planId,
    priceId: planId === 'monthly' ? 'price_initial' : 'price_pack',
    ...(planId === 'monthly' ? { monthlyPriceId: 'price_month' } : {}),
    policyVersion: CALENDAR_POLICY_VERSION, consentVersion: 'calendar-jst-v1', recurringConsent: planId === 'monthly', createdAt: 1000 };
  const grant = { id: 'cs_fixture', planId, chargeId: 'ch_fixture', paymentIntentId: 'pi_fixture',
    startsAt: 2000, expiresAt: 1000000, joinedAt: 2000, successEventId: 'evt_fixture',
    policyVersion: CALENDAR_POLICY_VERSION, priceId: purchase.priceId, revoked: false };
  const gpath = `${paths(purchase.uid).grants}/${grant.id}`;
  const ppath = `${paths(purchase.uid).purchases}/${purchase.attemptId}`;
  const marker = `${paths(purchase.uid).revocations}/${grant.chargeId}`;
  async function paid() {
    await store.register(purchase);
    const bound = await store.bindSession(purchase.uid, purchase.attemptId, grant.id);
    return store.recordInitial(bound, grant, planId === 'monthly' ? 'pm_fixture' : null);
  }
  return { db, store, purchase, grant, gpath, ppath, marker, paid };
}

test('予約は不変項目が一致した場合だけ再利用し、入力のstatus/leaseを保存しない', async () => {
  const f = fixture();
  assert.equal(await f.store.get(f.purchase.uid, f.purchase.attemptId), null);
  const reserved = await f.store.register({ ...f.purchase, status: 'complete', lease: { token: 'injected' } });
  assert.equal(reserved.status, 'reserved'); assert.equal(reserved.lease, undefined);
  assert.deepEqual(await f.store.register(f.purchase), reserved);
  for (const patch of [{ customerId: 'cus_other' }, { priceId: 'price_other' }, { createdAt: 1001 },
    { monthlyPriceId: 'price_other' }, { consentVersion: 'other' }, { recurringConsent: false }]) {
    await assert.rejects(f.store.register({ ...f.purchase, ...patch }));
  }
  const bound = await f.store.bindSession(f.purchase.uid, f.purchase.attemptId, 'cs_fixture');
  assert.equal(bound.status, 'checkout');
  assert.deepEqual(await f.store.bindSession(f.purchase.uid, f.purchase.attemptId, 'cs_fixture'), bound);
  await assert.rejects(f.store.bindSession(f.purchase.uid, f.purchase.attemptId, 'cs_other'), /session/);
});

test('初回証拠と利用権を同時保存し、再送の charge/時刻/PI/成功event/カード変更を拒否', async () => {
  const f = fixture(); const paid = await f.paid();
  assert.equal(paid.status, 'paid'); assert.equal(paid.joinedAt, f.grant.joinedAt);
  assert.equal(paid.expiresAt, f.grant.expiresAt, 'Checkout予約期限ではなく初回利用終了を保存');
  assert.equal(paid.initialGrantId, f.grant.id); assert.equal(paid.paymentMethodId, 'pm_fixture');
  assert.deepEqual(await f.store.recordInitial(paid, f.grant, 'pm_fixture'), paid);
  for (const patch of [{ chargeId: 'ch_other' }, { joinedAt: 3000, startsAt: 3000 }, { expiresAt: 2000000 },
    { paymentIntentId: 'pi_other' }, { successEventId: 'evt_other' }, { priceId: 'price_other' }]) {
    await assert.rejects(f.store.recordInitial(paid, { ...f.grant, ...patch }, 'pm_fixture'));
  }
  await assert.rejects(f.store.recordInitial(paid, f.grant, 'pm_other'));
  assert.deepEqual(f.db.documents.get(f.gpath), f.grant);
  assert.deepEqual(f.db.documents.get(f.ppath), paid);
  assert.equal(typeof f.db.documents.get(`sandboxBillingCustomers/${paid.uid}`).updatedAt, 'number');
});

test('返金先着でも初回証拠を失わず失効保存、契約作成を止める。パックは初回でcomplete', async () => {
  const f = fixture(); f.db.write(f.marker, { revoked: true });
  const paid = await f.paid(); assert.equal(paid.revoked, true);
  assert.equal(f.db.documents.get(f.gpath).revoked, true);
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000)).action, 'review');
  const pack = fixture('pack'); assert.equal((await pack.paid()).status, 'complete');
});

test('8並列claimで作業権は1件、lease失効後もfirstAttemptAtを維持し古いworkerを拒否', async () => {
  const f = fixture(); const paid = await f.paid();
  const claims = await Promise.all(Array.from({ length: 8 }, (_, index) => f.store.claim(paid.uid, paid.attemptId, `worker-${index}`, 3000)));
  assert.equal(claims.filter(result => result.action === 'claimed').length, 1);
  assert.equal(claims.filter(result => result.action === 'busy').length, 7);
  const firstToken = claims.find(result => result.action === 'claimed').purchase.lease.token;
  const retry = await f.store.claim(paid.uid, paid.attemptId, 'new-worker', 303000);
  assert.equal(retry.action, 'claimed'); assert.equal(retry.purchase.firstAttemptAt, 3000);
  assert.equal((await f.store.finish(paid.uid, paid.attemptId, firstToken, 'sub_old')).action, 'stale');
  await f.store.release(paid.uid, paid.attemptId, firstToken, true);
  assert.equal((await f.store.get(paid.uid, paid.attemptId)).lease.token, 'new-worker');
  const finished = await f.store.finish(paid.uid, paid.attemptId, 'new-worker', 'sub_fixture');
  assert.equal(finished.action, 'complete'); assert.equal(finished.purchase.lease, undefined);
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'third', 400000)).action, 'done');
});

test('finish確定と返金markerが競合すると再読取しstop_required、取消確認後review', async () => {
  const f = fixture(); const paid = await f.paid();
  await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000);
  f.db.beforeCommit = () => f.db.write(f.marker, { revoked: true });
  const result = await f.store.finish(paid.uid, paid.attemptId, 'worker', 'sub_fixture');
  assert.equal(result.action, 'revoked'); assert.equal(result.purchase.status, 'stop_required');
  assert.equal(result.purchase.subscriptionId, 'sub_fixture');
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'other', 4000)).action, 'stop');
  await assert.rejects(f.store.markStopped(paid.uid, paid.attemptId, 'sub_other'));
  const stopped = await f.store.markStopped(paid.uid, paid.attemptId, 'sub_fixture');
  assert.equal(stopped.stopped, true); assert.equal(stopped.status, 'review');
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'other', 4000)).action, 'review');
});

test('正常complete後の返金再送は失効保存だけ。後日返金で契約取消状態へ変更しない', async () => {
  const f = fixture(); const paid = await f.paid();
  await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000);
  await f.store.finish(paid.uid, paid.attemptId, 'worker', 'sub_fixture');
  f.db.write(f.marker, { revoked: true });
  const replay = await f.store.recordInitial(paid, f.grant, 'pm_fixture');
  assert.equal(replay.status, 'complete'); assert.equal(replay.revoked, true);
  assert.equal(replay.subscriptionId, 'sub_fixture');
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'another', 4000)).action, 'done');
});

test('新規契約の境界不一致はstop指定で補償取消待ちとし、支払済み権利を返金扱いしない', async () => {
  const f = fixture(); const paid = await f.paid();
  await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000);
  const result = await f.store.finish(paid.uid, paid.attemptId, 'worker', 'sub_wrong_boundary', { stop: true });
  assert.equal(result.action, 'revoked'); assert.equal(result.purchase.status, 'stop_required');
  assert.equal(result.purchase.subscriptionId, 'sub_wrong_boundary'); assert.equal(result.purchase.lease, undefined);
  assert.equal(result.purchase.revoked, false); assert.deepEqual(f.db.documents.get(f.gpath), f.grant);
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'another', 4000)).action, 'stop');
  const stopped = await f.store.markStopped(paid.uid, paid.attemptId, 'sub_wrong_boundary');
  assert.equal(stopped.status, 'review'); assert.equal(stopped.stopped, true);
});

test('releaseは同じtokenのみ。時刻を消さずpaid復帰、reviewは再作成不可', async () => {
  const f = fixture(); const paid = await f.paid();
  await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000);
  const released = await f.store.release(paid.uid, paid.attemptId, 'worker');
  assert.equal(released.status, 'paid'); assert.equal(released.lease, undefined); assert.equal(released.firstAttemptAt, 3000);
  await f.store.claim(paid.uid, paid.attemptId, 'next', 5000);
  const review = await f.store.release(paid.uid, paid.attemptId, 'next', true);
  assert.equal(review.status, 'review'); assert.equal(review.firstAttemptAt, 3000);
  assert.equal((await f.store.claim(paid.uid, paid.attemptId, 'third', 6000)).action, 'review');
});

test('更新は保存済み契約/版/Priceへ限定し、再送で期限維持・返金先着で失効', async () => {
  const f = fixture(); const paid = await f.paid();
  await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000);
  const { purchase } = await f.store.finish(paid.uid, paid.attemptId, 'worker', 'sub_fixture');
  const renewal = { ...f.grant, id: 'in_renewal', chargeId: 'ch_renewal', paymentIntentId: 'pi_renewal',
    subscriptionId: 'sub_fixture', priceId: 'price_month', startsAt: 1000000, expiresAt: 2000000 };
  const saved = await f.store.saveRenewal(purchase, renewal);
  assert.deepEqual(await f.store.saveRenewal(purchase, { ...renewal, expiresAt: 3000000 }), saved);
  for (const patch of [{ subscriptionId: 'sub_other' }, { policyVersion: 'old' }, { priceId: 'price_other' }, { joinedAt: 5000 }]) {
    await assert.rejects(f.store.saveRenewal(purchase, { ...renewal, ...patch }), /renewal/);
  }
  f.db.write('sandboxBillingRevocations/ch_renewal', { revoked: true });
  assert.equal((await f.store.saveRenewal(purchase, renewal)).revoked, true);
  assert.equal((await f.store.get(paid.uid, paid.attemptId)).status, 'complete');
});

test('契約検索は同UID内のみ、重複正本は拒否。誤UID固定pathsと文書パス改変も拒否', async () => {
  const f = fixture(); const paid = await f.paid();
  assert.equal(await f.store.findBySubscription(paid.uid, 'sub_fixture'), null);
  await f.store.claim(paid.uid, paid.attemptId, 'worker', 3000);
  const done = await f.store.finish(paid.uid, paid.attemptId, 'worker', 'sub_fixture');
  assert.deepEqual(await f.store.findBySubscription(paid.uid, 'sub_fixture'), done.purchase);
  assert.equal(await f.store.findBySubscription('other-user', 'sub_fixture'), null);
  f.db.write(`${paths(paid.uid).purchases}/attempt-two`, { ...done.purchase, attemptId: 'attempt-two' });
  await assert.rejects(f.store.findBySubscription(paid.uid, 'sub_fixture'), /ambiguous/);
  const fixed = createCalendarPurchaseStore({ db: f.db, paths: paths(paid.uid) });
  await assert.rejects(fixed.get('other-user', 'attempt-one'), /paths/);
  await assert.rejects(f.store.get(paid.uid, '../other'), /reference/);
});
