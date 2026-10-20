# 公開前の並列点検と停止・復旧の準備

2026-10-21。ユーザー承認により検証記録・監視/費用・停止/復旧を3担当で並列に読み取り点検し、統括担当が結果を照合。この初回点検では設定変更、通知送信、購入/返金、デプロイ、PRマージは行っていない。その後の承認済み反映・監視設定は下記と MONITORING.md を参照。

## 現在の状態

検証サイトは https://construction2nd.web.app/ 。ユーザー承認でPR #82の購入停止時の解約入口維持を反映済み。#77〜#81は検証/記録の追加のみ。有料分離の事前テスト成功、配信HTML・アプリ入口・AccountPanelが生成物と完全一致。Hostingだけを反映し、Functions・契約・記録は変更していない。一般販売・本番Stripe切替・関連PRのmain統合は未実施。

Cloud Functions APIを読み取り、東京の5関数（stripeWebhook/createCheckout/createBillingPortal/billingAccess/privateContent）がACTIVE、最大インスタンス3、BILLING_SANDBOX=true、BILLING_ENABLED=true、PRIVATE_CONTENT_ENABLED=true、許可UID数1を確認。更新時刻は2026-10-19。秘密値、許可UIDそのもの、請求先ID、通知先は出力/保存しない。最大インスタンス数は費用の完全な上限ではない。

## 3担当の結果

| 担当範囲 | 結論 | 対応 |
|---|---|---|
| 記録照合 | 新しい記録は実サービス/模擬/エミュレータ/実機を概ね区別できている。初期準備資料には古い「未実装/未確認」が残る | BILLING_SETUP/PRIVATE_CONTENT/FIREBASE_SETUP/PRIVATE_HOSTINGの冒頭に現在の段階と履歴の範囲を追記。確認済み基本操作の繰り返しはしない |
| 監視・費用 | ログは保存されているが、障害の自動通知と外形監視が未設定 | 下表の不足に対応。予算通知は未確認なので管理画面で確認する |
| 停止・復旧 | 購入停止で解約入口も消える不具合。教材API停止は即時表示停止と異なる。対象別の復旧手順が不足 | 解約入口は修正を準備、以下に停止の範囲と復旧手順を整理 |

## 監視設定の読み取り証跡

Cloud Monitoring/Logging/Billing公式APIを保存済み認証で読み取り、全ページの件数を集計した。認証情報はメモリ内だけで使用。

| 対象 | 応答/集計 | 判定 |
|---|---|---|
| alertPolicies | HTTP200、0件 | このプロジェクトの自動障害通知ルールは未設定 |
| notificationChannels | HTTP200、0件 | このプロジェクトの障害通知先は未設定 |
| uptimeCheckConfigs | HTTP200、0件 | このプロジェクトの外形監視は未設定 |
| logBasedMetrics | HTTP200、0件 | 独自ログ集計なし |
| projectBillingInfo | HTTP200、課金有効/請求先紐付あり | 課金接続済み。金額や予算設定の証拠ではない |
| 予算一覧 | HTTP403、SERVICE_DISABLED | 未確認。APIは有効化していない。請求先の予算が存在しないという意味ではない |
| 過去7日のCloud Runログ | HTTP200、1,000件以上。ERROR5件、billing-webhook-retry 0件 | ERRORはprivateContentのHTTP503リクエスト。意図的停止試験とも整合し、実障害と断定しない |
| ログ保存先 | _Default/_Required有効、除外0件 | ログ保存は存在。ただし自動通知とは別 |

### 初回点検後の対応（承認済み）

ユーザーが障害通知先と月額目安1,000円を回答。外形監視2件・通知ルール3件・メール通知先1件を実作成し、APIで個別取得・有効状態/通知先接続を確認済み。地域別初回結果とメール受信は未確認。予算は設定済みのはずとの本人申告で、既存設定を変更せずAPI未確認のまま残す。詳細は [監視と費用確認](../MONITORING.md)。以下は初回点検で挙げた計画であり、現在の完了範囲は同資料を優先する。

