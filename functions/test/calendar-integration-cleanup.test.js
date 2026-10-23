import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupCalendarIntegration } from '../../scripts/calendarIntegrationCleanup.mjs';

const POLICY = 'jst-calendar-v1';
const runId = '11111111-1111-4111-8111-111111111111';
const clone = value => value === undefined ? undefined : structuredClone(value);
function fixture(plans = ['monthly', 'pack']) {
  const state = { runId, productId: 'prod_fixture', priceIds: { initial: 'price_initial', monthly: 'price_monthly', pack: 'price_pack' }, users: [] };
  const documents = new Map(), calls = [], reads = [], versions = new Map();
  const customers = new Map(), sessions = new Map(), subs = new Map();
  const prices = new Map(Object.entries(state.priceIds).map(([role, id]) => [id,
    { id, livemode: false, active: true, metadata: { runId, role }, product: state.productId }]));
  const products = new Map([[state.productId, { id: state.productId, livemode: false, active: true, metadata: { runId } }]]);
  const write = (path, value) => { documents.set(path, clone(value)); versions.set(path, (versions.get(path) || 0) + 1); };
  const ref = path => ({ path, async get() { reads.push(path); return { exists: documents.has(path),
    updateTime: versions.get(path) || 0, data: () => clone(documents.get(path)) }; } });
  const db = { doc: ref, batch() {
    const deleted = [];
    return { delete(doc, condition) { deleted.push({ path: doc.path, condition }); }, async commit() {
      for (const { path, condition } of deleted) if (condition) assert.equal(condition.lastUpdateTime, versions.get(path));
      calls.push(['batch-delete', deleted.map(value => value.path)]);
      for (const { path } of deleted) documents.delete(path);
    } };
  } };
  const stripe = {
    pageSize: 100,
    customers: {
      retrieve: async id => clone(customers.get(id)),
      async del(id) { calls.push(['customer-delete', id]); customers.set(id, { id, deleted: true }); return { id, deleted: true }; },
    },
    checkout: { sessions: {
      retrieve: async id => clone(sessions.get(id)),
      async expire(id) { calls.push(['session-expire', id]); sessions.get(id).status = 'expired'; return clone(sessions.get(id)); },
    } },
    subscriptions: {
      async list({ customer, starting_after }) {
        const rows = [...subs.values()].filter(value => value.customer === customer);
        const offset = starting_after ? rows.findIndex(value => value.id === starting_after) + 1 : 0;
        const data = rows.slice(offset, offset + stripe.pageSize);
        return { data: clone(data), has_more: offset + data.length < rows.length };
      },
      retrieve: async id => clone(subs.get(id)),
      async cancel(id, params) { calls.push(['subscription-cancel', id, params]); subs.get(id).status = 'canceled'; return clone(subs.get(id)); },
    },
    prices: {
      retrieve: async id => clone(prices.get(id)),
      async update(id, patch) { calls.push(['price-update', id, patch]); Object.assign(prices.get(id), patch); return clone(prices.get(id)); },
    },
    products: {
      retrieve: async id => clone(products.get(id)),
      async update(id, patch) { calls.push(['product-update', id, patch]); Object.assign(products.get(id), patch); return clone(products.get(id)); },
    },
  };
  const userPaths = user => ({ customer: `sandboxBillingCustomers/${user.uid}`,
    purchase: `users/${user.uid}/sandboxBillingPurchases/${user.attemptId}`,
    grant: `users/${user.uid}/sandboxEntitlements/${user.sessionId}` });
  for (const planId of plans) {
    const user = { uid: `calendar-integration-${runId}-${planId}`, planId, customerId: `cus_${planId}`,
      sessionId: `cs_${planId}`, attemptId: `attempt-${planId}` };
    state.users.push(user);
    const priceId = state.priceIds[planId === 'monthly' ? 'initial' : 'pack'];
    const purchase = { ...user, priceId, policyVersion: POLICY, paymentIntentId: `pi_${planId}`, chargeId: `ch_${planId}`,
      initialGrantId: user.sessionId, joinedAt: 123000, ...(planId === 'monthly' ? { monthlyPriceId: state.priceIds.monthly } : {}) };
    const p = userPaths(user);
    write(p.customer, { customerId: user.customerId, pending: { attemptId: user.attemptId, planId, priceId, policyVersion: POLICY,
      ...(planId === 'monthly' ? { monthlyPriceId: state.priceIds.monthly } : {}) } });
    write(p.purchase, purchase);
    write(p.grant, { id: user.sessionId, planId, priceId, policyVersion: POLICY,
      paymentIntentId: purchase.paymentIntentId, chargeId: purchase.chargeId, joinedAt: purchase.joinedAt });
    customers.set(user.customerId, { id: user.customerId, livemode: false, metadata: { uid: user.uid } });
    sessions.set(user.sessionId, { id: user.sessionId, customer: user.customerId, livemode: false, mode: 'payment',
      metadata: { uid: user.uid, attemptId: user.attemptId, planId, policyVersion: POLICY }, client_reference_id: user.uid,
      payment_intent: purchase.paymentIntentId, status: 'complete', payment_status: 'paid',
      line_items: { has_more: false, data: [{ quantity: 1, price: { id: priceId } }] } });
    if (planId === 'monthly') subs.set('sub_monthly', { id: 'sub_monthly', customer: user.customerId, livemode: false, status: 'active',
      metadata: { uid: user.uid, attemptId: user.attemptId, policyVersion: POLICY, initialPaymentIntentId: purchase.paymentIntentId },
      items: { has_more: false, data: [{ quantity: 1, price: { id: state.priceIds.monthly } }] } });
  }
  return { stripe, db, state, documents, calls, reads, customers, sessions, subs, prices, products, write, userPaths };
}

