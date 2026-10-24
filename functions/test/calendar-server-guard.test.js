import test from 'node:test';
import assert from 'node:assert/strict';

// 実ハンドラーを呼ぶが、停止位置はStripe/Firestoreアクセスより前。
// 秘密鍵は設定せず、既存顧客・購入予約には一切接続しない。
process.env.GOOGLE_CLOUD_PROJECT = 'calendar-guard-local-test';
process.env.BILLING_ENABLED = 'true';
process.env.BILLING_SANDBOX = 'true';
process.env.BILLING_TESTER_UIDS = 'fake-calendar-user';
const { createCheckout } = await import('../index.js');

test('新確認画面の要求を旧480円購入へ流さず、外部接続前に停止する', async () => {
  for (const data of [
    { planId: 'monthly', consentVersion: 'calendar-jst-v1', recurringConsent: true },
    { planId: 'pack', consentVersion: 'calendar-jst-v1', recurringConsent: false },
    { planId: 'monthly', consentVersion: 'unknown' },
    { planId: 'monthly', recurringConsent: true },
  ]) {
    await assert.rejects(createCheckout.run({ auth: { uid: 'fake-calendar-user' }, data }), error => error.code === 'failed-precondition' && error.message.includes('新料金'));
  }
});

test('新確認画面の要求でも認証と指定アカウントの確認を省略しない', async () => {
  const data = { planId: 'monthly', consentVersion: 'calendar-jst-v1', recurringConsent: true };
  await assert.rejects(createCheckout.run({ data }), error => error.code === 'unauthenticated');
  await assert.rejects(createCheckout.run({ auth: { uid: 'other-user' }, data }), error => error.code === 'permission-denied');
});

test('本番で新方式が停止中なら、同意情報を省いた旧形式の購入も外部接続前に拒否', async () => {
  process.env.BILLING_SANDBOX = 'false';
  try {
    await assert.rejects(createCheckout.run({ auth: { uid: 'fake-calendar-user' }, data: { planId: 'monthly' } }),
      error => error.code === 'failed-precondition' && error.message.includes('新料金'));
  } finally { process.env.BILLING_SANDBOX = 'true'; }
});
