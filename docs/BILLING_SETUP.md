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

### 検証サイトと残り関数（2026-10-18）

ユーザー承認で `billingAccess` / `createCheckout` / `createBillingPortal` / `privateContent` を東京へ反映成功。前3つは未認証POSTに401 UNAUTHENTICATED。有料配信は停止設定により503、private/no-storeを確認。

`firebase.private.json` でHostingを反映し、https://construction2nd.web.app を検証用として公開。事前の有料200問分離・画像除外テスト成功。ブラウザで無料最新年度の問題・ログイン導線・Googleログインボタンを確認。Hosting経由 `/api/content?exam=r7_2` も503/no-store。購入受付と有料配信は引き続き無効。Google本人ログイン・クラウド保存/復元はユーザー確認待ち。GitHub Pages・PRマージは変更なし。

## 指定アカウントでのサンドボックス検証（2026-10-19）

- `BILLING_SANDBOX=true` が既定値。`BILLING_TESTER_UIDS` にFirebase Authenticationの対象UIDをカンマ区切りで設定する。空なら全員の購入・契約管理・有料教材取得を拒否し、利用権確認も権利なしを返す。
- `BILLING_ENABLED`、`PRIVATE_CONTENT_ENABLED`、画面の `VITE_BILLING_READY` は別の停止スイッチで、現在は無効。許可リスト設定だけで販売開始しない。
- サンドボックスは `sandboxBillingCustomers`（購入予約を含む）、`sandboxBillingRevocations`、`users/{uid}/sandboxEntitlements` を使う。本番は従来の `billingCustomers`、`billingRevocations`、`users/{uid}/entitlements`。学習バックアップには影響しない。
- サンドボックスの利用権はクライアントから直接読み書きせず、認証付きAPIで参照する。既存Firestoreルールの既定拒否が適用される。
- Stripe秘密鍵は環境に合う接頭辞を確認し、署名済み通知の `livemode` も確認する。環境が不一致なら処理しない。
- 許可対象から外れた利用者の既存決済についても通知を処理する（返金などを取りこぼさない）。購入・利用権表示・配信は許可リストで拒否する。
- 過去に共通保存先へ作られたテストデータを本番へ引き継がない。本番切替時は旧データ有無の点検も必要。今回以前の実接続確認はアプリ利用者と紐づかない0円通知だけで、有料利用権の付与検証は未実施。

次の手順：対象UIDを設定 → 画面にテスト決済である旨を明示 → 検証サイトへの反映 → サンドボックス購入・解約・返金・期限の確認。本番の秘密鍵・価格・通知設定への切替は別作業とする。

### テスト購入画面（2026-10-19）
購入可能な検証環境では「テスト決済です。実際の請求はありません」を料金欄の上に表示し、確認ボタンも「Stripeでテスト決済に進む」とする。検証UIDは運営者から受領しGit管理外の環境設定へ保存。実カードは使わずStripe公式の成功テストカードを利用する。

操作：ログイン → 「支払い・利用期限を再確認」 → 「3か月パックの内容を確認」 → 「Stripeでテスト決済に進む」。支払い後はアプリへ戻り再確認し、利用期限と過去年度の取得を確認する。月額テストはパック利用権の重複購入防止があるため別手順で行う。

5関数・Hosting反映成功。BILLING_SANDBOX=true、指定UID1件、BILLING_ENABLED / PRIVATE_CONTENT_ENABLED / VITE_BILLING_READY=true。実購入・利用権付与は本人の操作待ち。本番Stripeへの切替とPRマージは未実施。

### 2026-10-20 実購入と案内改善
ユーザーが980円パックのテスト購入、期限表示、有料問題取得を確認。Stripeでも指定UIDの購入1件が980 JPY / paid / livemode=false / 未返金であることを確認。学習画面の案内改善（PR #68）は承認により検証サイトへ反映。次は対象のテスト決済の返金と利用権失効、続いて月額プランの検証。返金は未実施。

### 返金・利用権失効の実接続検証（2026-10-20）
ユーザー承認により980円パックのサンドボックス購入を全額返金。Stripeの返金成功と全額返金済みを確認。通知経由でsandboxBillingRevocationsの対象マーカーとsandboxEntitlementsの対象利用権がともにrevoked=trueとなったことをFirestore RESTの読み取りで確認。学習バックアップは変更していない。ブラウザ上の拒否表示は本人確認待ち。

