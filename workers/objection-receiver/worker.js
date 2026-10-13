// 「この問題に異議あり！」の受付窓口（Cloudflare Workers）
//
// アプリから届いた報告を確かめてから、GitHub の issue として登録する。
//   アプリ → (Turnstile のロボット確認) → この Worker → GitHub の issue（ラベル「異議あり」）
//
// Cloudflare の管理画面で設定する値（Settings → Variables and Secrets）
//   GITHUB_TOKEN     … 秘密（Secret）。issue を作る権限だけの GitHub トークン
//   TURNSTILE_SECRET … 秘密（Secret）。Turnstile のシークレットキー
//   GITHUB_REPO      … 例: 165cm/construction2nd
//   ALLOWED_ORIGIN   … 例: https://165cm.github.io （カンマ区切りで複数可）
//
// 依存ライブラリなし。この1ファイルを Cloudflare の管理画面のエディタに貼り付ければ動く。

const MAX_COMMENT = 500;
const MAX_TEXT = 2000;

const CATEGORY_LABELS = {
  choice_text: '選択肢の文字・数字が違う',
  wrong_answer: '正解が間違っている気がする',
  diagram_issue: '図面・写真がずれている / 違う',
  explanation_typo: '解説に誤字・わかりにくい点がある',
  other: 'その他'
};

const allowedOrigins = (env) => String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);

const corsHeaders = (origin, env) => {
  const ok = allowedOrigins(env).includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
};

const json = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

// 利用者の文字を issue に安全に載せる。
// @メンション・#番号リンクを無効化し、Markdown の記号（リンク・画像・見出し・強調・HTML など）はすべてエスケープする
const sanitize = (value, max) =>
  String(value ?? '')
    .slice(0, max)
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/@/g, '＠')
    .replace(/#/g, '＃')
    .replace(/`/g, '｀')
    .replace(/[\\*_[\]()<>!|~{}+\-=.:&]/g, (c) => `\\${c}`);

// 1行で載せる値（改行を空白にする）
const oneLine = (value, max) => sanitize(value, max).replace(/\n+/g, ' ');

// 引用ブロックとして載せる（各行の先頭に > を付け、引用の外に出られないようにする）。
// 行と行の間に空の引用行をはさみ、GitHub でも1行ずつ表示されるようにする
const quote = (text) => (text ? text.split('\n').map((l) => `> ${l}`).join('\n>\n') : '> （コメントなし）');

// ロボット確認の結果。失敗した時は Cloudflare が返す理由（例: invalid-input-secret）も返す
const verifyTurnstile = async (token, ip, env) => {
  if (!token) return { ok: false, codes: ['missing-input-response'] };
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  return { ok: data.success === true, codes: data['error-codes'] || [] };
};

const buildIssue = (r) => {
  const examName = oneLine(r.examName, 40);
  const examId = String(r.examId ?? '').slice(0, 20).replace(/[^a-z0-9_]/g, '');
  const number = Number.parseInt(r.questionNumber, 10);
  const categoryLabel = CATEGORY_LABELS[r.category] || 'その他';
  const comment = sanitize(r.comment, MAX_COMMENT).trim();
  const snap = r.questionSnapshot || {};
  const choices = Array.isArray(snap.choices)
    ? snap.choices.slice(0, 4).map((c) => `> - ${oneLine(c?.id, 2)}：${oneLine(c?.text, 200)}`).join('\n')
    : '';

  const title = `【異議あり】${examName} 問${Number.isFinite(number) ? number : '?'}：${categoryLabel}`;
  const body = [
    '利用者からの「この問題に異議あり！」の報告です（内容は未確認）。',
    '',
    `- 年度：${examName}（${examId}）`,
    `- 問題番号：問${Number.isFinite(number) ? number : '?'}`,
    `- 種類：${categoryLabel}`,
    '',
    '### 利用者のコメント',
    quote(comment),
    '',
    '### 報告時点の問題（アプリの表示内容）',
    quote(sanitize(snap.question, MAX_TEXT)),
    '',
    choices,
    '',
    `- アプリ上の正解：${oneLine(snap.answer, 2) || '不明'}`,
    '',
    '---',
    '原本（電気技術者試験センターの公表問題）と照らし合わせて確認してください。直す場合は、管理画面で修正 → 反映用データ → PR の流れで反映します。'
  ].join('\n');

  return { title, body, labels: ['異議あり', examId].filter(Boolean) };
};

const githubHeaders = (env) => ({
  Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'denkou2-objection-receiver',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json'
});

const LABEL_COLORS = { 異議あり: 'f59e0b' };

// 使うラベルが無ければ作る（「既にある」エラーは無視）
const ensureLabels = async (labels, env) => {
  await Promise.all(labels.map((name) =>
    fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/labels`, {
      method: 'POST',
      headers: githubHeaders(env),
      body: JSON.stringify({ name, color: LABEL_COLORS[name] || '64748b' })
    }).catch(() => null)
  ));
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only' }, cors);
    if (!allowedOrigins(env).includes(origin)) return json(403, { ok: false, error: 'origin not allowed' }, cors);

    let report;
    try {
      report = await request.json();
    } catch (e) {
      return json(400, { ok: false, error: 'invalid json' }, cors);
    }
    if (!report || typeof report !== 'object' || !CATEGORY_LABELS[report.category]) {
      return json(400, { ok: false, error: 'invalid report' }, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const human = await verifyTurnstile(report.turnstileToken, ip, env);
    if (!human.ok) {
      // invalid-input-secret なら TURNSTILE_SECRET の値が違う（Site Key と取り違えやすい）
      console.log('turnstile failed:', human.codes.join(','));
      return json(403, { ok: false, error: `turnstile failed: ${human.codes.join(',') || 'unknown'}` }, cors);
    }

    const issue = buildIssue(report);
    // ラベルが無いと issue に付かないため、先に作っておく（既にあればそのまま）
    await ensureLabels(issue.labels, env);
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: githubHeaders(env),
      body: JSON.stringify(issue)
    });
    if (!res.ok) {
      // 401 ならトークンが違う／期限切れ、403・404 なら権限やリポジトリ名（GITHUB_REPO）を確認
      console.log('github error:', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return json(502, { ok: false, error: `github error ${res.status}` }, cors);
    }
    const created = await res.json().catch(() => ({}));
    return json(200, { ok: true, number: created.number }, cors);
  }
};
