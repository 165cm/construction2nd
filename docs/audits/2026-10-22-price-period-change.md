# 月額価格・日付単位の期間への改定

2026-10-22。新方針は本人採用済みだが、外部価格・既存契約・保存済み利用権・公開サイトは変更していない。

## 確定した方針

- 月額600円（税込）、3か月集中パック980円（税込・一括）を維持。
- 決済完了日を加入日とする日本時間の期間。月額は翌月同日の前日23:59まで、次期間は同日0:00から。パックは3か月後の同日の前日23:59まで、自動更新なし。
- 例：10月10日加入→月額は11月9日末まで、次期間は11月10日から。パックは翌年1月9日末まで。
- 同じ日がない月はその月の末日23:59までと本人採用。以後も元の加入日基準を保持する。例：2027年1月31日→2月28日末まで、次期間は3月1日〜3月30日末、3月31日から次の期間。

## 今回の実装範囲

購入確認・料金表・入口案内・本文案の新価格と通常日の説明を準備し、確認画面にHTML/CSSの期間図を追加。月額6回3,600円、12回7,200円。パックとの差は月額3回比820円、月額が安いのは1か月だけの利用。

**表示の準備と請求処理の完成を区別する。** 現Functionsは480円・既存の時刻単位を維持しているため、この表示変更だけを公開して購入を受け付けない。BillingPanelの購入受付には既存VITE_BILLING_READYに加えVITE_CALENDAR_BILLING_READYを要求し、後者は設定していない。契約管理/解約の入口は維持する。API自体の改定完了を意味しない。確認用画面の続行はローカル表示のみ。

## 請求処理で必要な変更（未実装・未実行）

1. 新規購入600円の設定と、旧480円の実請求書/再送を受理する設定を分離する。環境・正確なPrice IDと金額で検証し、任意の480/600円を許可しない。Stripeの既存Price/契約は勝手に変更しない。
2. 期間仕様をPrice等の版で区別し、旧通知再送で過去の利用期限を新方式へ書き換えない。内部の終了時刻を含まない境界判定は維持する。
3. Stripe標準の加入時刻ベース月次と、採用したJST0時境界は異なる。未来billing_cycle_anchorとproration_behavior=noneだけでは初回期間が無料になり、既定の按分では600円固定にならない。表示だけ日付末へ丸める案は採用しない。
4. 【2026-10-23撤回】初回利用期間料の単発600円行＋継続600円行＋proration_behavior=noneというCheckout案は公式制約で併用不可。既存monthlyGrantのInvoice1行固定と両立しないため、実Sandboxで金額・期間・通知・失敗/再送・解約を確認するまで採用済みとしない。毎月1日、28～31日、閏年・日本時間/UTCの境界も確認する。
5. パックの新仕様暦計算は別版で準備済み。新旧980円は別Priceで照合し、保存済み期限の保持と実付与経路への接続を進める。
6. 本番/サンドボックスのPrice作成、Checkout、契約操作等は対象と影響を具体化して承認を得る。現時点では読取調査とローカル表示準備だけ。

別担当2名がコード影響とStripe公式を読取点検。実在する旧480円決済の再送用スクリプトや過去の証跡は、600円へ単純置換しない。

## 一次資料

