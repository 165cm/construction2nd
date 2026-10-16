# しくみ（ARCHITECTURE）

## 全体

```
ブラウザ（React / Vite SPA）
   │
   ├─ src/App.jsx (メインルーティング・モード切替)
   ├─ src/data/exams/*.json + questionOverrides.json (5回250問)
   ├─ src/utils/sound.js (Web Audio API 効果音合成)
   ├─ src/utils/storage.js (LocalStorage & ゲーミフィケーション・時間推計)
   └─ public/crops/ & public/pages/ (図面・写真素材)
```

- クライアントサイド完全完結型 Single Page Application
- Vite 8 + React 19 + Tailwind CSS CDN + Canvas-confetti + Lucide-react

## ファイルの役割

| ファイル・フォルダ | 役割 |
|---|---|
| `src/App.jsx` | ルートコンポーネント。モード状態管理と各モーダルの統括 |
| `src/data/questions.json` | 令和8年度上期 全50問（問題文・四肢選択肢・公式解答・詳細解説・暗記ポイント・画像参照） |
| `src/components/QuizCard.jsx` | スマホ特化1問1答カード（親指タップ解答・即時判定・解説スライド） |
| `src/components/ReviewMode.jsx` | 弱点特訓画面（要復習・ブックマーク・未マスターの抽出と周回） |
| `src/components/ExamMode.jsx` | 本番模擬試験（120分タイマー・マークシート解答・60点合否判定） |
| `src/components/WiringDiagramModal.jsx` | 配線図（15頁 平面図・分電盤図）ズーム＆パン操作ビューア |
| `src/components/Header.jsx` | 年度・今日解いた数・記録/音声設定 |
| `src/components/StatsModal.jsx` | 分野別の記録・復習件数・学習設定 |
| `src/components/BottomNav.jsx` | スマホ下部固定ナビゲーション（5タブ） |
| `src/utils/sound.js` | Web Audio APIシンセサイザー（正解・不正解・コンボ・ファンファーレ・タップ） |
| `src/utils/spacedRepetition.js` | 解答履歴（ライトナーBox）による出題エンジン・中断再開ロジック |
| `src/utils/storage.js` | 理解度・平均解答速度・残りプレイ時間算出・実績判定ロジック |
| `src/components/Round1CompleteModal.jsx` | 第1巡（全50問）走破達成＆SRS復習移行アナウンスモーダル |
| `src/data/cropOverrides.json` | 共有トリミング座標（リポジトリ管理・全端末共通反映） |
| `src/components/CropImage.jsx` | 共有トリミング＆ローカルカスタム描画対応の画像表示コンポーネント |
| `public/crops/` | 回路図・材料写真・工具写真・器具記号の個別クロップ画像 |
| `public/pages/` | 全頁高精細PNG（配線図含む） |
| `public/manifest.json` | PWA Webアプリマニフェスト（スマホのホーム画面追加設定） |
| `public/icon.svg` | アプリアイコン（SVGベクター形式） |
| `public/sw.js` | Service Worker（オフライン動作・問題画像キャッシュ制御） |

## データ
- LocalStorage キー: `denkou2_mastery_state_v1`（`schemaVersion: 3`。2＝年度付きキー、3＝旧判定のマスターを「2回連続正解」基準に補正）
  - `records`: 各問題の挑戦回数、正解数、不正解数、連続正解数、ステータス（unattempted / review / correct / mastered）、Leitner Box（1〜4）、出題間隔（interval）。**キーは年度付き**（例: `r7_2_12` ＝令和7年度下期の問12）
  - `bookmarks`: クリップした問題（年度付きキーの配列）
  - `examProgress`: 年度ごとの進み具合 `{ [examId]: { round, currentQuestionId, currentQuizIndex } }`
    - `round`: 巡回フェーズ（1: 初回全問走破中、2: 適応型間隔反復復習ループ）
    - `currentQuestionId`: 中断時の再開問題番号（問10中断なら問11から自動再開）
  - 画面側は `getExamView(state, examId)`（`src/utils/storage.js`）で「選択中の年度だけ・問題番号で引ける形」に変換して使う
  - 旧形式（問題番号だけのキー）のデータは、読み込み時に「最後に選んでいた年度」の記録として自動で引き継ぐ
  - マスター判定は「2回連続正解」
  - `dailyLog`: 日ごとの解答数（端末の日付 `YYYY-MM-DD` → 問題数、直近120日）。「今日解いた数」「連続学習日数」に使う
  - `responseTimes`: 直近30問の回答所要時間（秒）配列（平均速度算出用）
  - `exp`, `level`, `streak`, `maxStreak`
  - `badges`: 獲得済み実績バッジID配列
