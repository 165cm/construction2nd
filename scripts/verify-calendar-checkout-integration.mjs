// 明示実行専用。実Stripeイベントをローカル署名でローカル実ハンドラーへ渡す。
// 外部Webhook配送・Callable認証の試験ではない。配備/既存利用者は変更しない。
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { cleanupCalendarIntegration } from './calendarIntegrationCleanup.mjs';
import { recordCalendarCreation, unconfirmedCalendarCreations } from './calendarIntegrationManifest.mjs';
import { findCalendarSuccessEvent } from '../functions/calendarPaymentEvidence.js';
import { calendarPeriod } from '../functions/calendarBillingPolicy.js';

const args = process.argv.slice(2);
const run = args.length === 1 && args[0] === '--run-calendar-integration';
const recovery = args.length === 3 && args[0] === '--cleanup-calendar-integration' && args[1] === '--state';
if (!run && !recovery) {
  console.log('未実行。承認後のみ --run-calendar-integration。専用商品1・価格3・顧客/Checkout各2と専用Firestore記録を作成し、今回分だけ片付けます。');
  console.log('中断後の片付け: --cleanup-calendar-integration --state /tmp/calendar-integration-<UUID>.json');
  process.exit(args.length ? 1 : 0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'package.json');
const origin = 'http://127.0.0.1:5213';
const nonce = randomBytes(32).toString('hex');
const localSecret = 'whsec_' + randomBytes(32).toString('hex');
const runId = recovery ? null : randomUUID();
const statePath = recovery ? args[2] : `/tmp/calendar-integration-${runId}.json`;
if (recovery) assert.match(statePath, /^\/tmp\/calendar-integration-[0-9a-f-]+\.json$/i);
const state = recovery ? JSON.parse(readFileSync(statePath, 'utf8')) : {
  runId, priceIds: {}, users: ['monthly', 'pack'].map(planId => ({ planId, uid: `calendar-integration-${runId}-${planId}` })), results: [],
};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
if (!recovery) writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' });
let stripe, db, hooks, handlers, server, busy = false, closing = false, finished = false, ready = false;
let notice = '準備しています。';
const ref = value => typeof value === 'string' ? value : value?.id;
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const userFor = uid => { const user = state.users.find(item => item.uid === uid); assert.ok(user, 'unexpected-test-user'); return user; };
async function trackedCreate(kind, owner, action, record) {
  return recordCalendarCreation({ state, save, kind, owner, create: action, onCreated: record });
}
const form = (action, label) => `<form method="post" action="${action}"><input type="hidden" name="nonce" value="${nonce}"><button ${busy || finished ? 'disabled' : ''}>${label}</button></form>`;
function page() {
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>未公開の決済結合試験</title><style>body{font:18px/1.6 system-ui;max-width:760px;margin:24px auto;padding:16px;color:#182334}section{border:1px solid #8796a8;border-radius:12px;padding:16px;margin:16px 0}button,a{display:inline-block;min-height:44px;box-sizing:border-box;padding:10px;font:inherit}button{margin:8px 0}p{overflow-wrap:anywhere}</style><h1>未公開の決済結合試験</h1><p>実課金はありません。テストカードと架空のメールだけを使ってください。アプリのご自身の期限・学習記録は変更しません。</p><p>支払い後は、この確認タブへ戻って「結果確認」を押してください。月額とパックを1回ずつ確認します。</p><p role="status">${escape(notice)}</p>${state.users.map(user => `<section><h2>${user.planId === 'monthly' ? '月額600円' : '3か月980円'}</h2><p>${user.verified ? '保存・契約数・再送の照合成功' : '確認待ち'}</p>${!closing && !finished && user.checkoutUrl ? `<a target="_blank" rel="noopener noreferrer" href="${escape(user.checkoutUrl)}">テスト購入画面を開く</a>` : ''}</section>`).join('')}${form('/check', '結果確認')}${form('/cleanup', '試験を終了して今回分を片付ける')}<p>対象：専用商品1・価格3・顧客と購入画面各2。終了時に専用契約取消・未払い画面失効・顧客と専用保存文書削除・価格と商品を無効化します。テスト決済履歴は残る場合があります。</p><p>実Stripeイベントをローカルの試験署名で処理します。Stripeからの外部HTTP通知・実ログイン認証の確認は含みません。</p></html>`;
}
async function emit(event) {
  const payload = JSON.stringify(event);
  const response = { code: 200, set() { return this; }, status(code) { this.code = code; return this; }, send() { return this; }, sendStatus(code) { this.code = code; return this; } };
  await handlers.stripeWebhook({ method: 'POST', headers: {
    'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: localSecret }),
  }, rawBody: Buffer.from(payload) }, response);
  assert.equal(response.code, 200, 'local-webhook-failed');
}
async function verify() {
  for (const user of state.users) {
    const session = await stripe.checkout.sessions.retrieve(user.sessionId, { expand: ['line_items', 'payment_intent.latest_charge'] });
    assert.equal(session.livemode, false); assert.equal(ref(session.customer), user.customerId);
    assert.equal(session.metadata.uid, user.uid); assert.equal(session.metadata.attemptId, user.attemptId);
    assert.equal(session.metadata.policyVersion, 'jst-calendar-v1'); assert.equal(session.metadata.planId, user.planId);
    assert.equal(session.line_items.has_more, false); assert.equal(session.line_items.data.length, 1);
    assert.equal(ref(session.line_items.data[0].price), state.priceIds[user.planId === 'monthly' ? 'initial' : 'pack']);
    if (session.status !== 'complete' || session.payment_status !== 'paid') continue;
    const payment = session.payment_intent;
    assert.equal(payment.status, 'succeeded'); assert.equal(payment.livemode, false);
    user.paymentIntentId = payment.id; user.chargeId = ref(payment.latest_charge); save();
    const success = await findCalendarSuccessEvent({ stripe, payment, sandbox: true, now: Date.now() });
    if (success.status !== 'ready') { notice = '成功イベントの取得待ちです。少し待って結果確認を押してください。'; continue; }
    await emit(success.event);
    const purchaseRef = db.doc(`users/${user.uid}/sandboxBillingPurchases/${user.attemptId}`);
    const grantRef = db.doc(`users/${user.uid}/sandboxEntitlements/${user.sessionId}`);
    const purchase = (await purchaseRef.get()).data();
    const grant = (await grantRef.get()).data();
    assert.equal(purchase.status, 'complete'); assert.equal(grant.revoked, false);
    assert.equal(grant.joinedAt, success.event.created * 1000);
    assert.equal(grant.expiresAt, calendarPeriod(grant.joinedAt, user.planId).expiresAt);
    assert.equal(grant.priceId, state.priceIds[user.planId === 'monthly' ? 'initial' : 'pack']);
    assert.equal(session.amount_total, user.planId === 'monthly' ? 600 : 980);
    const subscriptions = await stripe.subscriptions.list({ customer: user.customerId, status: 'all', limit: 100 });
    assert.equal(subscriptions.has_more, false);
    assert.equal(subscriptions.data.length, user.planId === 'monthly' ? 1 : 0);
    if (user.planId === 'monthly') {
      const sub = subscriptions.data[0];
      assert.equal(sub.id, purchase.subscriptionId); assert.equal(sub.metadata.uid, user.uid);
      assert.equal(ref(sub.items.data[0].price), state.priceIds.monthly);
      assert.equal(sub.current_period_end * 1000, grant.expiresAt);
    }
    await emit(success.event); // 同じ正本を再送して増殖/期限変更がないことを照合。
    assert.deepEqual((await grantRef.get()).data(), grant);
    const repeated = await stripe.subscriptions.list({ customer: user.customerId, status: 'all', limit: 100 });
    assert.equal(repeated.has_more, false); assert.equal(repeated.data.length, subscriptions.data.length);
    const grants = await db.collection(`users/${user.uid}/sandboxEntitlements`).get();
    assert.equal(grants.size, 1);
    user.verified = true; save();
  }
  if (state.users.every(user => user.verified)) notice = '2件とも成功しました。終了ボタンで今回分を片付けてください。';
}
async function cleanup() {
  closing = true; // 以後、ローカル通知/確認処理は開始させない。
  // 応答喪失/途中失敗でも、専用顧客の予約・Sessionだけを再探索する。
  // 不一致ならhelperによる削除へ進まず、manifestを残して個別照合する。
  for (const user of state.users) if (user.customerId) {
    assert.equal(user.uid, `calendar-integration-${state.runId}-${user.planId}`);
    const customer = await stripe.customers.retrieve(user.customerId);
    if (customer.deleted) continue;
    assert.equal(customer.livemode, false); assert.equal(customer.metadata?.uid, user.uid);
    const reservation = (await db.doc(`sandboxBillingCustomers/${user.uid}`).get()).data();
    if (reservation?.pending) {
      assert.equal(reservation.customerId, user.customerId);
      if (user.attemptId) assert.equal(user.attemptId, reservation.pending.attemptId);
      user.attemptId = reservation.pending.attemptId; save();
    }
    if (!user.sessionId && user.attemptId) {
      const list = await stripe.checkout.sessions.list({ customer: user.customerId, limit: 100 });
      assert.equal(list.has_more, false);
      const matches = list.data.filter(session => session.metadata?.attemptId === user.attemptId && session.metadata?.uid === user.uid);
      assert.ok(matches.length <= 1);
      if (matches.length) { user.sessionId = matches[0].id; save(); }
    }
  }
  const result = await cleanupCalendarIntegration({ stripe, db, state });
  // SDKで作成成功応答を得られなかった対象は、存在しないと推定しない。
  result.errors.push(...unconfirmedCalendarCreations(state));
  state.cleanup = result; save();
  finished = result.errors.length === 0;
  notice = finished ? '今回分の後片付けと読取確認が完了しました。' : '一部の後片付けを保留しました。保存ファイルを使って担当者が確認します。';
  console.log(JSON.stringify({ cleanup: result }));
  return result;
}
async function serve(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (req.headers.host !== '127.0.0.1:5213') { res.writeHead(403); return res.end(); }
  if (req.method === 'GET' && req.url === '/') return res.end(page());
  if (req.method !== 'POST' || !['/check', '/cleanup'].includes(req.url)) { res.writeHead(404); return res.end(); }
  if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) { res.writeHead(403); return res.end(); }
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 2048) { res.writeHead(413); return res.end(); } }
  if (new URLSearchParams(body).get('nonce') !== nonce) { res.writeHead(403); return res.end(); }
  if (busy || finished || (closing && req.url !== '/cleanup') || !ready) { res.writeHead(409); return res.end(); }
  busy = true;
  try { if (req.url === '/check') await verify(); else await cleanup(); }
  catch { notice = '照合に失敗しました。購入を繰り返さず、担当者が確認します。終了ボタンから後片付けできます。'; state.results.push({ status: 'verification-failed', at: new Date().toISOString() }); save(); }
  finally { busy = false; }
  res.writeHead(303, { Location: '/' }); res.end();
}
try {
  if (run) {
    server = createServer((req, res) => { serve(req, res).catch(() => { res.statusCode = 500; res.end('local-server-error'); }); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5213, '127.0.0.1', resolve); });
  }
  const config = Object.fromEntries(readFileSync(root + 'functions/.env.construction2nd', 'utf8').split('\n')
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
  assert.equal(config.BILLING_SANDBOX, 'true');
  const key = execFileSync(root + 'node_modules/.bin/firebase', ['functions:secrets:access', 'STRIPE_SECRET_KEY', '--project', 'construction2nd'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.ok(key.startsWith('sk_test_'));
  const { default: Stripe } = await import(pathToFileURL(root + 'functions/node_modules/stripe/esm/stripe.esm.node.js'));
  stripe = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
  const auth = require('firebase-tools/lib/auth.js');
  const token = await auth.getAccessToken(auth.getGlobalDefaultAccount().tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const fnRequire = createRequire(root + 'functions/package.json');
  const { Firestore } = fnRequire('@google-cloud/firestore');
  const { OAuth2Client } = fnRequire('google-auth-library');
  const authClient = new OAuth2Client(); authClient.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 45 * 60000 });
  db = new Firestore({ projectId: 'construction2nd', authClient });
  if (recovery) { const result = await cleanup(); await db.terminate(); process.exitCode = result.errors.length ? 1 : 0; }
  else {
    const product = await trackedCreate('product', runId,
      () => stripe.products.create({ name: 'Calendar integration test', metadata: { runId } }, { idempotencyKey: `${runId}:product` }),
      value => { state.productId = value.id; });
    for (const [role, amount] of [['initial', 600], ['monthly', 600], ['pack', 980]]) {
      await trackedCreate('price', role, () => stripe.prices.create({ product: product.id, currency: 'jpy', unit_amount: amount, tax_behavior: 'inclusive',
        ...(role === 'monthly' ? { recurring: { interval: 'month' } } : {}), metadata: { runId } }, { idempotencyKey: `${runId}:price:${role}` }),
      value => { state.priceIds[role] = value.id; });
    }
    Object.assign(process.env, { GOOGLE_CLOUD_PROJECT: 'construction2nd', BILLING_ENABLED: 'true', BILLING_SANDBOX: 'true', CALENDAR_BILLING_ENABLED: 'true',
      BILLING_TESTER_UIDS: state.users.map(user => user.uid).join(','), SITE_URL: config.SITE_URL, STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: localSecret,
      STRIPE_CALENDAR_INITIAL_PRICE_ID: state.priceIds.initial, STRIPE_CALENDAR_MONTHLY_PRICE_ID: state.priceIds.monthly, STRIPE_CALENDAR_PACK_PRICE_ID: state.priceIds.pack });
    // SDK成功応答直後にIDを保存し、後続DB失敗でも片付け対象を失わない。
    const captured = new Stripe(key, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
    const customerCreate = captured.customers.create.bind(captured.customers);
    captured.customers.create = async (params, options) => {
      const user = userFor(params.metadata.uid);
      return trackedCreate('customer', user.uid, () => customerCreate(params, options), value => { user.customerId = value.id; });
    };
    const sessionCreate = captured.checkout.sessions.create.bind(captured.checkout.sessions);
    captured.checkout.sessions.create = async (params, options) => {
      const user = userFor(params.metadata.uid); assert.equal(params.customer, user.customerId);
      user.attemptId = params.metadata.attemptId; save();
      return trackedCreate('session', user.uid, () => sessionCreate(params, options), value => { user.sessionId = value.id; user.checkoutUrl = value.url; });
    };
    const subscriptionCreate = captured.subscriptions.create.bind(captured.subscriptions);
    captured.subscriptions.create = async (params, options) => {
      const user = userFor(params.metadata.uid); assert.equal(params.customer, user.customerId);
      return trackedCreate('subscription', user.uid, () => subscriptionCreate(params, options), value => { user.subscriptionId = value.id; });
    };
    const ownUserPath = path => /^users\/[^/]+\/(sandboxEntitlements|sandboxBillingPurchases)(\/[^/]+)?$/.test(path)
      && state.users.some(user => path.startsWith(`users/${user.uid}/`));
    const scopedDb = {
      doc(path) { assert.ok(ownUserPath(path) || state.users.some(user => path === `sandboxBillingCustomers/${user.uid}`)
        || /^sandboxBillingRevocations\/[^/]+$/.test(path), 'out-of-scope-document'); return db.doc(path); },
      collection(path) {
        if (path === 'sandboxBillingCustomers') return { where(field, operator, value) {
          assert.ok(field === 'customerId' && operator === '==' && state.users.some(user => user.customerId === value), 'out-of-scope-customer-query');
          return db.collection(path).where(field, operator, value);
        } };
        assert.ok(ownUserPath(path) && path.split('/').length === 3, 'out-of-scope-collection'); return db.collection(path);
      },
      runTransaction: db.runTransaction.bind(db),
    };
    globalThis[Symbol.for('calendar-integration-runtime')] = { db: scopedDb, stripe: captured };
    hooks = registerHooks({ resolve(specifier, context, next) {
      if (context.parentURL === pathToFileURL(root + 'functions/index.js').href) {
        const source = specifier === 'firebase-admin/firestore' ? "export const getFirestore=()=>globalThis[Symbol.for('calendar-integration-runtime')].db;"
          : specifier === 'stripe' ? "export default class Stripe {constructor(){return globalThis[Symbol.for('calendar-integration-runtime')].stripe;}}" : null;
        if (source) return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
      }
      return next(specifier, context);
    } });
    handlers = await import(pathToFileURL(root + 'functions/index.js'));
    for (const user of state.users) await handlers.createCheckout.run({ auth: { uid: user.uid }, data: {
      planId: user.planId, consentVersion: 'calendar-jst-v1', recurringConsent: user.planId === 'monthly',
    } });
    ready = true;
    notice = '準備完了。月額とパックを1回ずつテスト購入してください。';
    console.log(JSON.stringify({ localPage: origin, statePath, status: 'ready-no-live-charges' }));
  }
} catch {
  console.error('calendar-integration-setup-failed; inspect dedicated manifest, never retry purchases blindly');
  if (stripe && db) { try { await cleanup(); } catch { console.error('cleanup-recovery-required'); } }
  server?.close(); if (db) await db.terminate(); hooks?.deregister(); process.exitCode = 1;
}
if (run && server?.listening) {
  // シグナル中に処理中の確認とcleanupを競合させない。保存済manifestから再開する。
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    closing = true;
    if (busy) { console.error('operation-in-flight; use saved manifest for cleanup after this process stops'); process.exit(1); }
    busy = true;
    try { if (!finished) await cleanup(); } finally { server.close(); await db?.terminate(); hooks?.deregister(); process.exit(finished ? 0 : 1); }
  });
}
