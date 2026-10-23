// ローカルで受信先の配備用資料だけを作る。外部作成/配備/秘密値取得はしない。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCalendarWebhookProbeGuard } from '../functions/calendarWebhookProbeGuard.js';

const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== '--prepare-probe' || args[1] !== '--state' || args[3] !== '--evidence') {
  console.log('未実行。--prepare-probe --state <完了した専用manifest> --evidence <初回付与証跡> でローカル資料だけ作成。');
  process.exit(args.length ? 1 : 0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const state = JSON.parse(readFileSync(args[2], 'utf8'));
const evidence = JSON.parse(readFileSync(args[4], 'utf8'));
assert.match(state.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.equal(evidence.runId, state.runId); assert.equal(state.users.length, 2); assert.equal(evidence.evidence.length, 2);
assert.deepEqual(state.users.map(user => user.planId).sort(), ['monthly', 'pack']);
assert.deepEqual(evidence.evidence.map(item => item.planId).sort(), ['monthly', 'pack']);
assert.deepEqual(state.cleanup?.errors, []); assert.ok(state.users.every(user => user.verified));
const fixtures = state.users.map(user => {
  const item = evidence.evidence.find(entry => entry.planId === user.planId);
  assert.ok(item); assert.equal(item.purchaseStatus, 'complete'); assert.equal(item.grantCount, 1);
  assert.equal(item.policyVersion, 'jst-calendar-v1'); assert.equal(user.uid, `calendar-integration-${state.runId}-${user.planId}`);
  assert.equal(item.priceId, state.priceIds[user.planId === 'monthly' ? 'initial' : 'pack']);
  assert.ok(Number.isSafeInteger(item.expiresAt) && item.expiresAt > item.joinedAt);
  assert.match(user.chargeId, /^ch_\w+$/);
  if (user.planId === 'monthly') { assert.match(item.subscriptionId, /^sub_\w+$/); assert.equal(item.subscriptionId, user.subscriptionId); }
  const grant = { id: user.sessionId, planId: user.planId, chargeId: user.chargeId, paymentIntentId: user.paymentIntentId,
    startsAt: item.joinedAt, expiresAt: item.expiresAt, joinedAt: item.joinedAt, policyVersion: 'jst-calendar-v1',
    priceId: item.priceId, successEventId: item.successEventId, revoked: false };
  const purchase = { uid: user.uid, customerId: user.customerId, attemptId: user.attemptId, planId: user.planId,
    priceId: item.priceId, ...(user.planId === 'monthly' ? { monthlyPriceId: state.priceIds.monthly, subscriptionId: item.subscriptionId } : {}),
    policyVersion: 'jst-calendar-v1', consentVersion: 'calendar-jst-v1', recurringConsent: user.planId === 'monthly',
    // 完了済み試験fixture。過去の全DB文書を忠実復元したものではない。
    createdAt: item.joinedAt, status: 'complete', sessionId: user.sessionId, joinedAt: item.joinedAt,
    expiresAt: item.expiresAt, successEventId: item.successEventId, chargeId: user.chargeId,
    paymentIntentId: user.paymentIntentId, initialGrantId: user.sessionId, revoked: false };
  const target = { eventId: item.successEventId, uid: user.uid, customerId: user.customerId, attemptId: user.attemptId,
    planId: user.planId, paymentIntentId: user.paymentIntentId, sessionId: user.sessionId, joinedAt: item.joinedAt };
  return { target, purchase, grant };
});
const targets = fixtures.map(item => item.target);
createCalendarWebhookProbeGuard({ targets, db: {} }); // 書出し前に全対象を検証。
const output = `/tmp/calendar-webhook-probe-${state.runId}`;
mkdirSync(output, { mode: 0o700 }); // 上書きしない。
mkdirSync(output + '/functions', { mode: 0o700 });
const save = (path, value) => writeFileSync(output + '/' + path, typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
for (const file of readdirSync(root + 'functions').filter(file => file.endsWith('.js'))) copyFileSync(root + 'functions/' + file, output + '/functions/' + file);
const pkg = JSON.parse(readFileSync(root + 'functions/package.json', 'utf8'));
save('functions/package.json', { ...pkg, name: 'construction2nd-calendar-notification-probe', main: 'probeEntry.js' });
copyFileSync(root + 'functions/package-lock.json', output + '/functions/package-lock.json');
save('fixture.json', { runId: state.runId, priceIds: state.priceIds, fixtures });
save('firebase.json', { functions: [{ source: 'functions', codebase: 'calendar-probe', runtime: 'nodejs22' }] });
save('functions/.env.construction2nd', ['BILLING_SANDBOX=true', 'BILLING_ENABLED=false', 'CALENDAR_BILLING_ENABLED=false',
  `STRIPE_CALENDAR_INITIAL_PRICE_ID=${state.priceIds.initial}`, `STRIPE_CALENDAR_MONTHLY_PRICE_ID=${state.priceIds.monthly}`,
  `STRIPE_CALENDAR_PACK_PRICE_ID=${state.priceIds.pack}`, `CALENDAR_PROBE_TARGETS=${JSON.stringify(targets)}`,
  // importする本体の未使用パラメータにも無効値を明記し、非対話配備で質問させない。
  'BILLING_TESTER_UIDS=' + targets.map(t => t.uid).join(','), 'PRIVATE_CONTENT_ENABLED=false', 'SITE_URL=https://example.invalid',
  'STRIPE_MONTHLY_PRICE_ID=price_probe_unused_legacy_monthly', 'STRIPE_PACK_PRICE_ID=price_probe_unused_legacy_pack',
  'STRIPE_PORTAL_CONFIGURATION_ID=bpc_probe_unused', ''].join('\n'));
save('functions/probeEntry.js', `import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { processStripeBillingEvent } from './index.js';
import { createBillingWebhookHandler } from './billingWebhookHandler.js';
import { createCalendarWebhookProbeGuard } from './calendarWebhookProbeGuard.js';
import { assertStripeEnvironment } from './billingEnvironment.js';
const key = defineSecret('STRIPE_SECRET_KEY');
const secret = defineSecret('CALENDAR_PROBE_WEBHOOK_SECRET');
const targets = defineString('CALENDAR_PROBE_TARGETS', {default:'[]'});
const forbidden = async () => { throw new Error('probe-subscription-mutation-forbidden'); };
export const calendarBillingWebhookProbe = onRequest({region:'asia-northeast1',maxInstances:1,minInstances:0,timeoutSeconds:120,secrets:[key,secret]}, createBillingWebhookHandler({
  stripeClient: () => {
    const value=key.value(); assertStripeEnvironment(value,true);
    const stripe=new Stripe(value,{apiVersion:'2024-06-20',maxNetworkRetries:2});
    stripe.subscriptions.create=forbidden; stripe.subscriptions.cancel=forbidden;
    return stripe;
  },
  webhookSecret:()=>secret.value(),sandbox:()=>true,
  acceptsEvent:event=>createCalendarWebhookProbeGuard({targets:JSON.parse(targets.value()),db:getFirestore()})(event),
  processEvent:async(event,stripe)=>{await processStripeBillingEvent(event,stripe);console.info('calendar-probe-processed',{eventId:event.id,type:event.type});},
}));
`);
save('README.txt', `未配備の隔離通知試験。外部操作は本人承認後のみ。
対象: 一時関数 calendarBillingWebhookProbe 1件 / calendar-probe codebase / 東京 / minInstances0 maxInstances1。
新Secret名: CALENDAR_PROBE_WEBHOOK_SECRET。既存 STRIPE_WEBHOOK_SECRET は変更しない。
Stripe Sandbox endpoint1件に payment_intent.succeeded だけを購読、API2024-06-20。
fixture.jsonの完了済み購入/利用権/顧客対応の6文書だけを一時復元し、記載の既知Event2件をStripe自身から再送する。
probeは正しい署名・test環境・正確なEvent/PI/顧客/UID/予約/時刻・唯一所有者・completeを全照合。
契約作成/取消APIは禁止。既存関数/通知先/購入受付/Hostingへ変更しない。
確認: 外部署名配送、完了済通知の再送と期限非増殖。新初回作成/更新通知/実Callable認証とは区別。
片付け: endpoint無効化→処理停止/待機→対象6文書削除・不在確認→一時関数/専用Secret/endpoint削除。
fixture.jsonは過去全DB文書の復元ではなく、Stripe正本で照合する完了済み専用試験データ。
まだ外部作成・配備・文書復元・再送はしていない。
`);
console.log(JSON.stringify({ output, functionCount: 1, fixtureDocuments: fixtures.length * 3, knownEvents: targets.length, externalActions: 0 }));