- LocalStorage キー: `denkou2_exam_session_v1` … 受験中の模擬試験（年度ごとの解答・現在位置・終了時刻）。採点すると消える
- トリミング座標は `pageDir`（年度ごとの元ページ画像フォルダ。例 `/pages/r7_2`）を必ず持つ。無い場合はキーの年度から補う
- 問31以降（配線図問題）の画像は、「配線図ページ（P15）」と「問題文ページ（P11〜13）」のどちらからでも切り抜ける。どちらから切り抜いたかは座標の `page` で決まる（管理画面の①トリミング・②問題文エディタで切り替え）。問題文ページは `examLoader.js` が各問題に `questionPage` として付ける
- `cropOverrides.json` の各項目は `showImage`（true＝画像あり／false＝テキスト問題）を持てる。全端末で問題の「画像あり／なし」をそろえるために使う（`src/data/examLoader.js` が読み込み時に反映）。管理画面の「全端末へ反映するデータをコピー」には、この設定も含まれる
- LocalStorage キー: `denkou2_auto_advance_v1` … 解答後の自動送り設定（`always`＝いつも／`correct_only`＝正解の時だけ［初期値］／`off`＝オフ）。成績画面の設定、または解答後ポップアップの表示をタップで切り替え
- 学習記録のバックアップ（`src/utils/backup.js`）… 成績画面から、学習記録・設定・選択中の年度・受験中の模擬試験をまとめてJSONファイルに書き出し／読み込みできる（読み込むと今の端末の記録は置き換わる）
- 分野名は年度で書き方が違う（例: 「配電理論・配線設計」「配線器具・材料・工具」）。`examLoader.js` が読み込み時にアプリ共通の5分野（電気理論・計算／配線設計・機器／材料・工具／施工方法・法令・検査／配線図問題）にそろえる
- 弱点特訓は「この年度／全年度まとめて」と分野で絞り込める。年度をまたぐので、記録・ブックマークは年度付きキー（`globalId`）で引く
- LocalStorage キー: `denkou2_exam_fixed_order_v1` … 模擬試験を「本番と同じ並び（選択肢をシャッフルしない）」で出すか（初期値 ON）。受験中は開始時の設定を `denkou2_exam_session_v1` に保存して固定

## 管理画面の修正を公開サイトへ反映する流れ

管理画面（`#admin`）で保存した内容は、まず**管理者のそのブラウザだけ**に残る。全端末に反映するには次の流れ。

1. 管理画面上部の「公開サイトに未反映の変更が N 件」バーで、未反映の件数を確認
2. 「反映用データをコピー」を押し、AIとのチャットに貼り付けて「反映して」と伝える
3. AI は、貼られたデータの `cropOverrides` を `src/data/cropOverrides.json` に、`questionOverrides` を `src/data/questionOverrides.json` に、そのまま上書き保存して PR を作る
4. PR を公開すると全端末に反映される

