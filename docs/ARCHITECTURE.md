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
| `src/utils/storage.js` | 理解度・平均解答速度・残りプレイ時間算出・実績判定ロジック |
| `public/crops/` | 回路図・材料写真・工具写真・器具記号の個別クロップ画像 |
| `public/pages/` | 全頁高精細PNG（配線図含む） |

## データ
- LocalStorage キー: `denkou2_mastery_state_v1`
  - `records`: 各問題の挑戦回数、正解数、不正解数、連続正解数、ステータス（unattempted / review / correct / mastered）
  - `responseTimes`: 直近30問の回答所要時間（秒）配列（平均速度算出用）
  - `exp`, `level`, `streak`, `maxStreak`
  - `badges`: 獲得済み実績バッジID配列
  - `bookmarks`: クリップした問題ID配列
