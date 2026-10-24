import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadOnlyContentProbe, AUTH_PROBE_ORIGIN, AUTH_PROBE_CONTENT_URL } from '../scripts/authReadOnlyProbe.js';
const nonce = 'a'.repeat(64);
const request = { method: 'POST', origin: AUTH_PROBE_ORIGIN, suppliedNonce: nonce, body: { forgedUid: false } };
test('明示したlocalhost/nonce/POST以外は外部へ送らない', async () => {
  let sent = 0;
  const probe = createReadOnlyContentProbe({ nonce, fetcher: async () => { sent++; throw Error('must-not-send'); } });
  for (const override of [{ method: 'GET' }, { origin: 'https://example.invalid' }, { origin: 'http://localhost:9999' },
    { suppliedNonce: 'wrong' }, { body: { forgedUid: false, url: 'https://example.invalid' } }, { body: { forgedUid: 'other' } },
    { authorization: 'Bearer one two' }, { authorization: 'a'.repeat(8193) }]) {
    assert.ok([400, 403, 405].includes((await probe({ ...request, ...override })).status));
  }
  assert.equal(sent, 0);
});
test('宛先・年度・GETを固定し、教材本文とトークンを返さず構造/期限だけを返す', async () => {
  const token = 'Bearer private-token-never-returned';
  const probe = createReadOnlyContentProbe({ nonce, fetcher: async (url, options) => {
    assert.equal(url.origin + url.pathname, AUTH_PROBE_CONTENT_URL); assert.equal(url.searchParams.get('exam'), 'r7_2');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { Authorization: token });
    return new Response(JSON.stringify({ examId: 'r7_2', questions: Array.from({ length: 50 }, () => ({ question: 'PAID-CONTENT' })), assets: ['private.webp'] }), {
      status: 200, headers: { 'cache-control': 'private, no-store', vary: 'Authorization', 'x-access-expires-at': '1795000000000', 'x-server-time': '1790000000000' },
    });
  } });
  const reply = await probe({ ...request, authorization: token });
  assert.deepEqual(reply, { status: 200, data: { status: 200, noStore: true, variesByAuthorization: true,
    examMatches: true, questionCount: 50, expiresAt: 1795000000000, serverTime: 1790000000000 } });
  assert.doesNotMatch(JSON.stringify(reply), /private-token|PAID-CONTENT|private.webp/);
});
test('UID偽装値は固定の架空値だけで、任意UIDや任意URLを転送しない', async () => {
  const probe = createReadOnlyContentProbe({ nonce, fetcher: async (url, options) => {
    assert.equal(url.searchParams.get('uid'), 'read-only-probe-untrusted-uid');
    assert.deepEqual(options.headers, {});
    return new Response('sensitive error text', { status: 401, headers: { 'cache-control': 'no-store', vary: 'authorization' } });
  } });
  const reply = await probe({ ...request, body: { forgedUid: true } });
  assert.deepEqual(reply.data, { status: 401, noStore: true, variesByAuthorization: true });
});
test('未購入403は本文を破棄し、許可された教材取得と区別する', async () => {
  let canceled = false;
  const probe = createReadOnlyContentProbe({ nonce, fetcher: async () => ({ status: 403,
    headers: new Headers({ 'cache-control': 'private, no-store', vary: 'Authorization' }), body: { cancel: async () => { canceled = true; } } }) });
  assert.equal((await probe(request)).data.status, 403); assert.equal(canceled, true);
});
