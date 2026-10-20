import assert from 'node:assert/strict';

// 実行を明示した場合だけ、検証サイトへ読み取り専用のリクエストを送る。
if (!process.argv.includes('--run-read-only-check')) {
  console.log('No requests sent. Use --run-read-only-check to verify the test site.');
  process.exit(0);
}
const origin = 'https://construction2nd.web.app';
const direct = 'https://asia-northeast1-construction2nd.cloudfunctions.net/privateContent';
const exams = ['r7_2', 'r7_1', 'r6_2', 'r6_1'];
let count = 0;
const request = (url, options = {}) => fetch(url, { signal: AbortSignal.timeout(30000), ...options });
async function protectedRequest(label, path, expected, options = {}) {
  const url = path.startsWith('https:') ? path : origin + path;
  const response = await request(url, { ...options, redirect: 'error', cache: 'no-store' });
  assert.equal(response.status, expected, label);
  assert.match(response.headers.get('cache-control') || '', /private/);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.match(response.headers.get('vary') || '', /authorization/i);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  // エラー応答に教材や画像が混ざっていないこと。
  const body = await response.text();
  assert.ok(['Sign in required', 'Not found', 'Method not allowed'].includes(body), label);
  count++;
  console.log(`PASS ${label}: HTTP ${expected}, no-store`);
}
for (const exam of exams) {
  await protectedRequest(`anonymous JSON ${exam}`, `/api/content?exam=${exam}`, 401);
  await protectedRequest(`anonymous image ${exam}`, `/api/content?exam=${exam}&asset=pages/${exam}/page_15.webp`, 401);
}
await protectedRequest('invalid token', '/api/content?exam=r7_2', 401, { headers: { Authorization: 'Bearer invalid-test-token' } });
const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
const unsigned = `${encode({alg:'none',typ:'JWT'})}.${encode({sub:'delivery-test-other-account',uid:'delivery-test-other-account',exp:Math.floor(Date.now()/1000)+3600})}.unsigned`;
await protectedRequest('forged UID token', '/api/content?exam=r7_2&uid=delivery-test-paid-account', 401, { headers: { Authorization: `Bearer ${unsigned}` } });
await protectedRequest('UID query without token', '/api/content?exam=r7_2&uid=delivery-test-paid-account', 401);
await protectedRequest('token in query is not authorization', '/api/content?exam=r7_2&token=invalid-test-token', 401);
await protectedRequest('unknown exam', '/api/content?exam=unknown', 404);
await protectedRequest('cross-exam asset', '/api/content?exam=r7_2&asset=pages/r6_1/page_15.webp', 404);
await protectedRequest('path traversal', '/api/content?exam=r7_2&asset=pages/r7_2/../../manifest.json', 404);
await protectedRequest('duplicate exam parameters', '/api/content?exam=r7_2&exam=r6_1', 404);
await protectedRequest('unsupported method', '/api/content?exam=r7_2', 405, { method:'POST' });
await protectedRequest('direct function anonymous', `${direct}?exam=r7_2`, 401);
const html = await (await request(origin + '/index.html', {cache:'no-store'})).text();
for (const exam of exams) {
  for (const path of [`/pages/${exam}/page_15.webp`, `/crops/${exam}/floor_plan.png`, `/choices/${exam}/48.webp`]) {
    const response = await request(origin + path, {cache:'no-store',redirect:'error'});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.equal(await response.text(), html, `SPA fallback only: ${path}`);
    count++;
    console.log(`PASS static asset ${path}: app HTML only, no image`);
  }
}
for (const path of ['/private-content/manifest.json','/private-content/exams/r7_2.json','/exams/r7_2.json','/src/data/exams/r7_2.json']) {
  const response = await request(origin + path, {cache:'no-store',redirect:'error'});
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  assert.equal(await response.text(), html);
  count++;
  console.log(`PASS private file ${path}: app HTML only`);
}
console.log(`PASS: ${count} read-only deployed delivery checks. Valid other-account tokens and authenticated browser caches require separate verification.`);
