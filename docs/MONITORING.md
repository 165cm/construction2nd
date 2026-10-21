# 障害通知と費用確認

2026-10-21、ユーザー承認済みの通知先でGoogle Cloud Monitoringを実設定。対象プロジェクトは `construction2nd`。通知先メールそのものはリポジトリに保存しない。設定作成と実受信を区別する。

## 作成・読み戻し確認済み

| 対象 | 設定 | 設定ID |
|---|---|---|
| メール通知先 | 運営者が承認した受信先、enabled=true | notificationChannels/11969462845169438331 |
| サイト | HTTPS GET `/`、期待HTTP200 | uptimeCheckConfigs/construction2nd-site-lQDIifshkLU |
| 教材API | HTTPS GET `/api/content?exam=r7_2`、未認証の期待HTTP401 | uptimeCheckConfigs/construction2nd-content-auth-CW4tTPFhY5I |
| サイト継続異常通知 | 上記サイト監視の2地域以上が10分継続失敗 | alertPolicies/15005552917483568885 |
| 教材API継続異常通知 | 上記API監視の2地域以上が10分継続失敗 | alertPolicies/15005552917483568159 |
| 決済通知の処理例外 | 下記のログ一致、通知間隔の下限5分 | alertPolicies/6443822151800164676 |

両外形監視はアジア太平洋・欧州・南米の3地域、5分間隔、タイムアウト10秒、HTTPS証明書検証あり。外形通知は `check_passed` を `ALIGN_NEXT_OLDER`（1200秒）→ `REDUCE_COUNT_FALSE`、対象リソースごとに集約し、失敗数>1が600秒続いた時に通知する公式例の構成。チェック周期・データ反映時間もあるため即時検知ではない。3通知ルールとも有効で、同じ承認済み通知先に接続。データが来なくなった通知の自動終了は30分。

決済通知のログ条件：

```text
resource.type="cloud_run_revision"
AND resource.labels.service_name="stripewebhook"
AND (textPayload:"billing-webhook-retry" OR jsonPayload.message:"billing-webhook-retry")
```

実コードの `console.error('billing-webhook-retry', ...)` を対象にする。独自ログメトリクスやイベントIDごとの通知ルールは増やしていない。

## 確認済みの範囲と残り

- 作成前の直接アクセスでサイト200・未認証教材API401を確認。
- 作成後、通知先・外形監視2件・通知ルール3件をAPIで個別取得。期待応答、周期、地域、HTTPS検証、集約条件/閾値/継続時間、通知先との接続、有効状態を照合。同じ設定を再取得する処理でも重複作成なし。別担当が公式仕様とスクリプト/証跡を読取レビューし重大な誤設定なし。ただし別担当による独立API再取得は未実施。
- メール通知先のAPI上のverificationStatusは未指定。これをメール到着済みや認証失敗と読み替えない。実受信の確認は未実施。
- 初回の実行結果をMonitoring時系列APIから取得し、サイト/APIの双方で欧州・アジア太平洋・南米の3地点すべて `check_passed=true` を確認（2026-10-21 08:26〜08:29日本時間の観測）。一時点の成功で今後の継続稼働やメール到達を保証しない。
- サイト監視はHTTP200の監視で、JavaScriptの起動・画面操作の成功は保証しない。教材API監視は認証なしの拒否応答を確認する。有効な購入者の教材取得、全画像、全API、Stripe基盤の通知未着まで網羅するものではない。`billing-webhook-retry` を出す前のプロセス停止や、処理例外を出さずHTTP200で終了する対応不明イベントも検知対象外。
- 意図的停止でAPIが503になると外形監視も通知する。計画停止時はMonitoringで対象通知ルールの一時停止（Snooze）を検討し、終了後に復帰を確認。無承認で本サービスを停止して発報テストしない。

## 2026-10-22の読取再確認

