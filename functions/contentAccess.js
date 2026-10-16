import { accessSummary } from './billingPolicy.js';

const PAID_EXAMS = new Set(['r7_2', 'r7_1', 'r6_2', 'r6_1']);
export function contentKey(query) {
  if (typeof query.exam !== 'string' || !PAID_EXAMS.has(query.exam)) return null;
  if (query.asset === undefined) return `exams/${query.exam}.json`;
  if (typeof query.asset !== 'string' || !/^(pages|crops|choices)\/(r7_2|r7_1|r6_2|r6_1)\/[a-zA-Z0-9_-]+\.(png|webp)$/.test(query.asset)) return null;
  return query.asset.split('/')[1] === query.exam ? `assets/${query.asset}` : null;
}
// 外部接続を注入し、認証失敗・期限・未知パスを配信前に検証する。
export function contentHandler({ enabled, verifyToken, getGrants, readContent, now = Date.now }) {
  return async (req, res) => {
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.set('Vary', 'Authorization');
    res.set('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') return res.status(405).send('Method not allowed');
    if (!enabled()) return res.status(503).send('Not available');
    const key = contentKey(req.query);
    if (!key) return res.status(404).send('Not found');
    const match = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '');
    if (!match) return res.status(401).send('Sign in required');
    let user;
    try { user = await verifyToken(match[1]); } catch { return res.status(401).send('Sign in required'); }
    try {
      if (!user?.uid || !accessSummary(await getGrants(user.uid), now()).hasAccess) return res.status(403).send('Access expired');
      const content = await readContent(key);
      if (!content) return res.status(404).send('Not found');
      res.set('Content-Type', key.endsWith('.json') ? 'application/json; charset=utf-8' : key.endsWith('.webp') ? 'image/webp' : 'image/png');
      return res.status(200).send(content);
    } catch { return res.status(503).send('Please retry'); }
  };
}
