import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 無引数/不明引数では鍵取得・外部SDK読込・待受を開始しない。
const guard = `import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
if(specifier==='node:child_process')return {url:'data:text/javascript,export const execFileSync=()=>{throw Error("secret-access-prohibited")}',shortCircuit:true};
if(specifier==='node:http')return {url:'data:text/javascript,export const createServer=()=>{throw Error("listener-prohibited")}',shortCircuit:true};
if(/stripe|firebase-tools|google-cloud/.test(specifier))throw Error('external-sdk-prohibited');
return next(specifier,context);
}});`;
for (const name of ['verify-calendar-checkout-integration.mjs', 'prepare-calendar-webhook-probe.mjs', 'calendar-webhook-probe-fixture.mjs']) {
const script = fileURLToPath(new URL('../scripts/' + name, import.meta.url));
for (const [label, args, status] of [['no arguments', [], 0], ['unknown argument', ['--run'], 1], ['mixed flags', ['--run-calendar-integration', '--state', '/tmp/no.json'], 1]]) {
  test(`${name} explicit opt-in: ${label}`, () => {
    const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(guard), script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr);
    assert.match(result.stdout, /未実行/); assert.doesNotMatch(result.stderr, /prohibited/);
  });
}

}
