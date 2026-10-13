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

1. Cloudflare の管理画面の左メニューから **Turnstile** を開き、「サイトを追加（Add widget）」を押します
2. 名前：`denkou2-objection`（なんでもよい）
3. ホスト名：`165cm.github.io`
4. ウィジェットモード：**管理（Managed）** または **非表示（Invisible）**
5. 作成すると **サイトキー** と **シークレットキー** が出ます
   - サイトキー … 公開してよい値。あとでチャットで教えてください
   - シークレットキー … 秘密。手順4で Cloudflare に入力します（チャットには貼らない）

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
4. Worker の **設定（Settings）→ 変数とシークレット（Variables and Secrets）** で、次の4つを追加します

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

## メモ

- 報告は、リポジトリが公開のあいだは誰でも見られます（アプリ側に「個人情報は書かないで」と表示しています）。リポジトリを非公開にすると issue も非公開になります。非公開にしても、トークンの設定はそのままで動きます
- `worker.js` を直したときは、手順4-3と同じように貼り付け直してデプロイします
- 無料枠：Workers は1日10万回まで。Turnstile は無料
