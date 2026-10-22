import http from 'node:http';
import { readFile } from 'node:fs/promises';

// docs内の掲載案だけを表示するローカル確認用。公開用HTMLは生成しない。
const pages = {
  '/terms.html': ['利用規約', 'TERMS_REVIEW.md'],
  '/privacy.html': ['プライバシーポリシー', 'PRIVACY_REVIEW.md'],
  '/trade.html': ['特定商取引法に基づく表記', 'TRADE_REVIEW.md'],
};
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const fileLinks = Object.fromEntries(Object.entries(pages).map(([path, [, file]]) => [file, path]));
function inline(text) {
  return escape(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    if (fileLinks[href]) return `<a href="${fileLinks[href]}">${label}</a>`;
    // 内部の作業資料や外部サービスへ意図せず移動させない。
    return label;
  }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
// 掲載案で使う見出し・段落・表だけを扱う。元文書のHTMLは実行しない。
function render(source) {
  const lines = source.trim().split(/\r?\n/);
  let html = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) rows.push(lines[i++].trim());
      i--;
      html += '<div class="table-scroll" role="region" aria-label="掲載内容の表" tabindex="0"><table>';
      for (let row = 0; row < rows.length; row++) {
        if (/^\|[\s:|-]+\|$/.test(rows[row])) continue;
        const tag = row === 0 ? 'th' : 'td';
        html += '<tr>' + rows[row].slice(1, -1).split('|').map(cell =>
          `<${tag}${tag === 'th' ? ' scope="col"' : ''}${/掲載保留|掲載前|要確定|確認日/.test(cell) ? ' class="pending"' : ''}>${inline(cell.trim())}</${tag}>`).join('') + '</tr>';
      }
      html += '</table></div>';
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 2);
      html += `<h${level}>${inline(heading[2])}</h${level}>`;
    } else {
      let paragraph = line;
      while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#|\|)/.test(lines[i + 1])) paragraph += ' ' + lines[++i].trim();
      html += `<p${/掲載保留|掲載前|要確定|候補文|未公開/.test(paragraph) ? ' class="pending"' : ''}>${inline(paragraph)}</p>`;
    }
  }
  return html;
}
function layout(title, body, active = '') {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escape(title)}・確認版 | 電工2種サクサク道場</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#020617;color:#f1f5f9;font:16px/1.85 system-ui,sans-serif}
main{max-width:840px;margin:auto;padding:24px 20px max(48px,env(safe-area-inset-bottom))}
.notice{padding:16px;border:1px solid #b45309;border-radius:14px;background:#451a03;color:#fef3c7}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}a{color:#7dd3fc;overflow-wrap:anywhere;text-underline-offset:4px}
nav a{display:inline-flex;align-items:center;min-height:44px;padding:8px 14px;border:1px solid #475569;border-radius:10px;text-decoration:none}
nav a[aria-current]{background:#075985;color:white}a:focus-visible,.table-scroll:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
article{padding:20px;background:#0f172a;border:1px solid #334155;border-radius:18px}h1{font-size:1.7rem;line-height:1.5;margin:4px 0 22px}
h2,h3{font-size:1.15rem;margin:30px 0 10px}p{margin:12px 0;overflow-wrap:anywhere}.pending{padding:12px;border-left:3px solid #fbbf24;background:#451a034d}
.table-scroll{max-width:100%;overflow-x:auto;margin:20px 0}table{border-collapse:collapse;width:100%;min-width:520px}
th,td{border:1px solid #475569;padding:12px;vertical-align:top;text-align:left}th{background:#1e293b}td:first-child{min-width:140px}
footer{color:#94a3b8;margin-top:24px;font-size:.9rem}@media(max-width:480px){main{padding-inline:12px}article{padding:16px}h1{font-size:1.45rem}}
</style></head><body><main><aside class="notice" aria-label="確認版の注意"><strong>未公開の確認版</strong><br>
公開前の確認事項を含みます。販売開始や契約条件の確定を示す画面ではありません。黄色の箇所は確認中です。</aside>
<nav aria-label="確認するページ"><a href="/">一覧</a>${Object.entries(pages).map(([path, [name]]) => `<a href="${path}"${path === active ? ' aria-current="page"' : ''}>${name}</a>`).join('')}</nav>
<article>${body}</article><footer>電工2種サクサク道場 運営<br>この確認画面から購入・ログイン・メール送信は行いません。</footer></main></body></html>`;
}

if (!process.argv.includes('--serve-local-preview')) {
  console.log('No server started. Use --serve-local-preview to view the drafts at http://127.0.0.1:5210/ .');
} else {
  http.createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
      let html;
      if (path === '/') html = layout('公開前の表示確認', '<h1>公開前の表示確認</h1><p>上のボタンから3ページを確認できます。スマホでも読みやすい文字と表で表示します。</p><p>本文の修正は元の掲載案に反映すると、この画面にも反映されます。</p>');
      else if (pages[path]) {
        const [title, file] = pages[path];
        html = layout(title, render(await readFile(new URL(`../docs/legal/${file}`, import.meta.url), 'utf8')), path);
      } else { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
      response.end(request.method === 'HEAD' ? undefined : html);
    } catch { response.writeHead(500); response.end('Preview unavailable'); }
  }).listen(5210, '127.0.0.1', () => console.log('Local draft preview: http://127.0.0.1:5210/'));
}