- [Stripeの請求起点・按分・UTC](https://docs.stripe.com/billing/subscriptions/billing-cycle)
- [Checkoutの単発/継続行](https://docs.stripe.com/api/checkout/sessions/object)
- [Priceの管理](https://docs.stripe.com/products-prices/manage-prices)

最新資料と固定API版の細部を照合し、この組合せの実接続成功を先取りしない。

## 月末ルールの計算実装（2026-10-22）

functions/calendarBillingPolicy.js に新仕様専用の純粋計算を追加。初回開始は実決済時刻、終了はJST対応日0時、対応日なしは対象月翌月1日0時を排他的境界とする。更新は前の補正日へ月を足さず、元joinedAtから回数を指定して計算。新額600/980円とjst-calendar-v1の仕様版も定義し、パックの自動更新は拒否する。旧billingPolicy.js/index.jsの通知経路には未接続で、配備もしていない。

Functions20テスト全成功。新規7テストで通常日/1日/28～31日/閏年/年越し/JST境界/24回連続の空白・重複なし/パック/不正入力/旧480通知・旧パック期限維持を確認。別担当読取点検で必須指摘なし。確認画面の月末例もこの計算を使う。実請求の成功を意味しない。

追加調査：固定API2024-06-20のCheckoutはtimestampの請求起点のみ。元の日付を保持するbilling_cycle_anchor_configは、Checkoutでは2026-06-24.dahlia追加であり、SDKの型だけを根拠に旧APIへ渡さない。新Checkout作成だけを対応版へ移行する候補を優先検討し、初回600円・初回/更新Invoice・旧経路分離を確認する。Subscriptions.createは旧APIでもconfigを持つが、購入フロー変更の範囲が広い。

UTC設定の計算候補は、JST加入日1ならUTC31日15時、それ以外はUTC(加入日−1)日15時。timestampだけで初回の補正日を起点にすると翌月以後ずれる。Checkoutを開いた日と決済完了日が日付をまたぐ場合、初回請求の失敗/3DS待ち等の基準日も検証し、ブラウザの任意日付や通知到着日を基準にしない。候補の設定を実サービスへ作成・送信していない。

追加一次資料：[Stripe v22.3.0のリリース](https://github.com/stripe/stripe-node/releases/tag/v22.3.0)、[2024-06-20対応Checkout型](https://raw.githubusercontent.com/stripe/stripe-node/v16.0.0/types/Checkout/SessionsResource.d.ts)、[固定版Subscriptions作成](https://docs.stripe.com/api/subscriptions/create?api-version=2024-06-20)。

画面確認：月額の「月末加入の例」を開き、1/31〜2/28末、3/1〜3/30末、3/31に元の基準日へ戻る表示を実ブラウザで照合。390px幅のiframeでも通常日の縦図と月末例の折り返し/開閉を確認。実端末での確認とは区別する。


## 旧新価格と再送保護の準備（2026-10-23）

`functions/billingPriceRegistry.js` を追加。環境・正確なPrice ID・JPY金額・税込・定額月次の周期を照合し、旧480円月額/旧980円パック/新600円月額/新980円パックを分離。同じPrice IDの二役は拒否。過去通知に必要なinactive Priceは許可するが、新規購入では旧版とinactiveを拒否する。実環境のIDはまだ登録せず、実Checkout/通知経路にも未接続。

再送保護は同じ利用権ID・支払ID・プラン・契約IDを照合し、保存済み開始/終了/版/追加情報を保持する。版なし旧記録にも新しい版を付けず、取消しは復活させない。新しい支払で別の利用権を作る処理とは区別。保存先と本人は呼出側transactionでの検証が必要で、現indexのsaveGrantはまだ切り替えていない。

`calendarAnchorConfig` にJST元加入日のUTC変換候補を追加。1〜31日の各加入日×24回のUTC月末丸めと採用済み暦境界が一致することをローカル確認。これはStripe実課金の検証ではない。Functions全28テスト成功、別担当のレジストリ/再送保護レビューで必須修正なし。

### 調査による候補の訂正と次の実装

[Stripe公式](https://docs.stripe.com/billing/subscriptions/billing-cycle)に、Checkoutでは単発Priceと`proration_behavior=none`を併用できないと明記。先の組合せは採用しない。Checkoutを開いた時に決めた基準日が支払成功日の日跨ぎへ自動追従するわけでもない。

次の候補は、初回600円をpayment Checkoutで支払い、将来請求への同意のもとカードを保存し、支払成功を確認したサーバーが元加入日を固定してSubscriptions APIで按分なしの月次600円を作る二段階方式。採用前に以下をまとめて準備・検証する。

- 支払成功日時の正本（作成日時や通知受信日時で代用しない）、3DS日跨ぎ、通知遅延。
- 初回支払済み/契約未作成の復旧、永続予約と冪等キーによる二重契約抑止、先行解約/返金との競合。
- カード保存と継続請求の同意、更新失敗/追加認証、月末復帰、解約、実際の初回/更新600円。
- 旧480円契約・旧パックの通知と期限を維持。実請求書作成は料金/メールを伴い得るので成功時刻取得のためだけに無断追加しない。

外部Price/Checkout/契約の作成は未実施。次はテスト専用データでこの方式の具体的な実行手順を用意し、対象と影響を示して承認後にSandbox試験を行う。ユーザーの採用済み価格や期間を変更する質問は増やさない。


## 二段階方式の部品・隔離試験の実行案（2026-10-23）

`calendarPurchaseFlow.js` に未接続の組立て関数を準備。初回はpayment Checkout・サーバーで照合済みの単発600円Price・将来off_session保存、継続は支払成功日を固定してSubscriptions APIのconfig/noneで作る。署名検証後の成功イベント日時を一度だけ保存する想定であり、Checkout作成日時/通知受信日時/ブラウザ入力で代用しない。実際のイベントからの時刻取得は未接続・未検証。

同じ支払IDから同じ契約作成要求と冪等キーを作り、初回期限経過は要照合で停止。復旧判断では全契約の照合を要求し、既存契約は解約済みでも再利用する。曖昧・別顧客・別版・複数一致・別の継続契約・23時間経過後に既存不明なら自動再作成しない。呼出側による本人/正確なPrice/金額/カード保存と継続請求の同意/取消しの検証、永続予約での直列化と初回試行時刻の不変保存はまだ必要。この部品だけで二重契約防止の実接続完了とはしない。

Functions33テスト成功（追加5件）。別担当の読取レビュー必須指摘なし。公開ハンドラー・既存の予約・契約管理・付与経路には変更なし。

### 承認後に実行する試験

スクリプト：`scripts/verify-calendar-billing-sandbox.mjs`。引数なしは説明のみで終了し、通信/鍵取得/外部作成をしないことを確認。構文確認成功、別担当レビュー必須指摘なし。

- 対象はconstruction2ndの既存Sandbox鍵のみ。本番鍵は拒否、Firestore/アプリ/既存顧客/既存Price/既存契約は変更しない。
- 専用商品1件・月額600円Price1件・テスト時計/顧客/初回テスト支払/契約を各4件作成。顧客の実氏名/メールは登録しない。実カード/実請求なし。
- 日時は2023/1/10、2023/1/31 00:00:01、2024/1/31 23:59:59、2024/2/1 00:00:01（JST）。通常日、月末、閏年、1日を時計fixtureとして明示注入。
- 各ケースで初回API支払600円、同一冪等キー再送で契約1件、月次契約作成直後の追加請求0円、更新直前の請求なし、更新2回が各600円、元加入日の境界へ復帰、期間末解約後の追加請求なしを照合。
- 更新は即時paidを要求せず時計を境界の1時間後へ進めて待つ。各回readyを待ち、顧客単位の全Invoiceを取得する。
- 最後に今回作成した時計だけを削除し、対応するテスト顧客/契約を後片付け。今回Price/商品だけinactiveにする。試験の決済履歴はStripe上に残り得る。失敗時も同じ対象だけ後片付けを試み、残件を記録。
- 結果は/tmpの専用JSON（権限600）にIDと判定のみ保存し、秘密鍵/カード情報を出力しない。

この試験はSubscriptions APIの仕様検証。実Checkoutの同意/画面/カード保存、3DS日跨ぎからの成功時刻取得、Webhookと永続予約/復旧、失敗/返金/旧経路互換の結合確認は次段階として残る。時計fixtureを独立PaymentIntentやEventの実created時刻と同一視しない。

外部データ作成と後片付けを伴うため、上記一括試験の承認後に明示フラグ `--run-calendar-sandbox` で実行する。現在は未実行。

根拠：[Stripe時計APIの試験手順](https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage)、[固定API版Subscriptions作成](https://docs.stripe.com/api/subscriptions/create?api-version=2024-06-20)。


## 承認済み隔離試験の実行結果（2026-10-23）

本人が「専用データで一括試験を実行する」を承認。上記スクリプトをSandbox鍵・API2024-06-20で実行し、終了コード0、4/4ケース成功。専用商品/価格各1、時計/顧客/初回PaymentIntent/契約各4を作成。初回各600円、更新2回が各600円、作成直後の追加請求なし、更新直前の請求なし、契約作成の同じ冪等キー再送で契約1件、期間末解約後の次回600円請求なしを確認。

| JST加入日時fixture | 初更新の開始（排他的終了境界） | 2回目更新 | 解約による終了 | 結果 |
|---|---|---|---|---|
| 2023/1/10 12:00:00 | 2/10 00:00 | 3/10 00:00 | 4/10 00:00 | 成功 |
| 2023/1/31 00:00:01 | 3/1 00:00 | 3/31 00:00 | 5/1 00:00 | 成功 |
| 2024/1/31 23:59:59 | 3/1 00:00 | 3/31 00:00 | 5/1 00:00 | 成功 |
| 2024/2/1 00:00:01 | 3/1 00:00 | 4/1 00:00 | 5/1 00:00 | 成功 |

各current_period_endと採用済みcalendarPeriodの境界を比較。例：2023/1/31加入の初回期限は2/28いっぱい、次期間は3/1〜3/30いっぱいで一致。全ケースで更新2回後に期間末解約し、次の請求なしを確認した。時計は各境界の直前・1時間後へ進めてready/paidを待ち、この実行ではいずれも成功した。実時間の画面購入や3DS試験とは区別する。

### 後片付けの実確認

スクリプトのcleanupErrorsは0件。追加の読取照合で、今回時計4件をGET404、今回顧客4件をdeleted/404、今回Price1件と商品1件をactive=falseで確認。既存IDや全件削除は使っていない。実支払い・実利用者の契約・Firestore・公開サイト・配備設定は変更していない。

証跡（非公開ローカル）：`/tmp/calendar-probe-ddb088c7-78cd-4b8b-93ec-93f532357fef.json`。秘密鍵/実氏名/メール/カード番号は含めない。決済履歴はStripeのテスト履歴に残り得る。

### 残る範囲

これで「二段階方式のSubscriptions APIによる固定額/暦更新/解約」の候補は実APIで成立を確認した。一般販売を可能にしたわけではない。次はPrice役割（初回単発600円含む）の正確な照合、署名済みイベントから成功時刻を固定する処理、実Checkout/同意/3DS日跨ぎ、永続予約・通知再送/作成失敗の復旧、失敗/返金と新旧付与経路の結合へ進む。新しい専用テストの作成範囲は別途具体化する。旧480円や旧パックの通知/保存期限を変更しない。


## 購入確認への接続と支払証拠の判定（2026-10-23）

### 実装した範囲

- BillingPanelへPurchaseConfirmationを組込み。月額の確認欄にカード保存/以後毎月600円の継続請求を明記し、planId・consentVersion（calendar-jst-v1）・recurringConsentを送る。VITE_PURCHASE_DOCUMENTS_READYを追加し、文書未準備ならリンク/同意/続行を停止。既存の購入準備2フラグとサーバー受付確認も維持し、どの新フラグも設定していない。
- 続行直前に利用権を再照会。有効権利の復帰/受付停止は購入を中止し、UID変更後の古い応答からの遷移と二重操作を抑止。購入や文書準備に関係なく契約管理入口を維持。有効権利表示と「有料プラン準備中」の矛盾も解消。
- Functionsの既存createCheckoutは新確認画面の同意情報を受け取ると外部接続前に停止。新600円の表示から旧480円の経路へ流さない。新方式を実際に作成する処理はまだ未接続。
- saveGrantのtransactionにpreserveGrantOnReplayを接続。旧通知でも保存済み開始/終了/版/追加情報を保ち、失効のみ単調に反映する。実通知ハンドラーをローカルの模擬Stripe/DBで8件通し、旧980円の期限・版なし記録維持、先行失効marker、返金後paid再送でも非復活を確認（7transaction）。実署名/実DB競合ではない。
- calendarPaymentEvidence.jsに未接続の初回600円/新パック980円・更新600円の証拠判定を追加。予約本人/顧客/手続き/版/Price/環境/支払成功/捕捉/金額/同意を照合。月額初回にはoff_session保存設定も必要。更新は通常の支払済みInvoice1行だけを、元加入日の正しい1期間と照合。0円/按分/未払い/別契約/期間違いは付与しない。calendarInitialの単発600円Price役割も分離。
- 完了通知の先着回復用に、成功Eventを種類+created範囲で取得し全ページ内でPIを照合する処理を準備。未着/ページ上限/不完全取得はpending、日時競合/探索期限超過はreview。受信日時や作成日時で加入日を推測しない。

### 日時と検証の限界

Event.createdはStripeの「支払成功イベントの生成日時」であり、決済の厳密な瞬間やWebhook配送日時ではない。実接続時にはこの日時とEvent/PI IDを一度保存し、不変の正本にする。APIの過去30日保持に対し、この検索はPI作成から30日超を保守的にreviewにする。古いPIが後日成功した場合も自動回復を制限するため、別の照合経路が必要。

[固定版Events一覧](https://docs.stripe.com/api/events/list?api-version=2024-06-20)、[Eventの定義](https://docs.stripe.com/api/events/object?api-version=2024-06-20)、[配送順/重複](https://docs.stripe.com/webhooks#event-ordering)を別担当が読取照合。署名検証・サーバー予約の保存/排他・成功日時の不変保存・成功通知購読と再処理、実Stripe契約作成/初回と更新の新しい利用権付与の結合は未完成。公開ハンドラーは新規購入を停止したままで、今回配備していない。

### 確認結果

Functions44テスト、全npm test、最終pricingテストとbuild成功（既存の500kB超チャンク警告のみ）。別担当が証拠判定を読取レビューし重大指摘なし。

実ブラウザでは127.0.0.1:5212の模擬BillingPanelで、未選択の同意は続行不可、同意版/継続請求同意を送信、購入待ち中にaccount-bへ切替後に古い応答を解放してもnavigations=[]、続行直前の権利復帰はcreateCheckout0件で確認を閉じる、契約管理は呼出可、文書未準備は文書リンク/checkbox/submitを止めることを確認。実認証/Stripe/Firestoreには接続しない。確認用タブと5212サーバーは終了済み。

5211の390px幅プレビューでも新同意欄が折り返し、横はみ出しなし/主ボタン最小55pxを確認。画像：/tmp/construction-purchase-consent-phone.png。実スマホ操作ではない。追加fixtureはtests/billing-panel-local-check.mjs（明示フラグなし未起動、専用キャッシュ、外部サービスは模擬）。

実サービスへのデプロイ・Price/既存契約/学習記録の操作・メール送信・PRマージは行っていない。次は永続予約・成功通知の正本保存・契約作成/復旧をまとめて接続し、新経路での結合試験を準備する。


## 新方式の永続記録・契約作成・通知の結合（2026-10-23、未配備）

### 接続した処理

`calendarPurchaseStore.js` を追加。新方式の購入予約をUID配下のbillingPurchases/sandboxBillingPurchasesへ保存し、本人/顧客/手続き/Price/同意/作成日時を不変にする。CheckoutのIDは一度だけ関連付け、初回支払成功日時/Event/PI/Charge/初回期限と初回利用権を同じtransactionで保存する。返金マーカーを同時に読み、再送で期限や失効を戻さない。初回600円の購入済み期間は、後続契約作成が失敗しても利用権として残す。

月額契約作成は5分の作業権とtokenで直列化し、初回試行時刻を保持する。期限切れtokenの結果保存を拒否し、再開時は顧客の全契約を照合して既存を再利用。既存不明の23時間経過後は自動再作成しない。Stripe作成の応答喪失やDB結果保存失敗も、同じ支払/要求/冪等キーから回復する。Stripeのキーが永久保存されるとは扱わない。

`calendarBillingProcessor.js` で、保存済み初回証拠→月額契約の作成/照合→結果保存、更新の支払済み期間→利用権、を組み合わせた。成功日時を保存後はEventの30日保持期限や別通知で日付を再探索・再計算しない。契約作成直後の0円Invoiceからは期間を付与せず無視する。

作成結果保存時にも失効マーカーを再確認。作成中に失効した場合や、初回終了/毎月の元加入日configが不一致の場合は、作成途中の当該契約IDを取消待ちとして保存し、本人・Price・初回PI・版が一致する対象だけを補償取消しする。取消しが失敗したら取消待ちのまま再送で回復。期間不一致だけなら支払済み初回権利を失効させない。正常完了した後の通常返金と解約は従来どおり別扱いにし、一律自動解約へ変えない。

### 実ハンドラーの新旧分離

`index.js` に新方式受付フラグCALENDAR_BILLING_ENABLED（既定false）と新Price3役割の設定を追加した。新方式が有効な場合は旧形式/同意なしの購入を拒否し、サーバーで同意/価格を確認して予約→初回単発Checkout→セッションID保存へ進む。パックも新Price/新期間を別版で扱う。旧形式を残すのは既存Sandbox検証のみで、本番の新方式停止中にbodyから同意情報を省いて旧480円を買う経路も拒否する。

Checkout完了、PI成功、Invoice支払済み通知を新版の保存/契約作成/利用権処理へ接続。旧版のパック/月額通知は従来の価格と期限の経路を維持する。新方式の購入を止めても新方式の既存通知処理は止めない。Price設定や保存正本は、受付停止時にも保持する必要がある。

### 検証

- Functions66テスト成功、全npm test/build成功（既存500kBチャンク警告のみ）。別担当の最終読取レビューで追加の重大指摘なし。
- 永続adapterの10テストで予約/証拠の不変、8並行claimで1作業権、作業権期限後の旧token拒否、返金マーカー競合時の再読取、取消待ち/通常返金の区別、更新再送、UID/パス分離を模擬Firestoreで確認。
- processorの10テストで、初回から契約/権利までの8並行通知、Stripe応答喪失、DB保存失敗、作成中返金/取消し失敗からの回復、誤った期間・元日configへの補償取消し、成功イベント先着/未着、全件未取得/23時間/初回期限後の停止、パック、更新再送/0円請求を確認。
- 実createCheckout/onRequest通知/保存adapter/processorをつなぐローカル試験で、新購入→完了通知先着で未処理500→PI成功200→再送でも契約/初回権利1件→受付フラグ停止後も更新利用権を保存、を確認。Stripe/署名/DBは模擬、実通信は禁止。実署名配送・実Firestoreの競合と混同しない。
- レビューで現在の期間末だけでなくbilling_cycle_anchor_configの照合が必要と判明し修正。分秒省略時は実anchorのUTC値で補い、未知configは受理しない。前回承認済み時計試験の4契約を今回読取で再確認し、固定API2024-06-20でもday/hour/minute/second/month:nullが返ることを確認。変更/再課金はしていない。

### 実環境で残る確認

新設定は未設定/falseのまま、Functionsの配備・Webhook購読変更・実Price作成・既存契約/学習記録の変更・公開は行っていない。次はこの新ハンドラーと実Stripe/Firestoreの結合試験、実Checkoutのカード保存同意と3DS日跨ぎ、実通知の順序/遅延/復旧を対象・作成物・後片付けを具体化して検証する。WebhookのPI成功通知購読も未変更（完了通知の成功Event探索はfallbackとして実装済み）。公開文書/サポート返信元/本番Stripe切替/最終承認は別の残項目。


## 実Checkout結合試験の実行準備（2026-10-23、未実行）

`scripts/verify-calendar-checkout-integration.mjs` と専用cleanupを追加。引数なし/不明引数では、秘密値取得・外部SDK読込・ローカル待受を開始しない。実行には今回の具体的な作成/削除範囲への本人承認が必要。前回の時計4ケースの承認を流用しない。

### 承認対象と手順

1. 実行前に配備済み旧通知処理とPrice設定を読取照合する。同じSandboxには通常のStripe通知も届くため、専用新Priceを旧価格として付与しないことを確認する。外部endpoint/購読は変更しない。
2. `--run-calendar-integration` で専用商品1件・Price3件（初回単発600/継続600/単発980）・顧客2件・Checkout2件を作成。UUIDから導く月額/パック専用UIDに、Sandboxの予約・購入・初回利用権を保存する。Firebase Authアカウントは作成せず、Callableはローカルで専用UIDを渡す。
3. 127.0.0.1:5213で購入リンクを表示し、本人に月額/パック各1回のテストカード購入をまとめて依頼する。架空メールを使用し、実カードは使わない。支払後にアプリへ戻っても実アカウントに権利は付かない。この確認タブへ戻って結果確認を押す。
4. 正本の実PaymentIntent成功Eventを取得。プロセス内だけのランダム秘密値でローカル署名を作り、**ローカルで読み込んだ実stripeWebhook**へ渡す。実Firestore保存・初回期限・月額契約1件/パック契約0件・同じ成功通知の再送後も契約/利用権が増えないことを確認する。
5. 今回作成分だけを照合後、月額契約取消（追加請求/按分なし）、未払いCheckout失効、専用顧客削除、専用3文書ずつの削除、Price/Productのinactive化を行う。取消/削除/無効化は読み直しで確認。テスト決済履歴は残る場合がある。

保存先manifestは `/tmp/calendar-integration-<UUID>.json`、権限0600。秘密値/署名/Event本文/client_secretは保存・表示しない。成功応答直後のID保存に加え、途中失敗時は専用予約とSessionを再探索する。中断後は `--cleanup-calendar-integration --state <同manifest>` で回復。所有情報不一致は削除せず保留する。学習記録・実利用者・既存契約・公開設定は対象外。

### 保護・範囲・未確認

確認ページは127.0.0.1だけで待受。GETでは処理せず、POST・Origin/Host・ランダムnonceで確認/終了を制限。通知処理と後片付けは直列とし、終了開始後は新たなローカル通知を渡さない。実ハンドラーのDB入口は専用UID/ Sandbox名前空間へ限定。cleanupはUID/顧客metadata/正確なPrice/契約/Session/購入・権利の関係を検証し、Firestore文書は再照合と更新時刻条件付きで削除する。

これは **実Stripeイベント＋ローカル試験署名による実ハンドラー/実Firestore結合** の計画。Stripe自身の署名・外部HTTP配送・デプロイ済みCallable認証・実ユーザー画面への権利反映・更新の実通知・3DS日跨ぎの成立とは区別する。今回これらの成功を主張しない。

準備段階のFunctions79テスト（cleanup10件・作成前journal3件を含む）、明示実行ガード3件、構文検証が成功。実サービス上の新しい作成・購入・削除・配備はまだ行っていない。

作成前journalに商品/価格/顧客/Session/契約の未確定を先行保存し、成功IDと親manifestを同じ保存で確定する。応答喪失などで未確定の作成があればcleanupを成功扱いせず、個別照合まで保留。準備完了前のPOSTも拒否。別担当レビューの2指摘を修正し、再レビューで追加の実行前必須指摘なし。


### 承認済み実行の開始（2026-10-23、本人購入待ち）

本人が専用データでの一括試験/今回分cleanupを承認。Cloud Functions APIとGCSの配備済みソースを読取し、stripeWebhookのindex.js/billingPolicy.js/billingEnvironment.jsがfc9d9d9と一致することを確認。index.jsのSHA256は6211a8a7e39d19f1e0820d305e4d45a4597182354192d0efac08f768796b8035。旧通知はpackGrant/monthlyGrantの正確な旧Price IDで判定し、今回新規作成の別Priceを付与しない。外部endpoint/環境設定は変更していない。

実行UUID f93b9e01-0c6e-4908-b3b5-76a3e2c16512。専用商品1件・Price3件・顧客2件・Checkout2件の成功応答を保存、未確定作成0件、manifest権限0600を確認。ローカル実createCheckoutから実Stripe/実Firestore予約を通して作成成功し、127.0.0.1:5213に確認画面を表示。本人にテストカードで2件の購入を依頼中。まだ支払成功/利用権/再送/cleanupの実成立は確認していない。プロセスとmanifestを保持し、本人購入後に結果照合と今回分の片付けを続ける。


### 購入リンク期限切れ後の再起動（2026-10-23）

本人のサーバー再起動依頼を受け調査。旧サーバーは稼働していたが、両Checkoutがexpired/unpaid。停止後、新しい認証で限定cleanupを実行し、顧客2削除/Price3・商品1inactive/文書4削除、エラー0と読取確認。契約・支払いは0件。旧manifest f93b9e01-0c6e-4908-b3b5-76a3e2c16512へ結果保存。

同じ承認済みの試験をUUID 6d212b81-3ff9-48e8-bd52-d04cefa7c423で作り直し、商品1/Price3/顧客・Checkout各2を用意。サーバーsession 86411、127.0.0.1:5213を再読込し、新しいリンク2件と準備完了を確認。購入待ち。既存利用者・配備設定は変更していない。


### 実購入・実保存・再送・片付け成功（2026-10-23）

本人が再起動後のCheckout2件を完了し結果確認を実行。実行UUID 6d212b81-3ff9-48e8-bd52-d04cefa7c423の2プランともverified=true、resultsエラーなし。追加の読取で実Firestoreの購入status=completeと利用権各1件/revoked=falseを確認し、秘密を含まない証跡を/tmp/calendar-integration-completion-evidence.json（0600）へ保存。

- 月額600円：成功正本2026-10-23T14:40:42Z、日本時間10月23日23:40:42。排他的期限2026-11-22T15:00:00Z（11月23日0:00）、11月22日いっぱい利用。月額契約1件。実月次契約のPrice/期間末が初回権利と一致。
- パック980円：成功正本2026-10-23T14:41:17Z、日本時間10月23日23:41:17。排他的期限2027-01-22T15:00:00Z（1月23日0:00）、1月22日いっぱい利用。自動更新契約0件。
- ローカル確認処理で成功Eventを再送して、利用権内容・期限不変、月額契約1/パック0、利用権各1を確認。これは実Stripe Eventのローカル再署名による実ハンドラー/実Firestoreの初回結合成功。実Stripe外部HTTP配送・Callable認証・新更新通知/3DS日跨ぎ・実利用者のアプリ権利反映は今回範囲外。
- 承認済みの今回分cleanupを実行し、エラー0。月額契約1件を追加請求/按分なしで取消、顧客2件削除、Price3件/商品1件inactive、予約/購入/権利の計6文書削除を再読取確認。両Checkoutはcompleteのため未払い画面失効は0件。テスト決済履歴は残る。既存契約・学習記録・配備設定・公開は変更なし。


## 外部署名配送・完了済み通知の再送試験の準備（2026-10-23、未配備）

追加購入を避けるため、先ほどの実PI成功Event2件を再利用する。Stripe正本/保存済み証跡から専用UIDの完了済み購入fixtureを一時保存し、Stripe自身から新しい隔離HTTPS受信先へ再送する。過去の全DB文書を忠実復元するものではない。新初回契約作成/更新通知/実Callable認証の成立とは区別する。

### 準備したコードとローカル確認

- billingWebhookHandlerへHTTP境界を抽出し、既存stripeWebhookと一時受信先で同じ署名/環境/エラー処理を使う。実業務処理はindexのprocessStripeBillingEventへ移し、本体/試験で共有。処理内容を複製しない。
- calendarWebhookProbeGuardは既知Event ID2件だけを許可し、type/PI/顧客/UID/予約/プラン/正本時刻/test環境、唯一のsandbox顧客対応、保存済みcompleteを確認。未知Eventは無処理200、既知の不整合は500で保留。
- prepare-calendar-webhook-probeはローカルだけで専用codebase/calendarBillingWebhookProbeの配備用資料を生成する。秘密値・.env原本・node_modules・教材はコピーしない。出力先は/tmp/calendar-webhook-probe-6d212b81-3ff9-48e8-bd52-d04cefa7c423。確認のため一時的にnode_modulesの参照を付けてimport後、その参照は除去済み。
- 生成入口のexportがcalendarBillingWebhookProbeの1件だけ、秘密値の紐付けがSTRIPE_SECRET_KEYと**別名CALENDAR_PROBE_WEBHOOK_SECRET**だけ、maxInstances=1であることをローカルSDKメタデータで確認。既存STRIPE_WEBHOOK_SECRETを更新しない。購入受付はfalse、minInstances=0。probeのStripe clientではsubscriptions.create/cancelを禁止し、fixture漏れでも契約を再作成/取消ししない。
- calendar-webhook-probe-fixtureは承認後のみ、実Stripe session/PI/charge/Eventとgrant完全一致、月額契約が取消済みで本人/PIが一致することを読取確認。6文書すべて不在/同顧客の別所有者なし/取消マーカーなしをtransactionで確認して保存する。Stripeへの変更APIはない。事前checkpointを残し、削除は同checkpointの6パスと内容照合をしてtransaction削除→不在確認する。
- Functions92テスト（実SDKの署名7、専用対象ガード6を追加）と無引数/不明引数などのガード9件成功。生成入口の構文も成功。別担当レビューで追加必須問題なし。

### 実行時にまとめて承認する範囲

1. construction2ndへ東京の一時HTTPS関数1件（専用calendar-probe codebase、最小0/最大1、timeout120秒）を配備。既存の5関数/Hosting/一般購入受付は変更しない。
2. Stripe Sandboxにpayment_intent.succeededだけを購読する一時endpoint1件を作成し、API2024-06-20を指定。専用署名Secret1件をSecret Managerへ保存して一時関数だけに紐付ける。既存endpoint/既存署名値は変更しない。
3. 専用fixture6文書を一時保存し、既知成功Event2件をStripe公式CLI等から新endpointへ再送。CLIが未導入なら公式配布を作業用フォルダへ置き、キーはプロセス環境だけで渡す。秘密値をコマンド引数/ログ/チャットへ出さない。追加購入・新Stripe顧客/契約作成は不要。
4. 正しい外部署名のHTTP200、署名なし400、GET405、専用購入complete・正本時刻/期限・利用権各1と非増殖を確認し証跡を残す。知らない通知の無処理は、業務処理成功と取り違えない。
5. 一時endpointを無効化→一時関数を削除/停止して読取確認→最後のリクエスト終了から最大120秒を複数の短い待機で待つ→6文書削除/不在確認→今回endpoint/専用Secretを削除/読取確認。既存秘密値・契約・学習記録は対象外。--receiver-stoppedは自動検知ではなく、この手順で保証する。

初回配備前はendpointの署名値がまだないため、endpoint作成→専用Secret登録→一時関数配備→fixture保存→再送の順を予定する。予定URLでのendpoint登録可否と実際の関数URLを照合し、違う場合は今回endpointだけ修正する。実行前には現在のendpoint数/関数名衝突/専用Secret名の既存有無も読取確認し、既存物があれば上書きせず保留する。

費用は関数配備ビルド/実行等の少額利用が発生し得るため、無料とは断言しない。既存1000円アラートの設定は変更しない。本番マージ・一般販売とは別の一時試験で、まだ配備/endpoint作成/秘密値登録/fixture保存/再送は行っていない。

参考：Stripe公式[再送と配送動作](https://docs.stripe.com/webhooks#manual-retries)はDashboardで15日、公式CLIで30日までの再送を案内。現時点のEventは当日のもの。再送しても自動再試行の打切りにはならないため、cleanupはendpoint無効化/削除を先行する。


## 実Stripe外部署名配送・完了済み通知再送の成功（2026-10-24）

本人が一時受信先/別Secret/Stripe endpoint/専用fixture6文書と既知Event2件再送・今回分cleanupを承認。既存5関数とendpoint1件の名前/更新日時/URL/有効状態/購読/API版を事前保存し、一時関数名/Secret名の未使用と実Event2件の残存を読取確認。公式CLI1.55.1を/tmpの作業用フォルダへ導入した（グローバル設定変更/CLIログインなし、キーは子プロセス環境だけ）。

### 実行・証拠

- Stripe Sandboxへpayment_intent.succeededだけの一時endpointを作成し、配備完了までdisabled。専用CALENDAR_PROBE_WEBHOOK_SECRETを新規作成。既存STRIPE_WEBHOOK_SECRETの値は更新していない。
- calendar-probe codebaseのcalendarBillingWebhookProbeだけを東京へ配備。最小0/最大1、timeout120秒、署名Secretの紐付けがSTRIPE_SECRET_KEYと専用署名だけであることを実メタデータで確認。通常の本体5関数/Hosting/一般受付は配備対象外。
- 初回の非対話配備は、importした本体の未使用パラメータが未指定で配備前に停止。専用UID/配信false/例示用無効URL/無効な旧Price・Portal値を試験用envだけへ補い、次の配備で成功した。元環境ファイルは変更していない。成功処理ログもEvent ID/typeだけを記録するよう生成器へ追加。
- 実Stripe session/PI/charge/Eventと初回grantが一致し、月額契約が取消済みであることを確認後、専用完了fixture6文書をtransactionで保存。新規支払い/顧客/契約は作成しない。
- 実関数URLを取得し今回endpointだけへ設定。GET405、署名なしPOST400を確認し、endpointを有効化して先ほどの実成功Event2件を公式CLIから再送。
- Cloud Loggingのcalendar-probe-processedで既知Event2件が共通の実業務処理を完了したことを確認。同期間のリクエストログでHTTP200が2件。unknown通知のignoredとは区別した。
- 実Firestoreを読取し月額/パックともcomplete、初回grantの全項目/正本時刻/期限がfixtureと一致、利用権各1件。customer.updatedAtがfixture保存後へ更新されたことも確認。Stripe契約は月額の取消済み1件/パック0件で、稼働契約は両方0のまま。

### 後片付け・範囲

今回endpointをdisabledにして読取確認→一時関数削除/GET404→削除確認後120秒待機→checkpointで指定した6文書を内容照合/transaction削除/不在確認→今回endpoint削除/resource_missing→専用Secretのrun_id/purpose照合後削除/GET404。すべて成功。最後に既存5関数の名前/更新日時、既存endpoint1のURL/有効状態/購読/API版が事前値と同じことを確認。完了は2026-10-24 00:37ごろ（日本時間）。

秘密を含まない実行manifestは/tmp/calendar-external-probe-state.json（0600）に結果/停止時刻/削除確認を保存。Secret/キー/Event本文/client_secretは記録しない。Cloudの試験ログ・ビルド記録やStripeの過去履歴は残る。コンテナ保管は既設の1日保持方針に従い、既存artifact全体の削除はしていない。

配備資料に未使用設定が揃い、公開export1/別署名Secret/最大1instanceになることをローカルSDKで自動検証するテストを追加。Functions93件と実行ガード9件が成功。実行後のコード差分は生成器の未使用設定/安全な成功ログとこの回帰テストだけで、本体の追加配備はしていない。

成立したのは **Stripe自身の外部署名配送＋完了済み成功通知の実再送と実DB非増殖**。新初回契約作成の外部自動通知、更新invoiceの実付与、実Callable認証、3DS日跨ぎ、配信基盤の長時間自動再送は今回の成立範囲外。一般販売/本体PRマージを許可されたとは扱わない。


## 更新invoice専用の実外部試験準備（2026-10-24、実行承認待ち）

隔離時計4ケース（通常日/月末/閏年/1日）で既に生じた更新請求書8件とinvoice.paid8件が残存。全8件を固定APIのinvoice/charge/取消済みsubscriptionと現在のcalendarRenewalGrantへ読取照合し、一致を確認した。追加の購入/顧客/契約/時計は不要。過去の時計時刻から作る完了fixtureであり、実初回PI成功Event時刻の復元とはしない。

- prepare-calendar-renewal-probe.mjsがローカル資料だけを生成。calendar-renewal-probe codebaseのcalendarRenewalWebhookProbeのみ、東京・最小0/最大1・timeout120秒。署名Secretは別名CALENDAR_RENEWAL_PROBE_WEBHOOK_SECRETで既存値に触れない。すべての未使用パラメータも無効値を明示する。
- calendarRenewalProbeGuardは同じ隔離runの4UID/4顧客/4契約/8Event/8Invoiceと正確な時刻・600円・Price・元加入日基準期間・唯一所有者・complete購入に限定。未知通知はignored、既知不一致は保留する。Stripe clientのsubscriptions.create/cancel/updateは禁止。
- 実保存EventはAPI2026-09-30.endiveで生成され、固定API2024-06-20で取得するinvoiceとsubscription/price等の項目構造が異なった。通知では不変のID/種別/環境/作成時刻/顧客/支払状態/金額を照合した後、正本invoiceを固定APIで再取得して契約/価格/期間を厳密照合する。形式差を課金成功と取り違えず、移行や既存本体API版の変更はしない。未使用Priceの無効値もレジストリの書式に適合する専用値へ訂正し、生成前にレジストリ検証する。
- calendar-renewal-probe-fixture.mjsは顧客対応4/完了購入4だけをseed。8対象grantを含む最大16パスすべて不在・別所有者なし・返金マーカーなしをtransaction確認し、commit前checkpointを残す。seed前に実Stripeの8件を再照合する。--verify-renewal-fixtureは同じ照合だけで外部書込0を確認済み。
- cleanupは受信先停止/待機を前提に、checkpointの最大16パスだけを内容一致確認してtransaction削除・不在再取得する。--receiver-stopped自体が停止を検知するわけではない。初回grantをseedしないためその保持は試験範囲外。全期間が過去なので現時点の有料画面/実認証試験でもない。
- Functions99件（新ガード/保存非増殖/形式差/配備資料6件を追加）、実行ガード15件、既存全npm test成功。配備資料のexport1/別Secret2紐付け/最大1instanceをSDKで確認。外部配備/DB書込/再送は未実施。

### 次の一括承認範囲

一時HTTPS関数1件・専用署名Secret1件・Stripe Sandbox endpoint1件（invoice.paidのみ、固定API）を作り、seed8文書へ既知8通知をStripe自身から再送。再送の非増殖を確かめるため同8件をもう1回（合計16配送）送り、各期間/利用権8件・購入不変・契約数不変・HTTP200/処理ログを確認する。実行後endpoint無効化→関数削除/停止の確認→最大処理時間120秒待機→今回最大16文書削除/不在確認→endpoint/専用Secret削除/不在確認。既存5関数/endpoint1件の前後照合も行う。クラウド配備/実行費用が少額発生し得る。一般販売/本体配備/既存記録の変更とは別の承認範囲。


### 更新試験の一括承認（2026-10-24）

本人が「試験と後片付けを一括実行する」を選択。受信関数/専用秘密設定/Stripeテスト通知先を各1件、既存更新通知8件を各2回、試験記録最大16件と今回分削除、少額のクラウド費用の可能性を含む範囲。実課金/追加購入/既存契約/学習記録は対象外。実行・結果は後続に追記する。


## 更新invoiceの実外部署名配送・実付与・重複防止（2026-10-24）

承認された範囲で、既存5関数/Stripe通知先1件を事前記録し、試験名/専用Secret名の未使用を確認。invoice.paidだけの専用endpoint1件（配備中disabled）とCALENDAR_RENEWAL_PROBE_WEBHOOK_SECRETを作成し、calendar-renewal-probe codebaseのcalendarRenewalWebhookProbeだけを東京へ配備した。最小0/最大1、timeout120秒、署名Secretは既存キーと専用署名の2件のみ。既存本体/Hosting/購入受付フラグは配備対象外。

固定APIの実invoice/charge/取消済みsubscriptionと8対象を再照合し、全16対象パス不在・別所有者/返金マーカーなしを確認して、顧客対応4/完了購入4文書だけを保存。実URL/配備メタデータを確認してendpointのURLを今回分だけ更新し、GET405/署名なしPOST400を確認後に有効化した。

既存の隔離時計4ケース（通常日/月末/閏年/1日）×更新2回の8件を、公式CLIから各2回（計16配送）再送。秘密値は子プロセス環境だけで渡し、CLIのEvent本文は出力/保存しない。追加の購入/顧客/契約/時計作成は行っていない。

### 結果

- Cloud Loggingのcalendar-renewal-probe-processedが8対象それぞれ2件、計16件。リクエストログもHTTP200が16件で、ignored通知とは区別する。
- 実Firestoreは各UIDの更新利用権2件、合計8件。全項目が正本の期待grantと一致し、元加入日から計算した開始/終了日時を保持。繰り返し通知で16件へ増えない。
- 完了購入4件は保存時の全項目と一致。顧客対応4件のupdatedAtだけがfixture保存後に進んだことを確認。
- Stripeは各顧客の契約が既存の取消済み1件だけ、稼働0件。作成/更新/取消APIを禁止した専用clientで契約数不変を確認。
- 初回付与はfixtureに含めないため、初回grantと更新grantの合算保持は今回の成立範囲外。期間は過去なので、現在の有料画面/実Callable認証の成立でもない。

最初のログ取得で429が返ったが、16件の配送自体は全て送信済みだった。追加の再送はせずendpointを無効化してDBを読取確認し、ログをまとめて1回取得する方式へ切替。全16処理/HTTP200を取得でき、ログ取得の一時制限を決済処理エラーと取り違えていない。

### 後片付け

試験endpointを無効化し、専用受信関数を削除。削除の404確認後に120秒の処理待機を設け、checkpointで列挙した最大16文書だけを内容照合して削除する。endpoint/専用Secretの削除と、既存5関数/通知先1件の前後不変照合を続けて行う。最終結果は直下に追記する。


最終cleanup：すべて成功。endpoint disabledを再取得し、専用関数削除の404確認から120秒待機。checkpoint指定の16文書を内容照合してtransaction削除し、全16パスの不在を再取得した。今回endpointを削除/resource_missing、専用Secretのrun_id/purposeを照合して削除/404。既存5関数の名前/更新日時と、既存endpoint1件のID/URL/状態/購読/API版は事前記録と完全一致。完了は2026-10-24 02:00ごろ（日本時間）。

秘密を含まない実行manifestは/tmp/calendar-renewal-external-state.json（0600）。16配送の対象と、各Event2件の処理ログ/HTTP200×16、DB4ケース、無署名400/GET405、削除・既存設定照合を保存。外部のログ/ビルド記録/Stripe履歴は残り、既設artifact1日保持を適用する。実行後の変更は結果の文書化だけで、関数/アプリのコード変更や追加の本体配備はない。
