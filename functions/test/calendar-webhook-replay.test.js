import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// 実index.jsのstripeWebhookを通す（onRequestには.runがないため直接呼ぶ）。
// 署名判定・Stripe・DBはローカルの模擬応答。
// 実署名検証、Firestore transactionの競合、実通知の配送を検証するテストではない。
test('旧パックの実通知ハンドラーは保存済み期限を保ち、返金先着や再送で復活させない', async () => {
  const uid = 'webhook-replay-fixture';
  const customerId = 'cus_replay_fixture';
  const sessionId = 'cs_replay_fixture';
  const chargeId = 'ch_replay_fixture';
  const customerPath = `sandboxBillingCustomers/${uid}`;
  const grantPath = `users/${uid}/sandboxEntitlements/${sessionId}`;
  const markerPath = `sandboxBillingRevocations/${chargeId}`;
  const documents = new Map([[customerPath, { customerId }]]);
  const clone = value => value === undefined ? undefined : structuredClone(value);
  const snapshot = path => ({ exists: documents.has(path), data: () => clone(documents.get(path)) });
  const write = (path, value, options) => documents.set(path, options?.merge
    ? { ...documents.get(path), ...clone(value) } : clone(value));
  const ref = path => ({ path, set: async (value, options) => write(path, value, options) });
  function collection(path) {
    return {
      doc: id => ref(`${path}/${id}`),
      where(field, operator, value) {
        assert.equal(operator, '==');
        const query = {
          limit: () => query,
          async get() {
            const docs = [...documents].filter(([key, data]) => key.startsWith(`${path}/`)
              && !key.slice(path.length + 1).includes('/') && data[field] === value)
              .map(([key, data]) => ({ id: key.split('/').at(-1), ref: ref(key), data: () => clone(data) }));
            return { empty: docs.length === 0, docs };
          },
        };
        return query;
      },
    };
  }
  let transactions = 0;
  const db = {
    doc: ref, collection,
    async runTransaction(callback) {
      const staged = [];
      await callback({ get: async reference => snapshot(reference.path),
        set: (reference, value, options) => staged.push([reference.path, value, options]) });
      staged.forEach(args => write(...args));
      transactions += 1;
    },
    batch() {
      const staged = [];
      return { update: (reference, value) => staged.push([reference.path, value, { merge: true }]),
        commit: async () => staged.forEach(args => write(...args)) };
    },
  };
  const charge = { id: chargeId, customer: customerId, paid: true, captured: true,
    currency: 'jpy', amount: 980, created: Date.parse('2026-01-31T12:00:00+09:00') / 1000,
    amount_refunded: 0, disputed: false };
  const session = { id: sessionId, mode: 'payment', customer: customerId, client_reference_id: uid,
    payment_status: 'paid', amount_total: 980, currency: 'jpy',
    line_items: { data: [{ price: { id: 'price_replay_fixture' }, quantity: 1 }], has_more: false },
    payment_intent: { latest_charge: charge } };
  let stripeReads = 0;
  class FixtureStripe {
    constructor(key) { assert.equal(key, 'sk_test_local_replay_fixture'); }
    webhooks = { constructEvent(rawBody, signature, secret) {
      assert.equal(signature, 'mock-signature-not-cryptographic');
      assert.equal(secret, 'whsec_local_replay_fixture');
      return JSON.parse(rawBody.toString());
    } };
    checkout = { sessions: { retrieve: async id => {
      assert.equal(id, sessionId); stripeReads += 1; return clone(session);
    } } };
    charges = { retrieve: async id => {
      assert.equal(id, chargeId); stripeReads += 1; return clone(charge);
    } };
  }
  const values = { STRIPE_SECRET_KEY: 'sk_test_local_replay_fixture',
    STRIPE_WEBHOOK_SECRET: 'whsec_local_replay_fixture', STRIPE_PACK_PRICE_ID: 'price_replay_fixture',
    BILLING_SANDBOX: true, BILLING_TESTER_UIDS: uid };
  const stateName = '__calendarWebhookReplayFixture';
  assert.equal(Object.hasOwn(globalThis, stateName), false);
  globalThis[stateName] = { db, FixtureStripe, values };
  const source = code => ({ url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true });
  const entry = new URL('../index.js', import.meta.url).href;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network forbidden in local webhook replay test'); };
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'firebase-admin/app' && context.parentURL === entry) return source('export const initializeApp=()=>({});');
    if (specifier === 'firebase-admin/firestore') return source(`export const getFirestore=()=>globalThis.${stateName}.db;`);
    if (specifier === 'firebase-admin/auth') return source('export const getAuth=()=>{throw Error("Auth forbidden in fixture")};');
    if (specifier === 'firebase-functions/params') return source(`
      const define=(name,options={})=>({value:()=>globalThis.${stateName}.values[name]??options.default});
      export const defineString=define,defineBoolean=define,defineSecret=define;`);
    if (specifier === 'stripe' && context.parentURL === entry) return source(`export default globalThis.${stateName}.FixtureStripe;`);
    return next(specifier, context);
  } });
  try {
    const { stripeWebhook } = await import(entry);
    assert.equal(typeof stripeWebhook, 'function');
    async function notify(type = 'checkout.session.completed') {
      const event = { id: `evt_local_replay_${type.replaceAll('.', '_')}`, type, livemode: false,
        data: { object: { id: type === 'charge.refunded' ? chargeId : sessionId } } };
      const response = { code: null, body: null, set() { return this; },
        status(code) { this.code = code; return this; }, send(body) { this.body = body; return this; },
        sendStatus(code) { this.code = code; return this; } };
      await stripeWebhook({ method: 'POST', rawBody: Buffer.from(JSON.stringify(event)),
        headers: { 'stripe-signature': 'mock-signature-not-cryptographic' } }, response);
      assert.equal(response.code, 200);
      assert.equal(response.body, 'ok');
    }
    // 元の期限は新しい計算結果と意図的に違わせ、古い保存情報全体の維持を検査する。
    const original = { id: sessionId, planId: 'pack', chargeId, startsAt: 1234000, expiresAt: 5678000,
      revoked: false, operatorNote: { reason: 'legacy fixture adjustment' }, originalField: 'keep' };
    documents.set(grantPath, clone(original));
    await notify();
    await notify('checkout.session.async_payment_succeeded');
    assert.deepEqual(documents.get(grantPath), original);
    assert.equal(Object.hasOwn(documents.get(grantPath), 'policyVersion'), false);

    // 支払完了より先に失効マーカーがあり、保存済み権利だけがまだ未失効の状態。
    documents.set(markerPath, { revoked: true });
    await notify();
    assert.deepEqual(documents.get(grantPath), { ...original, revoked: true });
    await notify();
    assert.deepEqual(documents.get(grantPath), { ...original, revoked: true });

    // 権利文書そのものが未作成でも、先着した返金マーカーを反映して作成する。
    documents.delete(grantPath);
    await notify();
    const revokedGrant = clone(documents.get(grantPath));
    assert.equal(revokedGrant.revoked, true);
    await notify();
    assert.deepEqual(documents.get(grantPath), revokedGrant);

    // 実ハンドラーの返金経路も通し、後の古い支払成功通知で失効が戻らないことを確認。
    documents.delete(markerPath);
    documents.set(grantPath, clone(original));
    charge.amount_refunded = 1;
    await notify('charge.refunded');
    assert.equal(documents.get(markerPath).revoked, true);
    assert.deepEqual(documents.get(grantPath), { ...original, revoked: true });
    charge.amount_refunded = 0;
    await notify();
    assert.deepEqual(documents.get(grantPath), { ...original, revoked: true });
    assert.equal(stripeReads, 8);
    assert.equal(transactions, 7);
  } finally {
    hooks.deregister();
    globalThis.fetch = savedFetch;
    delete globalThis[stateName];
  }
});
