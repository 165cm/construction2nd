import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseBilling, assertStripeEnvironment, billingPaths } from '../billingEnvironment.js';

test('サンドボックスは指定UIDのみ、空設定・部分一致・未認証を拒否', () => {
  assert.equal(canUseBilling('tester', true, ''), false);
  assert.equal(canUseBilling('tester', true, 'other'), false);
  assert.equal(canUseBilling('test', true, 'tester'), false);
  assert.equal(canUseBilling('tester', true, 'other, tester '), true);
  assert.equal(canUseBilling('', false, ''), false);
  assert.equal(canUseBilling('user', false, ''), true);
});
test('サンドボックスと本番の秘密鍵を取り違えたら停止する', () => {
  assert.doesNotThrow(() => assertStripeEnvironment('sk_test_fixture', true));
  assert.doesNotThrow(() => assertStripeEnvironment('sk_live_fixture', false));
  assert.throws(() => assertStripeEnvironment('sk_live_fixture', true));
  assert.throws(() => assertStripeEnvironment('sk_test_fixture', false));
  assert.throws(() => assertStripeEnvironment('', true));
});

test('テスト購入と本番購入は顧客・予約・利用権・返金の保存先を共有しない', () => {
  const sandbox = billingPaths(true, 'user');
  const live = billingPaths(false, 'user');
  for (const key of ['customers', 'revocations', 'grants', 'purchases']) {
    assert.notEqual(sandbox[key], live[key]);
  }
  assert.equal(live.grants, 'users/user/entitlements');
  assert.equal(sandbox.grants, 'users/user/sandboxEntitlements');
});
