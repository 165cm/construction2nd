import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendarWebhookProbeGuard } from '../calendarWebhookProbeGuard.js';

const runId = '11111111-1111-4111-8111-111111111111';
function fixture() {
  const targets = ['monthly', 'pack'].map((planId, index) => ({
    eventId: `evt_probe_${planId}`, uid: `calendar-integration-${runId}-${planId}`,
    customerId: `cus_probe_${planId}`, attemptId: `${index + 2}2222222-2222-4222-8222-222222222222`,
    planId, paymentIntentId: `pi_probe_${planId}`, sessionId: `cs_probe_${planId}`, joinedAt: 1792766442000 + index * 1000,
  }));
  const purchases = new Map(targets.map(target => [target.uid, { ...target, status: 'complete',
    successEventId: target.eventId, policyVersion: 'jst-calendar-v1' }]));
  const owners = new Map(targets.map(target => [target.customerId, [target.uid]]));
  let reads = 0;
  const db = {
    collection(path) {
      assert.equal(path, 'sandboxBillingCustomers');
      return { where(field, operator, value) {
        assert.equal(field, 'customerId'); assert.equal(operator, '=='); assert.ok(owners.has(value));
        return { limit(count) { assert.equal(count, 2); return { async get() { reads++; return { docs: owners.get(value).map(id => ({ id })) }; } }; } };
      } };
    },
    doc(path) {
      const target = targets.find(item => path === `users/${item.uid}/sandboxBillingPurchases/${item.attemptId}`);
      assert.ok(target, 'unexpected-document');
      return { async get() { reads++; return { data: () => purchases.get(target.uid) }; } };
    },
  };
  const eventFor = target => ({ id: target.eventId, type: 'payment_intent.succeeded', livemode: false,
    created: target.joinedAt / 1000, data: { object: { id: target.paymentIntentId, customer: target.customerId,
      livemode: false, status: 'succeeded', currency: 'jpy', amount_received: target.planId === 'monthly' ? 600 : 980,
      metadata: { uid: target.uid, attemptId: target.attemptId, planId: target.planId, policyVersion: 'jst-calendar-v1' } } } });
  return { targets, purchases, owners, db, eventFor, reads: () => reads };
}

test('未知のEventはDBへ触れずfalseで無視する', async () => {
  const f = fixture();
  const guard = createCalendarWebhookProbeGuard({ targets: f.targets, db: {
    collection: () => assert.fail('unexpected-db-query'), doc: () => assert.fail('unexpected-db-read'),
  } });
  assert.equal(await guard({ ...f.eventFor(f.targets[0]), id: 'evt_unknown' }), false);
  assert.equal(await guard(undefined), false);
});
test('既知Eventでもmetadata/PI/正本日時/金額/環境不一致ならDB照合前に拒否する', async () => {
  const changes = [value => { value.data.object.metadata.uid = 'other-user'; },
    value => { value.data.object.metadata.attemptId = 'other-attempt'; },
    value => { value.data.object.id = 'pi_other'; }, value => { value.created++; },
    value => { value.data.object.amount_received = 480; }, value => { value.livemode = true; }];
  for (const change of changes) {
    const f = fixture(), value = f.eventFor(f.targets[0]); change(value);
    const guard = createCalendarWebhookProbeGuard({ targets: f.targets, db: f.db });
    await assert.rejects(guard(value), /probe-event-mismatch/); assert.equal(f.reads(), 0);
  }
});
test('顧客対応の重複・不在・別UIDは拒否する', async () => {
  for (const mapping of [[], ['other-user'], ['other-user', 'duplicate-user']]) {
    const f = fixture(), target = f.targets[0]; f.owners.set(target.customerId, mapping);
    const guard = createCalendarWebhookProbeGuard({ targets: f.targets, db: f.db });
    await assert.rejects(guard(f.eventFor(target)), /probe-owner-mismatch/); assert.equal(f.reads(), 1);
  }
});
test('保存されたcomplete/予約/成功Event/正本日時がなければ拒否する', async () => {
  const changes = [purchase => { purchase.status = 'paid'; }, purchase => { purchase.attemptId = 'other'; },
    purchase => { purchase.successEventId = 'evt_other'; }, purchase => { purchase.joinedAt++; }];
  for (const change of changes) {
    const f = fixture(), target = f.targets[0]; change(f.purchases.get(target.uid));
    const guard = createCalendarWebhookProbeGuard({ targets: f.targets, db: f.db });
    await assert.rejects(guard(f.eventFor(target)), /probe-completed-purchase-required/);
  }
  const f = fixture(), target = f.targets[0]; f.purchases.delete(target.uid);
  await assert.rejects(createCalendarWebhookProbeGuard({ targets: f.targets, db: f.db })(f.eventFor(target)), /probe-completed-purchase-required/);
});
test('既知の月額/パック2件は唯一所有者と完了正本を確認してtrue', async () => {
  const f = fixture(), guard = createCalendarWebhookProbeGuard({ targets: f.targets, db: f.db });
  for (const target of f.targets) assert.equal(await guard(f.eventFor(target)), true);
  assert.equal(f.reads(), 4);
});
test('重複したEvent・対象外UID・不完全な対象一覧は初期化時に拒否する', () => {
  const f = fixture();
  for (const targets of [[f.targets[0]], [f.targets[0], { ...f.targets[1], eventId: f.targets[0].eventId }],
    [f.targets[0], { ...f.targets[1], uid: 'real-user' }]]) {
    assert.throws(() => createCalendarWebhookProbeGuard({ targets, db: f.db }), /invalid-probe-targets/);
  }
  assert.equal(f.reads(), 0);
});
