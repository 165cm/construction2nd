# Firebase接続の準備

2026-10-16：ユーザーがプロジェクト `construction2nd` とWebアプリを作成。受領した公開設定をGit対象外の `.env.local` に保存し、ビルド成功。Googleログインはユーザーが有効化済み。サポートアドレスは `construction2nd-support@googlegroups.com`。Firestoreはユーザーより作成済みの連絡。CLIで実環境を確認済み：`(default)` / Standard / Firestore Native / `asia-northeast1`。ユーザー承認後、本人限定Firestoreルールを実環境へ反映済み。アプリでの実ログイン・本人の保存/復元確認は未実施。本番サイトの設定・デプロイは未実施。購入受付は引き続き無効。

## このPRで用意したもの

- Googleログイン・ログアウト。Firebase SDKはアカウント画面を開いた時だけ読む。
- 明示的な操作でクラウドへバックアップ／端末へ復元。ログインだけでは端末の記録を送信しない。
- 書き換え前の確認、他端末との更新競合検知、本人以外のアクセス拒否。
- 利用権はクライアントから書込不可。決済・有料問題配信は別PR。
- クラウド保存は最大800KB。超える場合は従来のファイル書出しを案内する。模試履歴の本文を含むため大量の結果は上限に達し得る。自動同期・履歴の分割保存は後続対応。

## 運営者が行う準備

1. Firebaseコンソールで専用プロジェクトを作成する。プロジェクトIDを共有する（秘密鍵は共有しない）。
2. Webアプリを登録する。AuthenticationでGoogleを有効にし、サポートメールを設定する。
3. FirestoreのStandard editionを本番モードで作る。データ保存場所は公開前に決める（東京を候補）。あとから簡単には変えられないため選択画面で確認する。
4. Authenticationの承認済みドメインに検証用・公開用ドメインを登録する。独自ドメイン取得前はFirebase Hostingのドメインを使える。
5. Webアプリの公開設定をローカルの `.env.local` に入れる。これはGitに含めない。

```dotenv
VITE_FIREBASE_API_KEY=Webアプリの公開APIキー
VITE_FIREBASE_AUTH_DOMAIN=プロジェクトID.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=プロジェクトID
VITE_FIREBASE_APP_ID=WebアプリID
```

サービスアカウントJSON、Stripe秘密鍵、パスワードはフロントに入れない。Firebaseの公開設定は秘密鍵ではなく、アクセス制限はSecurity Rulesで行う。

6. リポジトリの権限ルールをデプロイし、テスト用アカウント2つで読み書き・ログアウト・別端末の競合を確認する。公開前には通常のPR承認を得る。

```sh
npx firebase deploy --only firestore:rules --project 実際のプロジェクトID
```

料金設定はまだ行わない。Cloud Functionsと決済の実装時には請求設定が別途必要。

## 開発者の検証

Java 21以降が必要。テストは `demo-construction2nd` のローカルエミュレータのみを使い、本番へアクセスしない。

```sh
npm run test:firebase
```

未ログイン・別ユーザーを拒否、本人の読書きを許可、古い版からの上書き・利用権改ざん・非公開問題への直接アクセスを拒否するテストを用意。

SDKのNode用通信依存 `@grpc/grpc-js` は修正版1.14.6に固定。開発用firebase-toolsの間接依存には監査警告が残るため、CLIを外部に公開するサーバーとして使わず、上流の修正を追う。

## 一次資料

- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/firestore/manage-data/transactions
- https://firebase.google.com/docs/rules/unit-tests

## 最初に準備する範囲（2026-10-16）

まず専用プロジェクトを作成し、プロジェクトIDだけ共有する。Google Analyticsは今回は任意でオフのままでよい。請求先の登録・Firestore作成・秘密鍵の設定は続く手順で行う。Functionsを公開する段階ではBlazeプランが必要だが、プロジェクト作成だけなら先に進められる。

公式手順：https://firebase.google.com/docs/web/setup ／ https://firebase.google.com/docs/functions/get-started

## 次の接続作業

Firebase CLIログイン済み。`firestore:databases:list --project construction2nd` で対象DBの構成を読み取り確認した。ユーザーの承認を受け、`npx firebase deploy --only firestore:rules --project construction2nd --non-interactive` を実行。ルールのコンパイル・リリース・完了を確認。サイト・Functions・課金は変更していない。次は実アカウントのログインと本人の保存/復元確認。

反映後、未ログインのFirestore REST読取がHTTP 403（PERMISSION_DENIED）となることを確認。検証でドキュメントは作成していない。本人アクセス/別ユーザーアクセスの実認証検証は次の段階。
