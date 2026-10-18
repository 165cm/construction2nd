# 決済サーバーの準備（未公開・受付停止）

Firebaseプロジェクト `construction2nd`・Googleログイン・Firestoreルールは準備済み。2026-10-17時点でBlazeへの変更とStripeテスト価格は未準備。実サービスへの決済接続・課金テストは未実施。`BILLING_ENABLED` は既定で false のままにする。有料配信・料金画面・履歴移行のコードは下書きPRで準備済み。Hosting接続は `PRIVATE_HOSTING.md` を参照。

## 今回追加したもの

- `functions/`：Node.js 22 / Cloud Functions（東京）。認証済ユーザーの決済開始、利用期限確認、契約管理、署名付きStripe通知受付。
- 税込480円・毎月更新と、税込980円・自動更新なし3か月の固定価格をサーバーで照合する。金額・数量・利用者IDをブラウザから自由指定させない。
- パックの期限はStripeの決済日時を起点に日本時間で暦の3か月。月末は終了月の末日へ補正。月額は支払済請求書の期間だけを解放する。
- 利用権は `users/{uid}/entitlements/{checkoutまたはinvoiceのID}`。端末からの書込みは禁止。返金・異議申立ては該当支払いだけを無効化し、順序が逆の通知にも対応する。
- 顧客対応と購入予約は `billingCustomers/{uid}`。返金記録は `billingRevocations/{chargeId}`。どちらも端末からアクセス不可。
- 有効期間中・未終了の月額契約中は追加購入を拒否。購入予約の期限だけで次の購入を許さず、Stripe側の完了・失効を照合する。支払済みなのに利用権未反映なら確認中として止める。
- 予約作成後に通信が切れ、Stripe側のセッションも見つからない場合は最大24時間停止する保守的な動作。接続テストで回復手順を確認すること。
- 契約管理は専用のStripe Portal設定が必要。期間末解約のみ許可し、プラン変更が有効な設定では開かない。

## プロジェクト作成後の設定順

1. `FIREBASE_SETUP.md` のログイン・保存設定を完了する。
2. Stripeのテスト環境に税込980円の単発価格、税込480円の1か月周期の価格を作成する。割引・無料期間・日割り変更は初版の対象外。
3. Stripe Portalに、期間末解約を有効・プラン変更を無効にした専用設定を作る。
4. Functionsの設定に `SITE_URL`（HTTPSのアプリURL）、`STRIPE_PACK_PRICE_ID`、`STRIPE_MONTHLY_PRICE_ID`、`STRIPE_PORTAL_CONFIGURATION_ID` を設定する。`BILLING_ENABLED=false` を維持する。
5. `STRIPE_SECRET_KEY` と `STRIPE_WEBHOOK_SECRET` はFirebaseの秘密設定へ本人が登録する。チャット・リポジトリ・VITE環境変数へ入れない。
6. WebhookのAPI版は `2024-06-20`。サーバーも同じ版でStripeの現状を取得する。SDK更新時にAPI版を勝手に変更しない（請求書の構造が変わるため）。実アカウントでこの版と応答を確認する。
7. 通知対象は `checkout.session.completed`、`checkout.session.async_payment_succeeded`、`invoice.paid`、`charge.refunded`、`charge.dispute.created`。署名検証に生のリクエスト本文を使う。
8. 下記の結合テスト、料金画面、有料配信、運営者情報・解約/返金条件の表示が完了してから公開承認を受ける。テスト環境の動作確認時だけ受付設定を変更し、本番へ転用しない。

## 検証状況と残作業

実行済：`npm --prefix functions test`（料金・期限・支払確認・返金・重複通知の純粋関数テスト）、構文確認、依存ライブラリの監査。

未実施：Firebase FunctionsとStripeを接続した結合テスト。テストコードの模擬データだけでは以下の保証にならない。

- 同時購入、予約直後の切断、完了済み通知の遅延、セッション作成失敗からの回復。
- 月額の新規/更新/失敗/解約と、解約後のパック購入。テスト時計を使い期間終了も確認。
- 部分返金・全額返金、通知の順序逆転・再送、署名不正、別ユーザーからの呼出し。
- 支払成功ページだけでは解放されないこと、端末時計を変えても期限が変わらないこと。
- 本番設定とテスト設定の取り違え防止、Webhookのエラー監視・手動回復手順。

