import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('隔離配備資料は未使用設定も固定し、公開export1件と専用署名だけを紐付ける', () => {
  const runId = randomUUID(), input = mkdtempSync('/tmp/calendar-probe-package-test-');
  const output = `/tmp/calendar-webhook-probe-${runId}`;
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const users = ['monthly', 'pack'].map(planId => ({ planId, uid: `calendar-integration-${runId}-${planId}`,
    customerId: 'cus_' + planId, sessionId: 'cs_' + planId, paymentIntentId: 'pi_' + planId,
    chargeId: 'ch_' + planId, attemptId: randomUUID(), verified: true, ...(planId === 'monthly' ? { subscriptionId: 'sub_monthly' } : {}) }));
  const state = { runId, users, priceIds: { initial: 'price_initial', monthly: 'price_monthly', pack: 'price_pack' }, cleanup: { errors: [] } };
  const evidence = { runId, evidence: users.map(user => ({ planId: user.planId, purchaseStatus: 'complete', grantCount: 1,
    policyVersion: 'jst-calendar-v1', priceId: user.planId === 'monthly' ? 'price_initial' : 'price_pack',
    joinedAt: 1792760000000, expiresAt: 1795359600000, successEventId: 'evt_' + user.planId, subscriptionId: user.subscriptionId || null })) };
  writeFileSync(input + '/state.json', JSON.stringify(state)); writeFileSync(input + '/evidence.json', JSON.stringify(evidence));
  try {
    const result = JSON.parse(execFileSync(process.execPath, [root + 'scripts/prepare-calendar-webhook-probe.mjs', '--prepare-probe', '--state', input + '/state.json', '--evidence', input + '/evidence.json'], { encoding: 'utf8' }));
    assert.equal(result.externalActions, 0); assert.equal(result.fixtureDocuments, 6);
    const env = Object.fromEntries(readFileSync(output + '/functions/.env.construction2nd', 'utf8').trim().split('\n').map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    for (const name of ['BILLING_TESTER_UIDS', 'PRIVATE_CONTENT_ENABLED', 'SITE_URL', 'STRIPE_MONTHLY_PRICE_ID', 'STRIPE_PACK_PRICE_ID', 'STRIPE_PORTAL_CONFIGURATION_ID']) assert.ok(env[name], name);
    assert.equal(env.BILLING_ENABLED, 'false'); assert.equal(env.PRIVATE_CONTENT_ENABLED, 'false');
    assert.ok(!Object.keys(env).some(name => /SECRET|KEY/.test(name)));
    const inspect = `import {registerHooks} from 'node:module'; import assert from 'node:assert/strict';
      registerHooks({resolve(specifier,context,next){if(specifier.startsWith('firebase-')||specifier==='stripe')return next(specifier,{...context,parentURL:${JSON.stringify(new URL('../../functions/index.js', import.meta.url).href)} }); return next(specifier,context);}});
      const module=await import(${JSON.stringify('file://' + output + '/functions/probeEntry.js')});
      assert.deepEqual(Object.keys(module),['calendarBillingWebhookProbe']);
      const endpoint=module.calendarBillingWebhookProbe.__endpoint;
      assert.deepEqual(endpoint.secretEnvironmentVariables.map(s=>s.key).sort(),['CALENDAR_PROBE_WEBHOOK_SECRET','STRIPE_SECRET_KEY']);
      assert.equal(endpoint.maxInstances,1);`;
    execFileSync(process.execPath, ['--input-type=module', '-e', inspect], { encoding: 'utf8' });
  } finally { rmSync(input, { recursive: true, force: true }); rmSync(output, { recursive: true, force: true }); }
});
