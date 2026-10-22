import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { render, layout } from './serve-legal-preview.mjs';

if (!process.argv.includes('--serve-local-preview')) {
  console.log('No server started. Use --serve-local-preview, then open http://127.0.0.1:5211/ .');
  process.exit(0);
}
const files = { '/terms.html': ['利用規約', 'TERMS_REVIEW.md'], '/privacy.html': ['プライバシーポリシー', 'PRIVACY_REVIEW.md'], '/trade.html': ['特定商取引法に基づく表記', 'TRADE_REVIEW.md'] };
const page = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>購入前確認・未公開プレビュー</title>
<style>*{box-sizing:border-box}body{margin:0;background:#020617;color:#f1f5f9;font:16px/1.8 system-ui,sans-serif}main{max-width:800px;margin:auto;padding:24px 16px}article{padding:20px;border:1px solid #334155;background:#0f172a;border-radius:18px}.preview-notice{padding:16px;background:#451a03;border:1px solid #92400e;border-radius:12px}.preview-notice p{margin:4px 0}.preview-controls{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.preview-controls button{min-height:44px;background:#1e293b;color:white;border:1px solid #64748b;border-radius:8px;padding:8px 12px;font:inherit}button:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}@media(max-width:480px){main{padding:12px}article{padding:16px}}</style></head><body><div id="root"></div><script type="module" src="/scripts/fixtures/PurchasePreview.jsx"></script></body></html>`;
// 通常の開発設定（管理画面の書込み口・環境ファイル・proxy）は使用しない。
const vite = await createServer({ configFile: false, envDir: false, cacheDir: new URL('../.cache/purchase-preview-vite/', import.meta.url).pathname, plugins: [react()], base: '/',
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1' },
  optimizeDeps: { noDiscovery: true, entries: [], include: ['react', 'react-dom/client', 'react/jsx-runtime'] }, appType: 'custom' });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/viewport') {
      const sizes = { phone: [390, 844], landscape: [844, 390], desktop: [1280, 800] };
      const [width, height] = sizes[url.searchParams.get('size')] || sizes.phone;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>購入確認の画面サイズ確認</title><style>body{background:#020617;color:#fff;font:16px system-ui;margin:16px}a{display:inline-block;padding:12px;color:#7dd3fc}iframe{display:block;border:1px solid #64748b;background:#020617}</style><nav><a href="/viewport?size=phone">スマホ縦</a><a href="/viewport?size=landscape">スマホ横</a><a href="/viewport?size=desktop">PC</a><a href="/">通常表示</a></nav><p>${width} × ${height} の表示確認（実端末の確認とは別です）</p><iframe title="購入確認の表示" src="/" width="${width}" height="${height}"></iframe></html>`);
      return;
    }
    if (path === '/' || files[path]) {
      const html = path === '/' ? await vite.transformIndexHtml('/', page) : layout(files[path][0], render(await readFile(new URL(`../docs/legal/${files[path][1]}`, import.meta.url), 'utf8')), path);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
      res.end(req.method === 'HEAD' ? undefined : html); return;
    }
    if (path.startsWith('/api/') || path.startsWith('/__/')) { res.writeHead(404); res.end(); return; }
    vite.middlewares(req, res, () => { res.writeHead(404); res.end(); });
  } catch { res.writeHead(500); res.end('Preview unavailable'); }
});
server.listen(5211, '127.0.0.1', () => console.log('Local purchase preview: http://127.0.0.1:5211/'));