返金は一部でもその支払いの利用権を停止する実装。異議申立てが取り下げられても自動復活しない。公開前に運営者が返金条件と手動回復手順を確定する必要がある。

現段階は一般画面から呼び出さず、過去問は従来どおり公開バンドルに含まれる。課金機能の完成・有料データ保護の完了とは扱わない。

## 料金画面の準備

アカウント画面に2プランの比較、利用期限再確認、契約管理、Stripeへの遷移を追加。`VITE_BILLING_READY` が true で、かつサーバーの `BILLING_ENABLED` が true の場合だけ購入ボタンを有効にする。両方とも現段階では有効化しない。認証情報が未設定ならアカウント画面自体を表示しない。

一般画面への料金導線、有料データ配信、特商法・返金条件等へのリンクはまだ未実装。料金表示は用意した部品単体でスマホ縦横・PCを確認（`audits/2026-10-16-pricing.png`）。実アカウントの購入や契約管理は未確認。支払成功URLだけで利用権を解放せず、サーバーの回答を再確認する。

## 実接続の状況（2026-10-18）

ユーザーよりBlaze設定完了。サンドボックスの480円/月・980円単発価格をAPIで確認し、承認を受け税込設定へ変更、料金検証成功。期間末解約・プラン変更不可のPortal設定も確認済み。秘密値2種は運営者がFirebaseに登録した。

ユーザー承認により `functions:billing:stripeWebhook` のみ `construction2nd` / 東京へ反映成功。GETは405、署名なしPOSTは400で拒否を確認。Stripe通知先は `we_1URhB4EVrGT4ZD0cOKG6IVCY`、API版2024-06-20、無効のまま。実Stripe通知と署名用秘密値の一致は未検証。

購入受付と有料配信はfalse。Hosting・購入開始・契約管理・利用権照会の関数は未デプロイ。SITE_URLは将来のHosting URL `https://construction2nd.web.app` を設定（サイトは未公開）。Functions作成は成功したが、ビルド成果物の自動削除ポリシーが未設定でCLI終了コードはエラー。自動削除はまだ実施せず、保管費用対策として設定方針を確認する。

### ビルド成果物の保管費用対策（2026-10-18）

ユーザーの費用削減依頼を受け、`functions:artifacts:setpolicy --project construction2nd --location asia-northeast1 --days 1 --force --non-interactive` を実行し成功。`gcf-artifacts` に1日を過ぎたコンテナイメージの自動削除ポリシーを設定した。稼働中の関数はデプロイ時のコピーを保持するため、この保管物の削除で停止しない（Firebase公式の標準設定）。教材原本・学習データ・秘密値は対象外。設定後も通知URLの無署名POSTは400で拒否。実際の削除はバックグラウンド処理であり、削除済み容量・削減額は未計測。上記の未設定警告は解消した。

公式資料：https://firebase.google.com/docs/functions/manage-functions

### Stripe実通知の疎通（2026-10-18）

順次作業の依頼を受けサンドボックス通知先を有効化。個人情報なしの専用テスト顧客と0円請求書を作成・確定し、Stripe自身の `invoice.paid` を発生させた。請求書 `in_1URsZXEVrGT4ZD0cDnhn8IP5`、イベント `evt_1URsZYEVrGT4ZD0cltW9MGqq`、livemode=false、pending_webhooks=0を確認。受信側の同時刻ログに処理エラーなし。通知の疎通を確認したが、0円かつアプリ利用者と未対応のため利用権付与・有償プラン購入の検証ではない。テスト記録は追跡用に保持。通知先は現在有効、購入受付は停止のまま。

次の反映予定は `billingAccess`、`createCheckout`、`createBillingPortal`、`privateContent` の4関数（東京）。BILLING_ENABLED=false / PRIVATE_CONTENT_ENABLED=falseを維持し、未認証拒否を検証する。サイトは有料教材を除去した検証出力で `construction2nd.web.app` に配置予定。公開前にユーザー承認が必要。GitHub PagesとPRのマージは対象外。