- 承認済みメール通知先はenabled=true、3通知ルールすべてenabled=trueで同じ通知先へ接続。APIのverificationStatusは未指定のままで、到着確認済みとはしない。ルール一覧の次ページなしも確認。
- Cloud Billingはプロジェクトへの紐付けが有効。Budget APIのサービス状態はDISABLEDであり、予算一覧は取得できていない。これは予算未設定の証明ではない。API有効化/重複予算作成/既存設定変更は行わない。
- 本人に管理画面の既存「予算とアラート」で、月単位/1,000円/対象にconstruction2ndを含むこと/通知しきい値と受信先をまとめて確認してもらう。存在しない場合もこの段階では新規作成せず結果を共有する。
- メール受信の実試験と費用通知の設定確認は別。今回のGET照合でメール送信・意図的障害・契約変更は行っていない。

## 通知を受けた時

1. [アラート一覧](https://console.cloud.google.com/monitoring/alerting?project=construction2nd)と[稼働監視](https://console.cloud.google.com/monitoring/uptime?project=construction2nd)で対象・発生時刻・地域を確認し、意図的な停止試験かを確認する。
2. サイト/APIならHostingと対象Functionsのログ・応答を確認。決済通知ならCloud Loggingの上記ログとStripeのイベント・配信結果を確認する。認証情報や利用者情報を公開issueへ貼らない。
3. 新規購入停止・対象別復旧・通知再送は [停止と復旧の手順](audits/2026-10-21-release-operations.md)に従い、対象と影響を確認して承認を得る。通知ルールの作成は返金・契約取消・権利上書きの許可を意味しない。
4. 復旧後に応答と利用権の整合を確認し、発生原因/対象/復旧内容を記録する。

## 費用

2026-10-22、本人提供の一覧/編集画面から既存予算「Monthly ¥1000 Alert」を確認。月別・目標額1,000円、実費50%/90%/100%（500/900/1,000円）、アラートのみ、課金管理者とユーザーへのメール通知が有効。Monitoringメールチャネル連携・Pub/Subは未選択で、予算通知の個別宛先指定は行っていない。

`construction2nd`からリンクされる請求先が、この予算を表示した請求先であることは本人確認済み。編集画面のプロジェクト/サービス絞り込み詳細は画像に写っていないため、この予算をプロジェクト単独専用とまでは断定しない。

親がCloud BillingのIAMをGETで読み取り、承認済みメール通知先と同じ受信先に、当該請求先の`roles/billing.admin`が直接・条件なしで付与されていることを確認。実アドレス/請求先ID/ポリシー全体は文書へ保存しない。金額・期間・しきい値・ロール通知の受信対象を照合できたが、メール実到達は未確認。

Budget APIはDISABLEDのままで、APIからの予算内容取得はしていない。API有効化・新規予算作成・設定変更は行わず、本人の画面証跡を確認根拠とする。以前の請求先画面読み込みエラーによる確認待ちは、この画面提供で解消。今回の予算はアラートのみで、自動停止は選択されていない。

今回の外形監視は30日換算で2対象×3地域×288回/日×30日＝51,840地域実行/月。2026-10-21確認の公式料金では外形監視は各プロジェクト月100万地域実行まで無料枠がある。Functions呼出し/計算・ログ等は別であり、総額1,000円以下を保証しない。設定を増やす時や料金改定時は再確認する。

## 一次資料

- [稼働監視の通知JSON例](https://docs.cloud.google.com/monitoring/alerts/policies-in-json)
- [外形監視設定API](https://docs.cloud.google.com/monitoring/api/ref_v3/rest/v3/projects.uptimeCheckConfigs)
- [ログに一致した時の通知](https://docs.cloud.google.com/logging/docs/alerting/log-based-alerts)
- [Observability料金](https://cloud.google.com/products/observability/pricing)

- [Google Cloud：予算と通知先の設定](https://docs.cloud.google.com/billing/docs/how-to/budgets?hl=ja)（ロール宛て通知と、アラートのみの予算は自動停止しないことを確認）
