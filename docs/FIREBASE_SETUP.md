# Firebase接続の設定と検証記録

**現在（2026-10-21）**：Googleログイン、本人のクラウド保存/復元、別Googleアカウントの選択、既存記録の読取分離は本人実機で確認済み。Firestoreルールは反映済み。保存競合・別人の書込拒否は専用エミュレータで確認し、本番2端末同時保存は未確認。以下の「未確認/未接続」は当時の記録。現状は [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) を優先する。

## 初期接続時の経緯（2026-10-16）

2026-10-16：ユーザーがプロジェクト `construction2nd` とWebアプリを作成。受領した公開設定をGit対象外の `.env.local` に保存し、ビルド成功。Googleログインはユーザーが有効化済み。サポートアドレスは `construction2nd-support@googlegroups.com`。Firestoreはユーザーより作成済みの連絡。CLIで実環境を確認済み：`(default)` / Standard / Firestore Native / `asia-northeast1`。ユーザー承認後、本人限定Firestoreルールを実環境へ反映済み。アプリでの実ログイン・本人の保存/復元確認は未実施。本番サイトの設定・デプロイは未実施。購入受付は引き続き無効。

## このPRで用意したもの

- Googleログイン・ログアウト。Firebase SDKはアカウント画面を開いた時だけ読む。
- アプリのログアウトとGoogle側のログイン状態は別。`loginGoogle` は `GoogleAuthProvider.setCustomParameters({ prompt: 'select_account' })` により毎回アカウント選択を要求する。スマホ版Braveでの切替実機確認は修正反映後に行う。
  - 参照：[Firebaseのカスタムパラメータ](https://firebase.google.com/docs/auth/web/google-signin?hl=ja)、[Googleのアカウント選択指定](https://developers.google.com/identity/openid-connect/openid-connect#authenticationuriparameters)。
- 明示的な操作でクラウドへバックアップ／端末へ復元。ログインだけでは端末の記録を送信しない。
- 書き換え前の確認、他端末との更新競合検知、本人以外のアクセス拒否。
- 利用権はクライアントから書込不可。決済・有料問題配信は別PR。
- クラウド保存は最大800KB。超える場合は従来のファイル書出しを案内する。有料版では教材本文を保存対象から除外するが、記録が大きい場合は上限に達し得る。自動同期・履歴の分割保存は後続対応。

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

## クラウド保存の競合・権限検証（2026-10-20）

`npm run test:firebase` を拡張し、実際の `cloudBackup.js` の保存/読取関数を、ローカルFirestoreエミュレータとリポジトリの権限ルールへ接続した。認証は専用の架空ユーザー2人、同一ユーザーの別端末2つを模擬する。Googleログインや本番Firestoreへは接続せず、本人の保存済み記録は変更しない。

確認項目：
- 同じ版から2台が同時保存しても成功は1件だけで、その内容を維持する。負けた側と古い版の保存には競合を案内する。
- 最新の状態を読み直した後は保存でき、版が1つ進む。容量超過時は既存データを維持する。
- 別ユーザーの読取/書込とログアウト後の操作を拒否し、ユーザーごとの保存先を分離する。ログイン表示だけ偽装しても、SDKの実際の資格情報が別人なら拒否する。
- ルール単体でも古い版・版飛ばし・時刻偽装・容量超過・余計な項目・通常/テスト利用権の改ざん・非公開教材への直接書込を拒否する。

実検証で、同時保存時にFirestoreルールの版チェックがSDKの再試行より先に失敗し、`permission-denied` になる場合を再現した。保存関数はこのエラー時だけ本人の最新記録を読み直し、版の変化を確認できた場合に既存の日本語の競合案内へ置き換える。自動で上書きや再保存は行わず、実際の権限拒否はそのまま失敗させる。

本番Firestoreと実Googleアカウント2台による同時保存の画面確認は未実施。エミュレータでの成功と区別して記録する。