test('今回のtest契約取消/顧客削除/価格商品無効化とmanifest3文書だけを照合・後片付け', async () => {
  const f = fixture();
  const uid = f.state.users[0].uid;
  for (const path of [`users/${uid}/learning/backup`, `users/${uid}/sandboxEntitlements/in_keep`, 'sandboxBillingRevocations/ch_keep', 'billingCustomers/existing']) f.write(path, { keep: true });
  const result = await cleanupCalendarIntegration(f);
  assert.deepEqual(result, { errors: [], canceledSubscriptions: 1, expiredSessions: 0, deletedCustomers: 2,
    deactivatedPrices: 3, deactivatedProducts: 1, deletedDocuments: 6 });
  assert.equal(f.documents.size, 4);
  assert.ok([...f.documents.values()].every(value => value.keep));
  assert.deepEqual(f.calls.find(value => value[0] === 'subscription-cancel').slice(1), ['sub_monthly', { invoice_now: false, prorate: false }]);
  assert.ok(f.reads.every(path => path.startsWith('sandboxBillingCustomers/') || /\/sandboxBillingPurchases\/|\/sandboxEntitlements\/cs_/.test(path)));
});

test('未知runId/UID/重複UIDは外部読取・操作より先に拒否', async () => {
  for (const change of [f => f.state.runId = 'existing', f => f.state.users[0].uid = 'existing-user', f => f.state.users.push({ ...f.state.users[0] })]) {
    const f = fixture(); change(f);
    await assert.rejects(cleanupCalendarIntegration(f), /invalid-cleanup/);
    assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 0);
  }
});

test('DB不一致のUIDはStripe変更も文書削除も保留し、別の安全なUIDは継続', async () => {
  const f = fixture(); const user = f.state.users[0];
  f.documents.get(f.userPaths(user).purchase).customerId = 'cus_existing';
  const result = await cleanupCalendarIntegration(f);
  assert.equal(result.errors[0].code, 'purchase-document-mismatch');
  assert.equal(result.deletedCustomers, 1); assert.equal(result.deletedDocuments, 3);
  assert.ok(f.documents.has(f.userPaths(user).customer));
  assert.equal(f.calls.some(call => call[1] === 'cus_monthly' || call[0] === 'subscription-cancel'), false);
});

test('live/別UID/別PI/別PriceのStripe正本は操作せず記録する', async () => {
  const changes = [f => f.customers.get('cus_monthly').livemode = true,
    f => f.customers.get('cus_monthly').metadata.uid = 'other',
    f => f.sessions.get('cs_monthly').metadata.attemptId = 'other',
    f => f.sessions.get('cs_monthly').payment_intent = null,
    f => f.sessions.get('cs_monthly').line_items.data[0].price.id = 'price_other',
    f => f.subs.get('sub_monthly').metadata.initialPaymentIntentId = 'pi_other',
    f => f.subs.get('sub_monthly').items.data[0].price.id = 'price_other'];
  for (const change of changes) {
    const f = fixture(['monthly']); change(f);
    const result = await cleanupCalendarIntegration(f);
    assert.equal(result.errors.filter(value => value.type === 'user').length, 1);
    assert.equal(result.deletedCustomers, 0); assert.equal(result.deletedDocuments, 0);
    assert.equal(result.canceledSubscriptions, 0); assert.equal(result.expiredSessions, 0);
    assert.equal(f.documents.size, 3);
  }
});