- `src/data/questionOverrides.json` … 全端末に反映する問題文の修正。`{ 年度ID: { 問題番号: { 変えた項目だけ } } }`。書き換えてよい項目は `question`・`choices`・`answer`・`explanation`・`keyPoint`・`category`・`categoryTag`（`examLoader.js` の `QUESTION_TEXT_FIELDS`）
- 問題データの重なり順：元データ（`src/data/exams/*.json`）→ 共有ファイル（`cropOverrides.json` の `showImage`、`questionOverrides.json`）→ そのブラウザだけの修正（LocalStorage `denkou2_question_overrides_v1`）
- 反映用データ・未反映の件数は `src/utils/publishSync.js` が作る。保存していない変更は `src/utils/unsavedGuard.js` で見張り、問題・年度・タブを移る時やページを閉じる時に確認を出す

## 「異議あり」の報告の届け方（方式A）

```
アプリの「⚡️異議あり」 → Cloudflare Turnstile（ロボット確認） → Cloudflare Workers（workers/objection-receiver/worker.js） → GitHub の issue（ラベル「異議あり」と年度ID）
```

- 送信先（Worker の URL）と Turnstile のサイトキーは `src/config/objectionReport.js` に書く（公開してよい値）。空なら送信せず、その端末にだけ保存する
- 秘密の値（GitHub トークン・Turnstile シークレット）は Cloudflare の Worker の設定にだけ置く。準備手順は `workers/objection-receiver/README.md`
- Worker は、許可したサイト（`ALLOWED_ORIGIN`）からの送信だけを受け付け、Turnstile を確かめてから issue を作る。利用者の文字は @ や # を無効化して載せる
- 報告はその端末の LocalStorage（`denkou2_objections_v1`）にも残る（送信できたら issue 番号を記録）

## 管理画面の「⑤ 全問チェック」

`src/components/QuestionChecklist.jsx`。年度ごとに全問を見て、直すべき点（選択肢が4つない・空の選択肢・正解が選択肢にない・問題文や解説が空・画像ありなのに切り抜き位置も画像ファイルも無い・未対応の異議あり）を一覧にする。行を押すと②問題文エディタでその問題を開く（`AdminHub` の `openQuestionEditor`）。

## 読み込みの分け方

- 管理画面（`AdminHub` 以下）は `React.lazy` で別ファイルに分け、`#admin` を開いた時だけ読み込む（一般の利用者の最初の読み込みを約100KB軽くする）
- 残りの大部分は全5年度の問題データ。さらに軽くするなら、年度ごとに必要な時だけ読み込む形に変える（未対応）

## 問題ページ画像（高画質 WebP と管理用 PNG）

- `public/pages/**/page_N.webp` … 利用者の画面に出す高画質版（高さ約 2250px、WebP 品質85。1ページ約100KB）。`scripts/build_hd_pages.py` で、画像を縮める前の版（git の `df9e7d8^`）から作る
- `public/pages/**/page_N.png` … 縮めた版（高さ 1200px）。**管理画面の表示と、切り抜き位置（x, y, w, h）の基準**。消さない
- 切り抜きは `src/utils/customCrops.js` の `renderCropFromPage` が WebP を読み、位置を「WebP の高さ / 1200」倍して切り抜く（WebP が読めなければ PNG で等倍）
- 配線図ページ（15ページ目）の `page_15.webp`・`floor_plan.webp`・`panel_schedule.webp` は、問題PDFから 288dpi で作った高解像度版（高さ約 4500px、1枚 200〜290KB）。`scripts/build_pdf_pages.py <問題PDF>` で作る。枠の取り方は他のページと同じなので、切り抜き位置はそのまま使える
- 配線図ビューアは `page_15.webp`・`floor_plan.webp`・`panel_schedule.webp` を表示。拡大は CSS の transform だが、`will-change`・`translate3d` は付けない（付けると拡大前の絵を引き伸ばしてぼやける）（読めない時は同じ名前の `.png` に1回だけ切り替える）
- 先読み：問25以降で配線図ページを、次の問題に図があればその図のページを、裏で先に読み込む（`App.jsx`、`prefetchHdPage`）。一度読んだ画像は Service Worker が保存する
- `public/pages/**/answer.webp` … 試験センターの「解答」PDF の解答表（全50問）を切り抜いた画像。②問題文エディタの原本プレビューの下に表示する。`scripts/build_answer_pages.py <解答PDF>` で作る（ファイル名の試験日から年度を決める）
- 新しい年度を足す時は、高画質の PNG（PDF を2倍で書き出したもの）から WebP を作り、高さ 1200px に縮めた PNG も置く

