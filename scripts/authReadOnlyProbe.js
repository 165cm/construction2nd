// 実認証確認用の固定先プロキシ。教材本文/認証トークンは返却・保存しない。
export const AUTH_PROBE_ORIGIN = 'http://localhost:5214';
export const AUTH_PROBE_CONTENT_URL = 'https://construction2nd.web.app/api/content';
export function createReadOnlyContentProbe({ nonce, fetcher = fetch }) {
  if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) throw new Error('invalid-probe-nonce');
  return async ({ method, origin, suppliedNonce, authorization = '', body }) => {
    if (method !== 'POST') return { status: 405, data: { error: 'method' } };
    if (origin !== AUTH_PROBE_ORIGIN || suppliedNonce !== nonce) return { status: 403, data: { error: 'origin' } };
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => key !== 'forgedUid') || typeof body.forgedUid !== 'boolean'
      || typeof authorization !== 'string' || authorization.length > 8192
      || (authorization && !/^Bearer [^\s]+$/.test(authorization))) return { status: 400, data: { error: 'request' } };
    const url = new URL(AUTH_PROBE_CONTENT_URL);
    url.searchParams.set('exam', 'r7_2');
    if (body.forgedUid) url.searchParams.set('uid', 'read-only-probe-untrusted-uid');
    const response = await fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(30000), headers: authorization ? { Authorization: authorization } : {} });
    const data = { status: response.status, noStore: /no-store/.test(response.headers.get('cache-control') || ''),
      variesByAuthorization: /authorization/i.test(response.headers.get('vary') || '') };
    if (response.status === 200) {
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 2 * 1024 * 1024) throw new Error('unexpected-content-size');
      // 本文はメモリ内で構造を確認し破棄。画像や教材本文をブラウザへ転送しない。
      const content = await response.json();
      data.examMatches = content.examId === 'r7_2';
      data.questionCount = Array.isArray(content.questions) ? content.questions.length : 0;
      data.expiresAt = Number(response.headers.get('x-access-expires-at'));
      data.serverTime = Number(response.headers.get('x-server-time'));
    } else {
      await response.body?.cancel();
    }
    return { status: 200, data };
  };
}
