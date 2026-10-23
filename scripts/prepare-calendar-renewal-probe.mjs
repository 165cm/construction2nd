// ローカルで受信先の配備用資料だけを作る。外部作成/配備/秘密値取得はしない。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createBillingPriceRegistry } from '../functions/billingPriceRegistry.js';
import { createCalendarRenewalProbeGuard } from '../functions/calendarRenewalProbeGuard.js';

const args = process.argv.slice(2);
if (args.length !== 5 || args[0] !== '--prepare-renewal-probe' || args[1] !== '--state' || args[3] !== '--evidence') {
  console.log('未実行。--prepare-renewal-probe --state <隔離時計manifest> --evidence <更新通知証跡> でローカル資料だけ作成。');
  process.exit(args.length ? 1 : 0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = JSON.parse(readFileSync(args[4], 'utf8'));
const state = JSON.parse(readFileSync(args[2], 'utf8'));
assert.equal(evidence.runId, state.runId);
assert.match(evidence.runId, /^calendar-probe-[0-9a-f-]{36}$/);
assert.deepEqual(state.cleanupErrors, []);
assert.equal(evidence.cases.length, 4);
assert.equal(evidence.monthlyPriceId, state.prices[0]);
const fixtures = evidence.cases.map((item, index) => {
  const uid = `${evidence.runId}-${index}`;
  const clock = state.clocks[index];
  assert.equal(clock.deleted, true); assert.equal(clock.fixture, item.fixture);
  assert.equal(clock.customer, item.customerId); assert.equal(clock.subscription, item.subscriptionId);
  assert.equal(clock.initialPayment, item.initialPaymentIntentId);
  assert.equal(item.index, index); assert.equal(item.uid, uid); assert.equal(item.attemptId, uid);
  assert.equal(item.subscriptionStatus, 'canceled'); assert.equal(item.invoices.length, 2);
  assert.equal(Date.parse(item.fixture), item.joinedAt);
  const purchase = { uid, attemptId: uid, customerId: item.customerId, subscriptionId: item.subscriptionId,
    joinedAt: item.joinedAt, createdAt: item.joinedAt, paymentIntentId: item.initialPaymentIntentId,
    sessionId: `cs_renewal_fixture_${index}`, priceId: 'price_probeUnusedInitial', monthlyPriceId: evidence.monthlyPriceId,
    planId: 'monthly', status: 'complete', policyVersion: 'jst-calendar-v1', consentVersion: 'calendar-jst-v1', recurringConsent: true, revoked: false };
  const renewals = item.invoices.map((entry, offset) => {
    const target = { uid, attemptId: uid, customerId: item.customerId, subscriptionId: item.subscriptionId,
      joinedAt: item.joinedAt, sessionId: purchase.sessionId, monthlyPriceId: evidence.monthlyPriceId,
      eventId: entry.eventId, eventCreated: entry.eventCreated, invoiceId: entry.invoiceId, periodIndex: offset + 1,
      startsAt: entry.grant.startsAt, expiresAt: entry.grant.expiresAt };
    assert.equal(entry.grant.id, entry.invoiceId); assert.equal(entry.grant.subscriptionId, item.subscriptionId);
    assert.equal(entry.grant.joinedAt, item.joinedAt); assert.equal(entry.grant.priceId, evidence.monthlyPriceId);
    assert.equal(entry.grant.planId, 'monthly'); assert.equal(entry.grant.policyVersion, 'jst-calendar-v1');
    assert.equal(entry.grant.revoked, false); assert.match(entry.grant.chargeId, /^ch_\w+$/); assert.match(entry.grant.paymentIntentId, /^pi_\w+$/);
    return { target, grant: entry.grant };
  });
  return { purchase, renewals };
});
const targets = fixtures.flatMap(item => item.renewals.map(r => r.target));
createCalendarRenewalProbeGuard({ targets, db: {} });
const priceIds = { initial: 'price_probeUnusedInitial', monthly: evidence.monthlyPriceId, pack: 'price_probeUnusedPack' };
createBillingPriceRegistry({ sandbox: true, prices: { calendarInitial: priceIds.initial, calendarMonthly: priceIds.monthly, calendarPack: priceIds.pack } });
const output = `/tmp/calendar-renewal-probe-${evidence.runId.slice("calendar-probe-".length)}`;
mkdirSync(output, { mode: 0o700 }); // 上書きしない。
mkdirSync(output + '/functions', { mode: 0o700 });
const save = (path, value) => writeFileSync(output + '/' + path, typeof value === 'string' ? value : JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
for (const file of readdirSync(root + 'functions').filter(file => file.endsWith('.js'))) copyFileSync(root + 'functions/' + file, output + '/functions/' + file);
const pkg = JSON.parse(readFileSync(root + 'functions/package.json', 'utf8'));
save('functions/package.json', { ...pkg, name: 'construction2nd-calendar-notification-probe', main: 'probeEntry.js' });
copyFileSync(root + 'functions/package-lock.json', output + '/functions/package-lock.json');
save('fixture.json', { runId: state.runId, priceIds, fixtures });
save('firebase.json', { functions: [{ source: 'functions', codebase: 'calendar-renewal-probe', runtime: 'nodejs22' }] });
save('functions/.env.construction2nd', ['BILLING_SANDBOX=true', 'BILLING_ENABLED=false', 'CALENDAR_BILLING_ENABLED=false',
  `STRIPE_CALENDAR_INITIAL_PRICE_ID=${priceIds.initial}`, `STRIPE_CALENDAR_MONTHLY_PRICE_ID=${priceIds.monthly}`,
  `STRIPE_CALENDAR_PACK_PRICE_ID=${priceIds.pack}`, `CALENDAR_RENEWAL_PROBE_TARGETS=${JSON.stringify(targets)}`,
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
import { createBillingPriceRegistry } from '../functions/billingPriceRegistry.js';
import { createCalendarRenewalProbeGuard } from './calendarRenewalProbeGuard.js';
import { assertStripeEnvironment } from './billingEnvironment.js';
const key = defineSecret('STRIPE_SECRET_KEY');
const secret = defineSecret('CALENDAR_RENEWAL_PROBE_WEBHOOK_SECRET');
const targets = defineString('CALENDAR_RENEWAL_PROBE_TARGETS', {default:'[]'});
const forbidden = async () => { throw new Error('probe-subscription-mutation-forbidden'); };
export const calendarRenewalWebhookProbe = onRequest({region:'asia-northeast1',maxInstances:1,minInstances:0,timeoutSeconds:120,secrets:[key,secret]}, createBillingWebhookHandler({
  stripeClient: () => {
    const value=key.value(); assertStripeEnvironment(value,true);
    const stripe=new Stripe(value,{apiVersion:'2024-06-20',maxNetworkRetries:2});
    stripe.subscriptions.create=forbidden; stripe.subscriptions.cancel=forbidden; stripe.subscriptions.update=forbidden;
    return stripe;
  },
  webhookSecret:()=>secret.value(),sandbox:()=>true,
  acceptsEvent:(event,stripe)=>createCalendarRenewalProbeGuard({targets:JSON.parse(targets.value()),db:getFirestore(),stripe})(event),
  processEvent:async(event,stripe)=>{await processStripeBillingEvent(event,stripe);console.info('calendar-renewal-probe-processed',{eventId:event.id,type:event.type});},
}));
`);
save('README.txt', `未配備。本人承認後のみ、invoice.paidの既知8件を専用関数1/署名Secret1/endpoint1へ再送する。
過去隔離時計の加入時刻を持つ完了fixtureであり、初回PI成功イベントの復元ではない。
顧客対応4/購入4を一時保存。更新利用権8が生成され、合計最大16文書を限定削除する。
初回利用権は保存しないため、その保持はこの試験対象外。過去期限なので現在の有料画面/認証の試験でもない。
追加購入/契約/時計の作成や変更なし。SDKの契約create/cancel/updateは禁止。
既存5関数/通知先/購入受付/Hostingを変更しない。少額のクラウド費用が発生する可能性がある。
後片付け: endpoint無効化→関数停止/削除→処理待機→対象最大16文書削除/不在確認→endpoint/専用Secret削除。
`);
console.log(JSON.stringify({ output, functionCount: 1, seedDocuments: 8, maximumDocuments: 16, knownEvents: targets.length, externalActions: 0 }));
