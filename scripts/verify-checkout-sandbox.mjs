// Opt-in integration check: dedicated fake users, real sandbox Stripe and Firestore.
// Calls the existing handler locally; it does not test callable-token validation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

if (!process.argv.includes('--run-sandbox-check')) {
  console.log('Explicit --run-sandbox-check required; creates unpaid test Checkouts and dedicated test documents.');
  process.exit(0);
}
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(root + 'package.json');
const project = 'construction2nd';
const runId = new Date().toISOString().replace(/[^0-9]/g, '');
const prefix = `billing-checkout-guard-${runId}`;
const users = Object.fromEntries(['parallel', 'mixed', 'active', 'orphan', 'old-orphan'].map(name => [name, `${prefix}-${name}`]));
const state = { runId, users, customers: {}, sessions: [], cases: [] };
const statePath = `/tmp/construction-checkout-guard-${runId}.json`;
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
let stripe, db, credentialSymbol, hooks;

try {
  const config = Object.fromEntries(readFileSync(root + 'functions/.env.construction2nd', 'utf8')
    .split('\n').filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
  assert.equal(config.BILLING_SANDBOX, 'true');
  for (const name of ['STRIPE_MONTHLY_PRICE_ID', 'STRIPE_PACK_PRICE_ID', 'SITE_URL']) process.env[name] = config[name];
  Object.assign(process.env, { GOOGLE_CLOUD_PROJECT: project, BILLING_ENABLED: 'true', BILLING_SANDBOX: 'true', BILLING_TESTER_UIDS: Object.values(users).join(',') });
  process.env.STRIPE_SECRET_KEY = execFileSync(root + 'node_modules/.bin/firebase',
    ['functions:secrets:access', 'STRIPE_SECRET_KEY', '--project', project],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  assert.ok(process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'));
  const { default: Stripe } = await import(pathToFileURL(root + 'functions/node_modules/stripe/esm/stripe.esm.node.js'));
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
  const auth = require('firebase-tools/lib/auth.js');
  const account = auth.getGlobalDefaultAccount();
  const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const functionRequire = createRequire(root + 'functions/package.json');
  const { Firestore } = functionRequire('@google-cloud/firestore');
  const { OAuth2Client } = functionRequire('google-auth-library');
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 45 * 60000 });
  db = new Firestore({ projectId: project, authClient });
  credentialSymbol = Symbol.for('construction-checkout-sandbox-db');
  globalThis[credentialSymbol] = db;
  const entry = pathToFileURL(root + 'functions/index.js').href;
  const wrapper = "export const getFirestore=()=>globalThis[Symbol.for('construction-checkout-sandbox-db')];";
  hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'firebase-admin/firestore') return { url: 'data:text/javascript,' + encodeURIComponent(wrapper), shortCircuit: true };
    return next(specifier, context);
  } });
  const { createCheckout } = await import(entry);
  const customerRef = uid => {
    assert.ok(Object.values(users).includes(uid));
    return db.doc(`sandboxBillingCustomers/${uid}`);
  };
  const call = (uid, planId = 'pack') => createCheckout.run({ auth: { uid }, data: { planId } });
  const sessions = async uid => {
    const customer = (await customerRef(uid).get()).data()?.customerId;
    if (!customer) return [];
    state.customers[uid] = customer;
    const list = await stripe.checkout.sessions.list({ customer, limit: 100 });
    assert.equal(list.has_more, false);
    list.data.forEach(session => {
      assert.equal(session.livemode, false);
      assert.equal(session.payment_status, 'unpaid');
      assert.equal(session.client_reference_id, uid);
      if (!state.sessions.includes(session.id)) state.sessions.push(session.id);
    });
    save();
    return list.data;
  };
  const record = (name, detail = {}) => {
    state.cases.push({ name, ...detail }); save();
    console.log(JSON.stringify({ pass: name, ...detail }));
  };
  save();

  await assert.rejects(createCheckout.run({ data: { planId: 'pack' } }), error => error.code === 'unauthenticated');
  await assert.rejects(call(prefix + '-not-allowed'), error => error.code === 'permission-denied');
  record('handler guards: missing auth and non-allowlisted fake user');

  const repeated = await Promise.allSettled(Array.from({ length: 8 }, () => call(users.parallel)));
  const fulfilled = repeated.filter(result => result.status === 'fulfilled').map(result => result.value);
  assert.ok(fulfilled.length > 0);
  assert.equal(new Set(fulfilled.map(result => result.url)).size, 1);
  const first = await sessions(users.parallel);
  assert.equal(first.length, 1);
  assert.equal((await call(users.parallel)).url, first[0].url);
  assert.equal((await sessions(users.parallel)).length, 1);
  record('8 simultaneous same-plan calls and retry: one Checkout', {
    fulfilled: fulfilled.length, rejectedCodes: repeated.filter(result => result.status === 'rejected').map(result => result.reason.code || result.reason.type), session: first[0].id
  });

  await assert.rejects(call(users.parallel, 'monthly'), error => error.code === 'already-exists');
  assert.equal((await sessions(users.parallel)).length, 1);
  record('switching plan while Checkout is open: blocked');

  const mixed = await Promise.allSettled(['pack', 'monthly', 'pack', 'monthly'].map(plan => call(users.mixed, plan)));
  assert.ok(mixed.some(result => result.status === 'fulfilled'));
  assert.equal(new Set(mixed.filter(result => result.status === 'fulfilled').map(result => result.value.url)).size, 1);
  assert.equal((await sessions(users.mixed)).length, 1);
  record('simultaneous different plans: one Checkout', { rejectedCodes: mixed.filter(result => result.status === 'rejected').map(result => result.reason.code || result.reason.type) });

  // Only the dedicated fake reservation is moved past its deadline; Stripe remains open.
  await customerRef(users.parallel).update({ 'pending.expiresAt': Date.now() - 1000 });
  await assert.rejects(call(users.parallel), error => error.code === 'failed-precondition');
  assert.equal((await sessions(users.parallel)).length, 1);
  record('local reservation deadline passed but Stripe still open: no second Checkout');
  await stripe.checkout.sessions.expire(first[0].id);
  const replacements = await Promise.allSettled(Array.from({ length: 4 }, () => call(users.parallel)));
  assert.ok(replacements.some(result => result.status === 'fulfilled'));
  const after = await sessions(users.parallel);
  assert.equal(after.length, 2);
  assert.equal(after.filter(session => session.status === 'expired').length, 1);
  assert.equal(after.filter(session => session.status === 'open').length, 1);
  record('Stripe session expired plus concurrent retries: exactly one replacement');

  await db.doc(`users/${users.active}/sandboxEntitlements/integration-test`).set({
    startsAt: Date.now() - 1000, expiresAt: Date.now() + 600000, revoked: false, planId: 'pack'
  });
  await assert.rejects(call(users.active), error => error.code === 'already-exists');
  assert.equal((await sessions(users.active)).length, 0);
  record('existing active grant: new Checkout rejected');

  for (const [name, ageHours, blocked] of [['orphan', 2, true], ['old-orphan', 25, false]]) {
    await customerRef(users[name]).set({ pending: { attemptId: randomUUID(), planId: 'pack', createdAt: Date.now() - ageHours * 3600000, expiresAt: Date.now() - 3600000 } });
    if (blocked) {
      await assert.rejects(call(users[name]), error => error.code === 'failed-precondition');
      assert.equal((await sessions(users[name])).length, 0);
    } else {
      await call(users[name]); assert.equal((await sessions(users[name])).length, 1);
    }
    record(`missing Stripe session after ${ageHours} hours: ${blocked ? 'blocked' : 'recovered'}`);
  }
  state.result = 'passed';
} catch (error) {
  state.result = 'failed';
  state.failure = { type: error.type || error.name, code: error.code || 'check-failed' };
  console.error(JSON.stringify(state.failure));
  process.exitCode = 1;
} finally {
  // No payment method is entered. Expire only unpaid Checkouts created by this run.
  if (stripe) for (const id of state.sessions) {
    try {
      const session = await stripe.checkout.sessions.retrieve(id);
      assert.equal(session.livemode, false);
      assert.ok(Object.values(users).includes(session.client_reference_id));
      if (session.status === 'open' && session.payment_status === 'unpaid') await stripe.checkout.sessions.expire(id);
    } catch (error) {
      state.cleanupFailure = { type: error.type || error.name, code: error.code || 'check-failed' }; process.exitCode = 1;
    }
  }
  save();
  hooks?.deregister();
  if (credentialSymbol) delete globalThis[credentialSymbol];
  delete process.env.STRIPE_SECRET_KEY;
  await db?.terminate();
  console.log(JSON.stringify({ result: state.result, cases: state.cases.length, statePath, cleanupFailure: state.cleanupFailure }));
}
