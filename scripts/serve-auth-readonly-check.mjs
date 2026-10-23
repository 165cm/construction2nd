// 既存の実認証APIを読む確認画面。購入/Portal/Firestore書込/外部配備は提供しない。
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createReadOnlyContentProbe, AUTH_PROBE_ORIGIN } from './authReadOnlyProbe.js';
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--serve-read-only-check') {
  console.log('未実行。--serve-read-only-check で実ログイン/読取だけの確認画面をlocalhost:5214へ起動。');
  process.exit(args.length ? 1 : 0);
}
// 明示起動前には環境読込/SDK読込/待受をしない。
const { default: http } = await import('node:http');
const { createServer, loadEnv } = await import('vite');
const root = fileURLToPath(new URL('../', import.meta.url));
const env = loadEnv('development', root, 'VITE_FIREBASE_');
const publicConfig = Object.fromEntries(['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'APP_ID'].map((key, index) =>
  [['apiKey', 'authDomain', 'projectId', 'appId'][index], env['VITE_FIREBASE_' + key] || '']));
if (publicConfig.projectId !== 'construction2nd' || !Object.values(publicConfig).every(Boolean)) throw new Error('public-firebase-config-required');
const nonce = randomBytes(32).toString('hex');
const contentProbe = createReadOnlyContentProbe({ nonce });
const vite = await createServer({ configFile: false, envDir: false, base: '/',
  cacheDir: root + '.cache/auth-readonly-vite',
  define: { __AUTH_PROBE_PUBLIC_CONFIG__: JSON.stringify(publicConfig), __AUTH_PROBE_NONCE__: JSON.stringify(nonce) },
  optimizeDeps: { noDiscovery: true, entries: [], include: ['firebase/app', 'firebase/auth', 'firebase/functions'] },
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', fs: { allow: [root] } }, appType: 'custom' });
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>実ログイン・読取確認</title>
<style>*{box-sizing:border-box}body{margin:0;background:#020617;color:#e2e8f0;font:16px/1.8 system-ui}main{max-width:780px;margin:auto;padding:24px 16px}section,aside{padding:18px;border:1px solid #475569;border-radius:14px;margin:16px 0}aside{background:#0c4a6e}button{min-height:48px;font:inherit;padding:10px 18px;margin:6px 8px 6px 0;border:1px solid #64748b;border-radius:10px;background:#0369a1;color:white}button:disabled{opacity:.45}label{display:block;padding:8px}output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:1.5rem}button:focus-visible,input:focus-visible{outline:3px solid #fbbf24}</style>
<main><h1>実ログイン・読取確認</h1><aside>現在の検証サイトへ接続します。購入・課金・学習記録の上書き・教材の編集は行いません。ログイン情報はこの画面のメモリ内で使い、閉じると破棄します。</aside>
<section><h2>確認するアカウント</h2><label><input type="radio" name="kind" value="paid" checked>購入済みのテスト用アカウント</label><label><input type="radio" name="kind" value="free">以前テストした未購入アカウント</label><p id="account">未ログイン</p><button id="login" disabled>Googleでログインして一括確認</button><button id="logout" disabled>この確認画面からログアウト</button></section>
<section><h2>結果</h2><p>ログイン前の拒否、本人の利用権、別UIDを指定しても結果が変わらないこと、教材の許可・拒否をまとめて確認します。</p><output id="results" aria-live="polite">準備中…</output></section>
<p>これは既に配備されているAPIの認証確認です。未配備の新600円購入や3Dセキュア、将来の期限切れの試験とは別です。トークンやパスワードをチャットに貼る必要はありません。</p></main><script type="module" src="/scripts/fixtures/AuthReadOnlyCheck.js"></script></html>`;
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.headers.host !== 'localhost:5214') { res.writeHead(403); res.end(); return; }
    const path = new URL(req.url, AUTH_PROBE_ORIGIN).pathname;
    if (path === '/probe-content') {
      if (req.method !== 'POST' || req.headers.origin !== AUTH_PROBE_ORIGIN || req.headers['x-probe-nonce'] !== nonce) {
        res.writeHead(req.method === 'POST' ? 403 : 405); res.end(); return;
      }
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1024) { res.writeHead(413); res.end(); return; } }
      let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); res.end(); return; }
      const reply = await contentProbe({ method: req.method, origin: req.headers.origin, suppliedNonce: req.headers['x-probe-nonce'], authorization: req.headers.authorization || '', body });
      res.writeHead(reply.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(reply.data)); return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (path === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('X-Frame-Options', 'DENY');
      res.end(req.method === 'HEAD' ? undefined : await vite.transformIndexHtml('/', html)); return;
    }
    if (path.startsWith('/api/') || path.startsWith('/__/') || /(?:^|\/)\.env/.test(path)) { res.writeHead(404); res.end(); return; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  } catch { res.writeHead(500); res.end('Read-only check failed'); }
});
server.listen(5214, '127.0.0.1', () => console.log('実ログイン・読取確認: ' + AUTH_PROBE_ORIGIN));
