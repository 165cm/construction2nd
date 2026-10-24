# 外部取扱い・保存期間・決済設定の読取確認

初回確認日：2026-10-22、補足更新：2026-10-24（日本時間）。公式資料の一般仕様、稼働プロジェクトの実設定、未確認の本番設定を分けて記録する。2026-10-22の読取調査自体では設定変更・契約操作・個人の学習記録取得は行っていない。その後の承認済み隔離決済試験は、末尾の最新補足と別の試験証跡を参照。

## 1. 実APIで確認できた設定

Google Cloudの既存認証をメモリ内で使用し、FirestoreのDB情報、Functionsの状態/限定した環境フラグ、Loggingのバケットと転送先をGETで取得。秘密値・UID・メール・ログ本文・顧客情報は出力/保存しない。API一覧の次ページなしも確認した。

| 対象 | 実確認結果 | 解釈の限界 |
|---|---|---|
| Firestore | Native、`asia-northeast1`（東京） | 認証/Hosting/ログ等も東京という意味ではない |
| Functions | 東京の5関数すべてACTIVE | 決済のモードは下記。稼働中というだけで本番設定の適正を保証しない |
| 決済モード | 5関数で `BILLING_SANDBOX=true`。購入/教材配信の有効フラグはtrue。パック/月額のPrice参照設定あり | サンドボックスの購入受付。一般販売や本番Stripeの確認済みとはしない。許可UIDの値は出力/保存しない |
| 通常ログのバケット | `_Default`、`global`、保持30日、ACTIVE | このバケット内の保持設定。他社ログや手元に保存した調査用の写しを含まない |
| 必須監査ログのバケット | `_Required`、`global`、保持400日、locked、ACTIVE | 一部監査ログの保持設定。すべての利用者情報/全Functionsログを400日保存する意味ではない |
| ログの転送先 | プロジェクトのsinkは上記2バケット宛ての2件。有効。追加のプロジェクトsinkなし | 上位組織/フォルダの設定、手動エクスポート、外部サービス側の保持は今回未照会 |
| Firestoreの復元機能 | PITRは無効、DB削除保護も無効 | 別のバックアップが一切ないことの証明ではない。今回は設定変更しない |

ログの `global` を日本国内限定と記載しない。公式のglobal仕様と契約を照合する。30日/400日の設定確認だけで、ログ内の取得項目・個別削除・全外部コピーの消去を保証しない。

## 2. Google/Firebaseの公式仕様と文案への反映

| 対象 | 公式資料にある一般仕様 | 文案への使い方 |
|---|---|---|
| Firebase Authentication | サービスは米国のデータセンターで稼働し、データを米国で処理 | Googleログインの利用に伴う米国処理を説明。Firestoreの東京設定で打ち消さない |
| 認証情報の保持 | 関連ユーザーの削除を顧客が開始するまで認証情報を保持し、削除後はlive/backupから180日以内に削除。認証IPログは数週間 | サービス提供者の一般仕様。クラウド学習記録削除の30日目標とは別。Googleアカウント自体の削除も別 |
| Hosting | IPを不正利用対策や利用状況分析に使い、数か月保持するとの説明 | アプリのCloud Loggingの30日をHosting全体の保持期間へ広げない |
| 地域選択 | 個別の選択を提供するサービス以外は、Google/代理人の施設で処理・保存され得る | すべて国内保存/国外提供なしとの表現は使わない |

上記は公式仕様の要約で、Firebase/Googleの契約全体や全サービスの保持期限を確定したものではない。利用中サービスに適用される契約・DPA、再委託先、国外取扱いの法的整理は別途確認する。GDPR上のprocessor等の説明を日本法上の評価へそのまま置き換えない。

公開文案の追加候補：

> GoogleログインにはFirebase Authenticationを利用し、認証に関するデータは同サービスの仕様により米国で処理されます。学習記録のFirestoreとFunctionsは東京の設定を使用していますが、認証、サイト配信、ログなどを含むすべての情報が日本国内だけで処理・保存されるものではありません。

この候補文だけで国外取扱いに必要な説明/同意が完成したとはしない。

## 3. 決済のコード照合

以下は2026-10-22に読取した旧480円の稼働経路。未配備の新600円経路とは分けて扱う。新コードと隔離試験の結果は末尾の補足を優先し、旧稼働値を現行の販売予定価格として転用しない。

