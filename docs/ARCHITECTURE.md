# しくみ（ARCHITECTURE）

## 全体

```
ブラウザ（React / Vite SPA）
   │
   ├─ src/App.jsx (メインルーティング・モード切替)
   ├─ src/data/questions.json (全50問・解説・画像パス)
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
| `src/components/Header.jsx` | レベル・EXPバー・コンボ・残り推計時間バナー |
| `src/components/StatsModal.jsx` | 残り時間推計・分野別進捗率・実績バッジギャラリー |
| `src/components/BottomNav.jsx` | スマホ下部固定ナビゲーション（5タブ） |
| `src/utils/sound.js` | Web Audio APIシンセサイザー（正解・不正解・コンボ・ファンファーレ・タップ） |
| `src/utils/spacedRepetition.js` | 科学的忘却曲線（ライトナーBox）間隔反復エンジン・中断再開ロジック |
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
  - `responseTimes`: 直近30問の回答所要時間（秒）配列（平均速度算出用）
  - `exp`, `level`, `streak`, `maxStreak`
  - `badges`: 獲得済み実績バッジID配列
- LocalStorage キー: `denkou2_exam_session_v1` … 受験中の模擬試験（年度ごとの解答・現在位置・終了時刻）。採点すると消える
- トリミング座標は `pageDir`（年度ごとの元ページ画像フォルダ。例 `/pages/r7_2`）を必ず持つ。無い場合はキーの年度から補う
- 問31以降（配線図問題）の画像は、「配線図ページ（P15）」と「問題文ページ（P11〜13）」のどちらからでも切り抜ける。どちらから切り抜いたかは座標の `page` で決まる（管理画面の①トリミング・②問題文エディタで切り替え）。問題文ページは `examLoader.js` が各問題に `questionPage` として付ける
- `cropOverrides.json` の各項目は `showImage`（true＝画像あり／false＝テキスト問題）を持てる。全端末で問題の「画像あり／なし」をそろえるために使う（`src/data/examLoader.js` が読み込み時に反映）。管理画面の「全端末へ反映するデータをコピー」には、この設定も含まれる
