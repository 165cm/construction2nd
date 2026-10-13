# 「異議あり」受付窓口（Cloudflare Workers）の準備手順

アプリの「⚡️ この問題に異議あり！」から届いた報告を、GitHub の issue（ラベル「異議あり」）に自動で登録するための受付窓口です。

```
アプリ → Turnstile（ロボット確認） → この受付窓口（worker.js） → GitHub の issue
```

最初に1回だけ準備します。**秘密の値（トークン・シークレットキー）はチャットに貼らず、Cloudflare の画面に直接入力してください。**

---

## 1. Cloudflare のアカウントを作る

1. https://dash.cloudflare.com/sign-up を開いて、メールアドレスで登録します（無料プランで足ります）

## 2. Turnstile（ロボット確認）のキーを作る

1. Cloudflare の管理画面の左メニューから **Application security → Turnstile** を開き、右上の **「Add widget manually」** を押します（「Set up with Spin」でも作れますが、手動のほうが方式を選べて分かりやすい）
2. Widget name：`denkou2-objection`（なんでもよい）
3. Domains：`165cm.github.io` と入力して Enter（ホスト名のこと）
4. Widget Mode：**Managed**（ほとんどの人は操作不要で、怪しい時だけ確認が出る）
5. 作成すると **Site Key（サイトキー）** と **Secret Key（シークレットキー）** が出ます
   - サイトキー … 公開してよい値。あとでチャットで教えてください
   - シークレットキー … 秘密。手順4で Cloudflare に入力します（チャットには貼らない）
   - ⚠️ **2つを取り違えやすい**ので注意。`TURNSTILE_SECRET` に入れるのは Secret Key のほう。コピーボタンでコピーすると前後に空白が入らない

## 3. GitHub のトークン（issue を作る権限だけ）を作る

1. https://github.com/settings/personal-access-tokens/new を開きます（Fine-grained token）
2. Token name：`denkou2-objection`
3. Expiration（有効期限）：1年など
4. Repository access：**Only select repositories** → `165cm/construction2nd` だけを選ぶ
5. Permissions → Repository permissions → **Issues：Read and write** だけを選ぶ
6. 「Generate token」を押して表示された値をコピーします（秘密。チャットには貼らない）

## 4. 受付窓口（Worker）を作る

1. Cloudflare の管理画面の左メニューから **Workers & Pages** → 「作成（Create）」→ 「Worker を作成」
2. 名前：`objection-receiver` → 「デプロイ（Deploy）」
3. 「コードを編集（Edit code）」を押し、中身をすべて消して、このフォルダの `worker.js` の中身を貼り付け → 「デプロイ」
4. Worker の **Settings → Variables and Secrets** の「Add」で、次の4つを追加します（秘密の2つは Value 欄の右の **Secret にチェック**）

   | 名前 | 種類 | 値 |
   |---|---|---|
   | `GITHUB_TOKEN` | シークレット（Secret） | 手順3のトークン |
   | `TURNSTILE_SECRET` | シークレット（Secret） | 手順2のシークレットキー |
   | `GITHUB_REPO` | テキスト | `165cm/construction2nd` |
   | `ALLOWED_ORIGIN` | テキスト | `https://165cm.github.io` |

5. Worker の URL（例：`https://objection-receiver.xxxx.workers.dev`）を控えます

## 5. AI に伝える

次の2つをチャットで伝えてください（どちらも公開してよい値です）。AI が `src/config/objectionReport.js` に設定して PR を作ります。

- Worker の URL
- Turnstile のサイトキー

公開されると、アプリの「異議あり」から送った報告が GitHub の issue に「異議あり」ラベル付きで届きます。

---

## うまく届かない時

アプリの「送信できませんでした」の下に「理由」が出ます。Cloudflare の Worker の **Observability → Invocations** で POST の行を開くと、同じ理由がログに残っています。

| 理由 | 原因と直し方 |
|---|---|
| `turnstile failed: invalid-input-secret` | `TURNSTILE_SECRET` の値が違う。Turnstile の画面で Secret Key をコピーし直して上書き |
| `turnstile failed: timeout-or-duplicate` | ロボット確認の期限切れ。画面を開き直してもう一度送る |
| `origin not allowed` | `ALLOWED_ORIGIN` が `https://165cm.github.io` と完全に同じか（最後に `/` を付けない） |
| `github error 401` | `GITHUB_TOKEN` が違う・期限切れ。トークンを作り直して上書き |
| `github error 403` / `404` | トークンの権限（Issues: Read and write、対象リポジトリ）か `GITHUB_REPO` の値を確認 |

## メモ

- 報告は、リポジトリが公開のあいだは誰でも見られます（アプリ側に「個人情報は書かないで」と表示しています）。リポジトリを非公開にすると issue も非公開になります。非公開にしても、トークンの設定はそのままで動きます
- `worker.js` を直したときは、Cloudflare の Worker の画面で「Edit code」を押し、中身を新しい `worker.js` に貼り替えて「Deploy」します（設定した4つの値はそのまま残ります）
- ラベル「異議あり」と年度ID（`r8_1` など）は、無ければ Worker が自動で作ります
- 無料枠：Workers は1日10万回まで。Turnstile は無料