test('全ページの契約を検証してから取消し、2ページ目の別契約があれば顧客も残す', async () => {
  const f = fixture(['monthly']); f.stripe.pageSize = 1;
  f.subs.set('sub_existing', { ...clone(f.subs.get('sub_monthly')), id: 'sub_existing', metadata: { uid: 'other' } });
  const result = await cleanupCalendarIntegration(f);
  assert.equal(result.errors[0].code, 'subscription-ownership-mismatch');
  assert.equal(result.canceledSubscriptions, 0); assert.equal(result.deletedCustomers, 0);
});

test('今回のopen/unpaid Checkoutだけ失効し、完了済みCheckoutは操作しない', async () => {
  const f = fixture(['pack']); Object.assign(f.sessions.get('cs_pack'), { status: 'open', payment_status: 'unpaid' });
  const result = await cleanupCalendarIntegration(f);
  assert.equal(result.errors.length, 0); assert.equal(result.expiredSessions, 1);
  assert.equal(f.calls.filter(value => value[0] === 'session-expire')[0][1], 'cs_pack');
});

test('部分作成なら記録済み・所有確認済みの項目だけ処理、既に削除済みの再実行も安全', async () => {
  const f = fixture(['monthly']); const user = f.state.users[0];
  f.subs.clear(); f.sessions.clear(); f.documents.clear();
  delete user.attemptId; delete user.sessionId;
  const result = await cleanupCalendarIntegration(f);
  assert.equal(result.errors.length, 0); assert.equal(result.deletedCustomers, 1); assert.equal(result.deletedDocuments, 0);
  const again = await cleanupCalendarIntegration(f);
  assert.equal(again.errors.length, 0); assert.equal(again.deletedCustomers, 0);
  assert.equal(again.deactivatedPrices, 0); assert.equal(again.deactivatedProducts, 0);
});

test('取消/顧客削除等の例外は機密詳細を出さず、他の安全な対象の後片付けを継続', async () => {
  const f = fixture();
  f.stripe.subscriptions.cancel = async () => { throw Object.assign(new Error('sk_test_secret_and_private_email'), { code: 'sk_test_secret' }); };
  const result = await cleanupCalendarIntegration(f);
  assert.deepEqual(result.errors, [{ type: 'user', id: f.state.users[0].uid, code: 'cleanup-failed' }]);
  assert.equal(result.deletedCustomers, 1); assert.equal(result.deletedDocuments, 3); assert.equal(result.deactivatedPrices, 3);
  assert.doesNotMatch(JSON.stringify(result), /sk_test|private_email/);
});

test('別runの商品/Priceや別productとの不一致は無効化せずエラーを残す', async () => {
  for (const change of [f => f.products.get('prod_fixture').metadata.runId = 'other',
    f => f.prices.get('price_initial').livemode = true,
    f => f.prices.get('price_initial').product = 'prod_other',
    f => f.prices.get('price_initial').metadata.runId = 'other']) {
    const f = fixture([]); change(f);
    const result = await cleanupCalendarIntegration(f);
    assert.ok(result.errors.length);
    assert.equal(f.calls.some(call => call[0] === 'price-update' && call[1] === 'price_initial'), false);
  }
});

test('顧客削除の成功応答だけで完了扱いしない。文書は残し、他の対象を継続', async () => {
  const f = fixture(['pack']);
  f.stripe.customers.del = async id => ({ id, deleted: true }); // 読取でdeletedが確認できない故障
  const result = await cleanupCalendarIntegration(f);
  assert.equal(result.errors[0].code, 'customer-delete-unconfirmed');
  assert.equal(result.deletedCustomers, 0); assert.equal(result.deletedDocuments, 0);
  assert.equal(f.documents.size, 3); assert.equal(result.deactivatedProducts, 1);
});