| 項目 | 実装 | 残る本番確認 |
|---|---|---|
| 価格 | active/JPY/480円・980円、`tax_behavior=inclusive`を購入前に照合 | 本番Price・商品説明・税設定・確定画面の総額 |
| 周期・数量 | 月額は1か月周期、パックは非定期。数量1 | 本番の更新説明・請求日時 |
| 支払方法 | Checkoutは`payment_method_types=['card']` | 本番で実表示されるブランド/ウォレット等。カード指定だけで個別の対応を断定しない |
| 自動税 | Checkout作成パラメータに`automatic_tax`の指定なし | inclusiveの設定確認だけで自動税計算が有効とは書かない。実Session/請求書・総額と照合 |
| Portal | 有効、解約可、期間末解約、プラン更新不可を起動時照合 | 本番Portalの更新日時・締切・日本語表示・戻り先 |
| 利用権 | 支払後も480/980円等を照合し、不一致なら付与しない | 誤った金額で請求されない保証ではない。総額相違で支払済み利用不可にならないよう本番の事前照合が必要 |

現在稼働する設定はサンドボックス。本番の鍵・Price・Portal・Webhook・署名/API版・戻り先・データ保存先は本番切替の準備時に購入停止のまま照合する。テスト環境の成功を本番の確認済みへ振り替えない。本番切替や実請求を今回の調査では行わない。

根拠：`functions/billingPolicy.js` の `checkoutParams` / `assertConfiguredPrice` / `packGrant` / `monthlyGrant`、`functions/index.js` の `createCheckout` / `createBillingPortal`、`functions/billingEnvironment.js`。

## 4. 確認が残る保存・契約情報

公式資料の追加調査では、次を確認した。いずれも、このアプリの適用契約・実保存国・全情報の保持期間を確定するものではない。

| サービス | 一般的な取扱いと根拠 | このアプリで残る確認 |
|---|---|---|
| Stripe | 活動により管理者/処理者の役割が異なり、国外処理や法令/不正対策等の保持がある。Privacy Policy/DPAに説明 | 実際の契約主体と適用版、情報別の保持と運営側の保存義務。単一の年数を全データに当てはめない |
| Cloudflare Turnstile | IP・User-Agent・TLS等を処理し、サービス提供と検出改善で取扱いの役割が異なると補遺で説明 | 当アプリでの適用条件と必要な説明。Workersのログ保持をTurnstileの全情報の期間としない |
| GitHub | 国外移転・保存、目的/契約/法令等に応じた保持を説明 | リポジトリ設定・適用契約。Issue削除で第三者の写しも回収できるとはしない |
| Google Groups | 会話履歴とメンバーへのメール配信は別機能 | グループ履歴を消しても各受信箱の写しが消えたとは扱わない。削除対象一覧と担当が必要 |

- **運営側の決済記録**：本人の申告方法は未定（2026-10-22回答）。原資料とアプリ用情報を分けた [保存準備](BILLING_RECORDS.md) を作成。税務・請求・不正対策・紛争対応で必要な情報と期限を区別。Stripe自身の保持期間と運営者の税務保存期間は同じとは限らない。推測の年数を採用しない。
- **Google Groups**：グループ履歴、各メンバーの受信メール、添付・転送・バックアップの写しを区別。通常問い合わせの完了後最長1年の方針を満たす [削除対象・手順案](SUPPORT_RETENTION.md)を作成。実保管先確認と対象限定の試験は未実施。
- **Cloudflare/GitHub**：サービスごとの役割、契約、国/国外アクセスと実際のログ保持・公開範囲を確認する。投稿本文へ利用者が入力した個人情報は混入し得る。
- **認証・学習記録**：Firestore文書の削除と認証ユーザー削除、端末データ、外部バックアップは別。アカウント削除手順と本人確認方法を整備する。
- **解析・追加収集**：対象ソースと公開ファイルの検索ではAnalytics/gtag等の追加実装は見つからない。ただし外部管理画面の連携設定や事業者自身の処理まで「収集なし」と断定しない。

## 一次資料

