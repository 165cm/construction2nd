# 有料版Hostingの接続と運用

**現在（2026-10-21）**：Blaze・Stripeテスト価格・Portal・Functions・Firebase Hostingは準備/接続済み。検証サイトはPR #76相当、以降#77〜#81は検証と記録の追加のみ。一般販売・本番Stripe切替・main統合は未実施。以下は初期準備の経緯であり、現在の未設定事項は [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) と [並列運用監査](audits/2026-10-21-release-operations.md) を参照。

## 初期準備時の記録（2026-10-17）

2026-10-17。設定のみ。公開・課金開始は未実施。

## 公開先の分離

現行GitHub Pagesは通常の `npm run build` を継続する。有料版は `npm run build:private-staging` でルート `/` 向けに生成する。従来の `/construction2nd/` を残すと、Firebase Hostingのルート公開でJSや画像を取得できないため、有料版だけ変更した。

`firebase.private.json` は有料版専用。`dist-private-site` のみを公開対象とし、`/api/content` を東京の `privateContent` 関数に振り分ける。APIルールはSPAへの振り分けより先に置く。既定の `firebase.json` にHostingを追加せず、通常のFirebase操作で誤って公開しないようにする。Hosting公開前処理で再ビルドと有料データ分離テストを実行する。

## 未完了の準備

ユーザーよりBlaze・Stripeのテスト価格とも未準備との回答。以下を順番に行う。

1. 運営者がFirebaseコンソールの `construction2nd` をBlazeへ変更し、請求先を設定する。料金が発生し得る手続きなので本人が操作する。予算通知は支出上限ではない。
2. Stripeのテスト環境でJPY 980の単発価格、JPY 480の毎月更新価格を作成。秘密鍵ではない `price_...` のIDを各プランと対応させて控える。
3. 期間末解約のみを許可するPortal設定を準備。秘密鍵・Webhook署名用秘密値は運営者がFirebaseへ登録する。チャットへ貼らない。
4. `BILLING_SETUP.md` に従い設定し、Functionsの公開先とテスト環境の構成をレビューする。実サービスへの反映は具体的な変更を提示し承認後に行う。
5. 実ログイン、別ユーザー拒否、購入/更新/解約/返金、期限切れ、教材・画像取得、旧キャッシュ更新を検証する。法定表示・返金条件等を確定する。

Hosting設定を選ぶにはFirebase CLIの `--config firebase.private.json` を使う。Functionsの設定は既存 `firebase.json` に残している。設定ファイルの追加だけではAPIは稼働せず、HostingとFunctionsを接続した検証はまだできていない。公開承認前にデプロイコマンドを実行しない。

## 確認

`npm run test:private-staging` は、有料200問と画像の除外に加え、生成HTMLから参照されるルート配下のファイルが実在すること、APIの振分け先・順序、既定の設定がHostingを含まないことを確認する。

一次資料：[Hosting設定](https://firebase.google.com/docs/hosting/full-config)、[CLIの別設定ファイル](https://firebase.google.com/docs/cli)、[Functionsの導入](https://firebase.google.com/docs/functions/get-started)。
