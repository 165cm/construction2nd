import test from 'node:test';
import assert from 'node:assert/strict';
import { contentKey, contentHandler } from '../contentAccess.js';
test('年度と画像の許可リスト、パス探索・別年度・配列を拒否', () => {
  assert.equal(contentKey({ exam: 'r7_2' }), 'exams/r7_2.json');
  assert.equal(contentKey({ exam: 'r7_2', asset: 'pages/r7_2/page_15.webp' }), 'assets/pages/r7_2/page_15.webp');
  for (const query of [{exam:'r8_1'}, {exam:['r7_2']}, {exam:'../.env'}, {exam:'r7_2',asset:'pages/r6_1/page_1.png'}, {exam:'r7_2',asset:'pages/r7_2/../../.env'}, {exam:'r7_2',asset:'pages/r7_2/%2e%2e.env'}, {exam:'r7_2',asset:['pages/r7_2/page_1.png']}]) assert.equal(contentKey(query), null);
});
test('認証・期限を検証してから読む。エラー時もキャッシュ禁止', async () => {
  for (const scenario of ['disabled','anonymous','invalid-token','expired','revoked','future','db-error','valid']) {
    let reads = 0;
    const handler = contentHandler({ enabled: () => scenario !== 'disabled', now: () => 150,
      verifyToken: async () => { if (scenario === 'invalid-token') throw Error(); return { uid: 'user' }; },
      getGrants: async uid => { assert.equal(uid, 'user'); if (scenario === 'db-error') throw Error(); return [{ startsAt: scenario === 'future' ? 151 : 100, expiresAt: scenario === 'expired' ? 150 : 200, revoked: scenario === 'revoked' }]; },
      readContent: async () => { reads++; return Buffer.from('private text'); }
    });
    const result = { headers: {}, set(k,v) { this.headers[k] = v; return this; }, status(n) { this.code = n; return this; }, send(body) { this.body = body; return this; } };
    await handler({ method:'GET', query:{exam:'r7_2'}, headers: scenario === 'anonymous' ? {} : {authorization:'Bearer test'} }, result);
    const expected = { disabled:503, anonymous:401, 'invalid-token':401, expired:403, revoked:403, future:403, 'db-error':503, valid:200 };
    assert.equal(result.code, expected[scenario], scenario);
    assert.equal(reads, scenario === 'valid' ? 1 : 0, scenario);
    assert.match(result.headers['Cache-Control'], /no-store/);
  }
});