## 出題テキストと原本選択肢（2026-10-14）

- 元データは `src/data/exams/*.json`、公開用の修正は `questionOverrides.json` に置く。学習記録のID・正答の記号は維持する。
- `visualChoices.json` に原本選択肢のページと切り抜き範囲（高さ1200px基準）を管理。`scripts/build_visual_choices.py`（Pillowが必要）で `public/choices/<exam>/<id>.webp` を生成する。
- `VisualChoices` を通常・復習・模試で共用。拡大・原本ページへの導線を持ち、画像を読めない場合は原本への案内を表示する。配線図の切り抜きは併用できる。
- 管理者調整済み `cropOverrides.json` は今回変更していない。端末独自の問題修正は既存の優先順位を維持する。
- 点検資料：`docs/audits/2026-10-14-learning-text.md`。`npm test` で250問の公式解答・解答前表示などを確認する。

## 有料化前の表示修正（2026-10-15）

- `questionDiagram.js` が設問に必要な図と選択肢画像を区別。`visualChoices.json` の `stemBox` は独立した回路図の範囲で、生成先は `public/choices/<exam>/<id>-stem.webp`。
- 模試結果詳細は `ExamResultDetails` で原本選択肢も表示する。
- 復習対象と件数は `reviewFilter.js` の `needsReview` を共用。
- 有料化は未実装。設計案は `MONETIZATION_PLAN.md`、残課題は `audits/2026-10-15-prepaid-readiness.md`。

## 模試結果と保存の回復（2026-10-15）

- 学習記録の同じキーに `examResults[examId]` を追加。年度ごとに最新10件、採点日時・点数・解答時点の問題/解説を保存。結果IDは年度＋終了予定時刻。
- `recordExamResult` は結果と解答統計を一度に保存。同じIDの再送では加算しない。未回答は解答統計に含めず、模試の所要時間は全体に一度だけ加算。回答速度へ固定20秒を入れない。
- `saveRecovery` は失敗したキーの最新値をメモリに保持し `SaveWarning` で再試行を案内。再読み込みすると未保存値は失われるため閉じる前に案内を確認する。クラウド同期は別PR。
- 模試途中データは結果保存成功後に除去。除去失敗でも同じ結果IDが保存済なら結果画面を復元。
- 既存バックアップに模試結果も含まれる。初期化は従来どおりユーザー確認後に行う。

## Firebase接続準備

- `services/firebaseConfig.js` の公開環境変数がすべてある場合のみ、記録画面の `AccountPanel` を有効にする。
- `users/{uid}/learning/backup` にJSON文字列・更新版・サーバー時刻を保存。更新はFirestore transactionで版を照合する。既存端末記録とクラウド記録は自動では混ぜない。
- `firebase/firestore.rules` が本人だけの読み書きと利用権のクライアント書込禁止を保証。未定義のパスは拒否。Firebaseプロジェクト作成後に本番へ反映が必要。

## 決済サーバー（準備段階）

`functions/index.js` が認証付き購入・契約管理・Stripe署名検証通知を処理し、`billingPolicy.js` が価格・期限・利用権を判定する。設定と未検証範囲は `BILLING_SETUP.md`。購入受付は既定で無効、一般画面と有料データ配信への接続は未実装。

## 有料データの分離準備

`build:private-staging` はサーバー専用の問題/画像と公開側の検証用出力を分離生成する。`functions/privateContent.js` は毎回認証・利用権を確認する。通常の公開ビルドは変更しない。アプリ側の接続は未対応で検証用出力は本番公開不可。詳細は `PRIVATE_CONTENT.md`。