1. 費用：運営者が請求管理画面で予算の有無を確認。月額予算と通知先を確定し、未設定なら予算通知を用意する。予算通知は支出を自動停止するものではない。
2. 稼働監視：サイトのHTTP200と、認証なし教材APIの想定401を別々に監視。監視対象/間隔/連続失敗条件を決めてから設定する。実認証した有料教材の正常性まで保証する監視ではない。
3. 障害通知：Cloud Runの継続的な5xxと `billing-webhook-retry` を検知するルールを用意する。意図的な停止/試験を区別し、受信先を確認する。ルール作成・通知テストは承認後に行う。
4. 通知を受信できること、運営者がログ/Stripeイベントから原因を追えることを確認して完了にする。手順書だけで設定済みにしない。

## 購入停止と解約入口

コード根拠：`functions/index.js` のcreateCheckoutはBILLING_ENABLEDを確認、billingAccess/createBillingPortal/stripeWebhookは購入停止だけでは止めない。

修正前はPricingPlansの解約ボタンも購入可否に依存したため、購入停止時に画面から消えた。今回、onManageが提供されていれば購入可否と独立して表示するよう修正。操作中の無効化とサーバー側の本人/許可UID/顧客/Portal設定確認は維持する。契約がないアカウントに契約を作成する処理はない。2026-10-21にユーザー承認で検証サイトへ反映し、配信成果物の一致まで確認済み。

自動テストで有効/期限切れ相当の双方を確認。ローカルの料金部品で390×844・844×390・1280×800を確認し、購入2ボタンは停止、契約管理は高さ44px・操作可能、模擬コールバックが1回ずつ動くことを確認。実Stripe Portalへは遷移していない。

### 購入受付を止める手順案（実行していない）

1. 停止理由・対象環境・現在の正常版/非秘密設定を記録し、反映対象を示して運営者承認を得る。既存購入者の教材利用と解約を維持する方針を確認。
2. 対象環境の非公開Functions設定でBILLING_ENABLED=falseへ変更し、レビュー済みの同じソース版からFunctionsへ反映する。ローカルの設定ファイルを変えるだけでは稼働中の関数に反映されない。privateContentも反映対象に含める場合は、同じ正常なソース版で `npm run test:private-staging` を先に実行し、Git対象外の教材生成物も再生成・検証する。
3. 新規購入APIが受付停止になること、既存の利用期限/教材取得/契約管理・解約/通知受付が継続することを確認する。今回の画面修正を反映していない場合、サイト外の連絡窓口も確保する。
4. すでに発行されたopen Checkoutは購入停止フラグだけでは失効しない。対象を一覧で読み取り確認し、失効させる場合は対象と影響を別途承認してから操作する。
5. Stripeの月額更新も購入停止では止まらない。全顧客の契約取消・返金・利用権削除はこの手順に含めない。
6. 購入再開時は原因解消/設定照合/既存顧客維持を確認し、再開承認後に受付を戻す。VITE_BILLING_READYだけの変更はサーバーの購入拒否の代わりにならない。

## 教材停止・サイト停止の範囲

| 操作 | 止まるもの | この操作だけでは止まらないもの |
|---|---|---|
| BILLING_ENABLED=falseをFunctionsへ反映 | 新規Checkout作成API | 発行済みCheckout、既存月額更新、教材/利用期限/通知/解約 |
| PRIVATE_CONTENT_ENABLED=falseをFunctionsへ反映 | その後の教材JSON/画像API（503） | 取得済み教材の表示。30秒ごとのbillingAccessが有効なら保持期限を更新できるため、60秒以内の一律停止を保証しない |
| Hostingをメンテナンス表示へ変更 | 新しいサイトアクセス | 開いたままの画面、Functions直接呼出し、Stripe定期請求 |