- [Firebase Privacy and Security](https://firebase.google.com/support/privacy/)（認証/Hostingの保持・処理地域）
- [Firebase Data Processing and Security Terms](https://firebase.google.com/terms/data-processing-terms/)（対象契約の適用は要確認）
- [Cloud Loggingの転送と保存](https://docs.cloud.google.com/logging/docs/routing/overview)
- [Cloud Loggingの保存場所](https://docs.cloud.google.com/logging/docs/region-support)
- [Cloud Loggingの保持期間](https://docs.cloud.google.com/logging/quotas)
- [Stripe Priceのtax_behavior](https://docs.stripe.com/api/prices/object)
- [Stripe Privacy Policy](https://stripe.com/privacy) / [Stripe DPA](https://stripe.com/jp/legal/dpa)
- [Cloudflare Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/)
- [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [Google Groupsのメール配信](https://support.google.com/groups/answer/9792489?hl=ja) / [投稿・削除](https://support.google.com/groups/answer/1046523?hl=ja)

実設定のAPI読取、決済コード読取、サービス公式資料調査を分担実施。文書の追記は運営方針の勝手な追加や設定変更を意味しない。

## 2026-10-22の追加本人確認と公表方法

- Google/GitHub/Stripeはすべて2段階認証またはパスキーを設定済みと本人回答。Googleグループの問い合わせ閲覧メンバーも本人アカウントだけと回答。これは管理画面の独立取得でなく本人確認に基づく。
- 個人情報取扱事業者の正式氏名/住所は同じサポート窓口への求めに遅滞なく回答する方式を本人採用。特商法の購入前開示とは別の目的・手続として本文へ反映。根拠：[PPC通則編3-8-1](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/)。実情報をGitやチャットへ収集しない。
- サービス別の適用契約/国外取扱いの確認は、MFA設定や本人回答だけで完了扱いしない。現在、一次資料と実データフローを照合中。

## 契約・国外取扱いの追加照合（2026-10-22）

公開前の残りを、実契約とデータの流れの確認へ絞る。法律上の根拠を初心者向け選択肢だけで決めず、まず適用される事実を確認する。

| サービス | 一次資料で分かった点 | 残る具体確認 |
|---|---|---|
| Firebase/GCP | Firebase DPAは対象契約が参照する場合に適用。サービスによってCloud DPAとの区別があり、Customer DataとGoogle管理のService Dataを混同しない。国外処理を認める一般条項がある | 使用サービスごとの適用契約/主体/再委託等と実データフロー。東京設定だけで全情報国内としない |
| Google Groups | 個人向け無料版と組織向け版がある。無料版にWorkspace CDPAが適用されるとは確認できない | 本人が個人向け無料版と回答済み。閲覧メンバーも本人のみ。Workspace CDPAを当然に適用せず、個人向けサービスの適用規約/説明と履歴設定・削除手順を確認 |
| Stripe | DPAは用途で処理者/独立管理者の役割を区別し、米国等への移転を説明。DPAがあるだけで日本法の全要件完了とはしない | 実際の契約主体/適用契約・送信フィールド。本番の決済表示照合とは別 |

必要な説明/同意や相当措置の判断は、確定した契約とフローから検討し、不確かな場合はその具体情報を添えて専門家確認する。現時点で追加同意画面の方式や全サービスの国外移転根拠を採用済みとはしない。

一次資料：[Firebase DPA](https://firebase.google.com/terms/data-processing-terms/)、[Firebase privacy](https://firebase.google.com/support/privacy/)、[Google Cloud Service Dataの説明](https://cloud.google.com/terms/cloud-privacy-notice?hl=ja)、[Groupsの版](https://support.google.com/groups/answer/46601)、[Workspace/Cloud Identityのデータ保護](https://knowledge.workspace.google.com/admin/compliance/privacy-compliance-and-records-for-google-workspace-and-cloud-identity)、[Stripe DPA](https://stripe.com/jp/legal/dpa)、[Stripe DTA](https://stripe.com/jp/legal/dta)、[PPC国外取扱い指針](https://www.ppc.go.jp/personalinfo/legal/guidelines_offshore/)。別担当の読取調査を統合、実アカウントの契約受諾/設定変更なし。

## 新料金・隔離試験の最新補足（2026-10-24）

本体の新コードは、旧480円/旧980円と新600円/新980円を正確なPrice ID・環境・JPY金額・税込・定額月次周期で分離する。新方式は初回600円の単発支払後に月次契約を作る二段階方式で、成功Eventの日時を正本として保存し、日本時間の新期間を付与する。旧Price参照・既存契約・保存済み期限は置き換えない。本体の新受付フラグは既定停止で、通常の本体Functions/Hostingはまだ配備していない。

本人承認の専用試験では、時計4ケースの初回/更新2回/解約、実Checkout初回2件、完了済み成功Event2件の実外部署名再送を確認。後者は実処理ログとHTTP200×2、署名なし400/GET405、両プランの完了・利用権各1・保存済み期限/契約数不変を確認した。一時関数・通知先・専用Secret・専用fixture6文書は停止/削除/読取確認済み。既存5関数と通知先1件が試験前と同じであることも照合済み。詳しい範囲と証跡は[価格期間改定の監査](../audits/2026-10-22-price-period-change.md)を参照する。

これらは本番Stripeの契約主体・適用契約・税/総額・Portal・本番鍵や署名・外部サービスの国外取扱いの確認を完了した意味ではない。隔離時計の更新8件は実外部署名配送/実付与/再送非増殖と今回分cleanupを確認済み。実Callable認証・3DS日跨ぎは別の残項目。初回の調査以降に承認された試験操作があるため、本書全体を「外部設定変更を一切していない」とは要約しない。
