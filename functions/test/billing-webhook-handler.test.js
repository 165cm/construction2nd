import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createBillingWebhookHandler } from '../billingWebhookHandler.js';

// 実SDKの署名生成/検証を使うローカル試験。Stripe通信は行わない。
const stripe = new Stripe('sk_test_local_handler_fixture');
const secret = 'whsec_local_handler_fixture';
const event = (changes = {}) => ({ id: 'evt_local_handler', type: 'payment_intent.succeeded', livemode: false,
  created: Math.floor(Date.now() / 1000), data: { object: { id: 'pi_local_handler', private: 'never-log-private-value' } }, ...changes });
function request(value = event(), signingSecret = secret) {
  const payload = JSON.stringify(value);
  return { method: 'POST', rawBody: Buffer.from(payload), headers: {
    'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: signingSecret }),
  } };
}
function response() {
  return { code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.code = code; return this; }, send(value) { this.body = value; return this; },
    sendStatus(code) { this.code = code; return this; } };
}
const handler = options => createBillingWebhookHandler({ stripeClient: () => stripe, webhookSecret: () => secret,
  sandbox: () => true, processEvent: () => assert.fail('unexpected-processing'), ...options });

test('GETはSDK取得と処理へ進まず405、no-storeを返す', async () => {
  const res = response();
  await handler({ stripeClient: () => assert.fail('unexpected-sdk') })({ method: 'GET' }, res);
  assert.equal(res.code, 405); assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('実SDKで署名を検証してから、同じevent/clientを処理へ渡す', async () => {
  const value = event(), res = response(); let called = 0;
  await handler({ processEvent: async (received, client) => { called++; assert.deepEqual(received, value); assert.equal(client, stripe); } })(request(value), res);
  assert.equal(called, 1); assert.equal(res.code, 200); assert.equal(res.body, 'ok');
});
test('署名なし/別secret/署名後の本文改変は400、対象判定にも進まない', async () => {
  const absent = request(); absent.headers = {};
  const altered = request(); altered.rawBody = Buffer.from('{}');
  for (const req of [absent, request(event(), 'whsec_other_fixture'), altered]) {
    const res = response(); await handler({ acceptsEvent: () => assert.fail('unexpected-filter') })(req, res);
    assert.equal(res.code, 400); assert.equal(res.body, 'Invalid signature');
  }
});
test('署名が正しくても本番/testの環境不一致は400', async () => {
  const res = response();
  await handler({ acceptsEvent: () => assert.fail('unexpected-filter') })(request(event({ livemode: true })), res);
  assert.equal(res.code, 400); assert.equal(res.body, 'Environment mismatch');
});
test('非同期の対象照合がfalseなら処理せず200 ignored', async () => {
  const value = event(), res = response();
  await handler({ acceptsEvent: async (received, client) => { assert.deepEqual(received, value); assert.equal(client, stripe); return false; } })(request(value), res);
  assert.equal(res.code, 200); assert.equal(res.body, 'ignored');
});
test('対象照合/処理の例外は500にし、ログへevent id/type以外を含めない', async () => {
  const original = console.error, logs = [];
  console.error = (...values) => logs.push(values);
  try {
    for (const options of [{ acceptsEvent: async () => { throw Error('never-log-private-value'); } },
      { processEvent: async () => { throw Error('never-log-private-value'); } }]) {
      const res = response(); await handler(options)(request(), res);
      assert.equal(res.code, 500); assert.equal(res.body, 'Retry later');
    }
    assert.deepEqual(logs, [0, 1].map(() => ['billing-webhook-retry', { eventId: 'evt_local_handler', type: 'payment_intent.succeeded' }]));
    assert.ok(!JSON.stringify(logs).includes('never-log-private-value'));
  } finally { console.error = original; }
});
test('SDK取得失敗と環境設定欠落も秘密の例外を表示せず500', async () => {
  const original = console.error, logs = [];
  console.error = (...values) => logs.push(values);
  try {
    for (const options of [{ stripeClient: () => { throw Error('private-api-key'); } }, { sandbox: undefined }]) {
      const res = response(); await handler(options)(request(), res);
      assert.equal(res.code, 500); assert.equal(res.body, 'Retry later');
    }
    assert.ok(!JSON.stringify(logs).includes('private-api-key'));
    assert.deepEqual(logs[0], ['billing-webhook-retry', { eventId: null, type: null }]);
  } finally { console.error = original; }
});