### アプリ側の期限切れ検証（2026-10-20）
指定テスターの月額利用期限を約5分後へ一時変更。本人が開いたままの有料問題の表示終了、有料年度再取得時の拒否案内、無料問題利用、学習記録維持を確認。控えた元の期限2026-11-20 10:59:09（日本時間）へ復元しFirestore読取照合成功。Stripe側の時刻・契約は変更していないため、これはStripeの期間末終了・更新請求の実接続検証には含めない。復元後の教材再取得は本人確認待ち。

### Stripeの更新・期間末終了（2026-10-20）
専用サンドボックス顧客（個人情報なし）を新規作成し、test clock `clock_1USYMFEVrGT4ZD0cKo5alHZ8`、契約 `sub_1USYMIEVrGT4ZD0cHGvIi5BM` で検証。本人の既存契約・利用権は変更していない。

- 初回 `in_1USYMIEVrGT4ZD0cqXlsmxhn`：paid、480円、subscription_create。
- 時計を初回の期間末+2時間へ進め、ready後に `in_1USYMYEVrGT4ZD0cULZ49FAe`：paid、480円、subscription_cycle を確認。
- 実際の2請求書（chargeを展開）を本アプリのmonthlyGrantへ渡し、両方で利用権の生成を確認。初回の終了時刻と更新分の開始時刻が一致。
- 期間末解約を設定後、次の期間末+2時間まで進めてreadyを確認。契約はcanceled。請求書は2件で、3回目の請求は発生していない。

専用顧客をアプリUIDへ紐づけていないため、これはStripe側の更新/終了と実請求書の判定の確認。更新通知からFirestoreへの利用権追加・画面の利用期限延長までの結合テストは別途必要。時間操作はStripeの時計だけで、アプリのサーバー時計は進めていない。検証オブジェクトは追跡用に保持、実際の請求はなし。

公式手順：https://docs.stripe.com/billing/testing/test-clocks/simulate-subscriptions

### 初回・更新の支払い失敗と復旧（2026-10-20）
専用架空UID（Authenticationの利用者は作成せず、購入許可リストにも追加しない）とsandboxBillingCustomersを使用し、実Stripe通知→Firestoreまで確認。本人の契約・利用権は変更していない。

- 初回失敗：`sub_1USYTHEVrGT4ZD0cNCvOE4nM` / `in_1USYTHEVrGT4ZD0c8QNYdngn`。公式のtok_chargeCustomerFailで請求を試みcard_declined。契約incomplete、請求書open、amount_paid=0、PaymentIntent requires_payment_method。monthlyGrant拒否、Firestore利用権0件。
- 更新失敗：clock `clock_1USYTGEVrGT4ZD0c7h6zmdie` / 契約 `sub_1USYTJEVrGT4ZD0clOa2e28v`。初回請求 `in_1USYTJEVrGT4ZD0cqJfbYD9H` は480円paid、通知経由の利用権1件を確認。その後拒否カードへ切替、時計を期間末+2時間に進めreadyを確認。更新請求 `in_1USYU2EVrGT4ZD0ch82xLR7G` はopen、amount_paid=0、契約past_due、利用権は初回の1件のみで延長なし。シミュレーション時刻をaccessSummaryへ渡してhasAccess=false。
- 復旧：正常カードへ戻し同じ未払い請求書を支払うと480円paid・契約active。実通知を経由して次期利用権がFirestoreへ追加され2件。初回終了と次期開始が一致し、シミュレーション時刻でhasAccess=true。
- ブラウザのエラー表示、Checkoutでのカード拒否操作、3Dセキュアはこの検証に含めない。時間操作はStripeのみで、実サーバー時計は進めていない。本人画面での延長も未検証。専用契約は検証後に期間末解約へ設定済み。

公式テストカード：https://docs.stripe.com/testing

### Checkout画面の失敗・追加認証の準備（2026-10-20）
専用架空UIDと個人情報なしの専用顧客で、980円パックのサンドボックスCheckoutを作成（cs_test_a1z5MqwDG0LWBi2UbkFGFT5nvXP8wOx3oFJYL9BWS1c76wYIQEhKBQP3Gx）。本人の月額権利は変更していない。Checkout URLはGitに保存せず、ローカル専用 /tmp/construction-checkout-ui-state.json に保存。初回URLの期限は2026-10-20 20:19:29（日本時間）。

料金・戻り先・metadataは本アプリのcheckoutParamsを使用。createCheckoutの購入予約・認証ガードを経由しないため、これはStripe Checkoutの表示と通知連携の検証用であり、アプリの重複購入防止や入口認証の検証には含めない。まず公式の拒否カードで画面を確認し、その後追加認証を検証予定。画面操作は本人確認待ち。