既存の最大60秒保持期限は、利用権失効を検知して教材を破棄するための仕組み。配信APIの受付停止を全画面の即時停止に読み替えない。即時表示停止を要件にするなら、利用権照会が返すサービス停止状態とクライアント破棄を別途設計・検証する必要がある。実行前に運営者へ影響と制約を説明する。

## 障害からの復旧

### Webサイトだけの不具合

- 正常なHosting版とそのソース/非秘密設定を確認し、戻す対象と影響を承認してからHostingの履歴から正常版へ戻す。
- `firebase.private.json` は関数の `pinTag` を設定していない。Hostingだけを戻してもFunctions/設定/Firestoreの内容は元に戻らない。
- ソースから再ビルドする場合は `npm run test:private-staging` で有料200問と画像の分離を検証し、`dist-private-site` と専用Hosting設定を使う。通常の `npm run build` の出力を有料版Hostingへ代用しない。
- HTMLと主要JSの生成物一致、無料表示、既存購入者の認証/教材、解約入口を確認する。PRを戻しただけでFirebase全体が復旧したとは判断しない。

### Functions/通知処理の不具合

- 先に新規購入停止を検討し、既存顧客の利用・解約と通知受付を可能な限り維持。正常なFunctionsソース版と対象環境の非秘密設定/秘密設定の対応を照合し、対象関数だけを承認後に再反映する。
- privateContentを再反映する場合、同じ正常なソース版で `npm run test:private-staging` を実行し、Git対象外の `functions/private-content` を再生成・検証してから反映する。Functions設定には教材を自動生成するpredeployがないため、ソースだけを戻した状態で教材不足/旧教材混在を起こさない。
- Stripeイベントの環境、イベントID、顧客対応、対象価格、支払/返金状態を読み取り確認。修正後、運営者承認の対象イベントだけをStripe側から再送する。
- HTTP200だけで復旧成功にしない。利用権が1件で開始/終了/返金失効状態が正しいこと、既存権利が復活/延長されていないことを確認する。
- 処理例外は500で再送を要求する。一方で顧客対応や対象価格が見つからず200で終わる分岐もあるため、不整合が自動再送だけで直るとは限らない。利用権の手動上書きは別途承認が必要。

## 一般販売開始の条件

- 運営者提供の情報で規約/プライバシー/特商法表示・価格/更新/解約/返金条件と問い合わせを用意し、利用者が到達できることと窓口の送受信を確認する。法的な充足性の判断は今回のコード監査範囲外。
- 上記の費用・障害通知、停止・復旧の役割と実行権限を準備する。
- 全5関数の環境を照合。BILLING_SANDBOX=falseは許可UID制限を外し、本番の保存先へ切り替えるため、単なるテスト表示の削除ではない。鍵・価格・Portal・通知署名/API版・SITE_URL・データ分離を購入停止のまま確認し、最後に購入受付を有効化する。
- 本人実機済みの基本操作を繰り返さず、未確認の実認証HTTP/複数タブ/2端末競合/画像単体失敗/改修後実失効/別ブラウザ等は実施か残リスクを明示して運営者が公開前に判断する。監査担当だけで未検証を合格扱いにしない。
- 積み重なったPRを依存順にレビューし、対象PRの本番公開承認後に統合する。今回のUI修正は承認済みの検証サイト反映まで完了。mainへのマージは別途承認が必要。

## 一次資料

- [Functionsの環境設定](https://firebase.google.com/docs/functions/config-env)
- [Hostingの版とロールバック](https://firebase.google.com/docs/hosting/manage-hosting-resources)
- [HostingとFunctionsの連携・pinTag](https://firebase.google.com/docs/hosting/functions)
- [障害通知ルール一覧API](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.alertPolicies/list)
- [Monitoring API](https://docs.cloud.google.com/monitoring/api/ref_v3/rest)
- [予算一覧API](https://docs.cloud.google.com/billing/docs/reference/budget/rest/v1/billingAccounts.budgets/list)
- [Logging API](https://docs.cloud.google.com/logging/docs/reference/v2/rest)
