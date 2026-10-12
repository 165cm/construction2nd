# ai-dev-template

Claude Code と Codex（GPT）が、同じリポジトリで**ぶつからずに一緒に作業する**ためのひな形です。
このリポジトリが共通ルールの正本です。

## 入っているもの

| ファイル | 種類 | 中身 |
|---|---|---|
| `AGENTS.md` | 共通 | AIの入口。読む順番・4つのルール・やりとりの決まり（Codex が読む） |
| `CLAUDE.md` | 共通 | `AGENTS.md` を読み込むだけ（Claude が読む） |
| `docs/DEVELOPMENT.md` | 前半は共通・後半はリポジトリごと | ブランチ・PR・コミットの進め方／テスト・デプロイ |
| `.github/pull_request_template.md` | 共通 | PRの書き方 |
| `docs/CURRENT_TASK.md` | リポジトリごと | いまの状態・作業中の担当・次のタスク（二人の共有メモ） |
| `docs/PRODUCT.md` | リポジトリごと | 何を作っているか・やらないこと |
| `docs/ARCHITECTURE.md` | リポジトリごと | ファイル構成・データ・外部サービス |
| `docs/UI_RULES.md` | リポジトリごと | 画面のルール（画面がなければ消してよい） |

「共通」のファイルはどのリポジトリでも同じ中身です。「リポジトリごと」のファイルは、それぞれのリポジトリで書きます。

## 4つのルール

1. `main` を直接触らない（1タスク＝1ブランチ／worktree → PR）
2. 本番公開（PRのマージ）の前に、必ずユーザーに確認する
3. 仕様・決めごとの変更は `docs/` に残す
4. Claude と Codex に同じファイルを同時に編集させない

## 使い方

### 新しいリポジトリを作る時

1. このリポジトリの Settings で「Template repository」にチェックを入れる（最初の1回だけ）
2. 右上の「Use this template」→「Create a new repository」で作る
3. できたリポジトリで、Claude か Codex に「docs/ の中身を、このリポジトリに合わせて書いて」と頼む

### 今あるリポジトリに入れる時

そのリポジトリで Claude か Codex に、次の文を貼ります。

```
165cm/ai-dev-template の共通ルールを、このリポジトリに入れてください。
- AGENTS.md・CLAUDE.md・.github/pull_request_template.md はそのままコピー
- docs/DEVELOPMENT.md は前半（ブランチ〜コミット）をコピーし、後半（テスト・デプロイ）はこのリポジトリに合わせて書く
- docs/CURRENT_TASK.md・PRODUCT.md・ARCHITECTURE.md・UI_RULES.md は、このリポジトリのコードを読んで中身を書く
- 今あるルールのファイル（CLAUDE.md・AGENTS.md・README の開発手順など）と食い違う所は、消す前に私に確認する
1つのPRにまとめ、マージの前に「PR #N を本番公開してよいですか？」と聞いてください。
```

### 共通ルールを変えたい時

1. 先にこのリポジトリ（ひな形）を直す
2. 各リポジトリで、次の文を貼って反映する

```
165cm/ai-dev-template の最新の共通ルール（AGENTS.md・CLAUDE.md・.github/pull_request_template.md・docs/DEVELOPMENT.md の前半）を、このリポジトリに反映してください。
リポジトリごとの部分（docs/ のほかのファイル・DEVELOPMENT.md の後半・AGENTS.md の目次に足した行）は残してください。
マージの前に「PR #N を本番公開してよいですか？」と聞いてください。
```

### 毎回の作業の頼み方

Codex に頼む時：

```
AGENTS.md を読み、書かれた順番で docs/ を読んでから作業してください。
作業を始める前に docs/CURRENT_TASK.md の「作業中」の表に、担当（Codex）・ブランチ名（codex/〜）・触るファイルを書いてください。
表で Claude が作業中のファイルは触らないでください。
今回のタスク：（ここにやってほしいことを書く）
```

Claude に頼む時：

```
CLAUDE.md を読み、書かれた順番で docs/ を読んでから作業してください。
作業を始める前に docs/CURRENT_TASK.md の「作業中」の表に、担当（Claude）・ブランチ名（claude/〜）・触るファイルを書いてください。
表で Codex が作業中のファイルは触らないでください。
今回のタスク：（ここにやってほしいことを書く）
```

## 「main を直接触らない」を GitHub の設定で守る（おすすめ）

文章のルールだけだと、AIがうっかり破ることがあります。各リポジトリで一度だけ設定します。

1. リポジトリの Settings → Rules → Rulesets → New ruleset → New branch ruleset
2. Ruleset name に `main を守る`、Enforcement status を Active にする
3. Target branches で「Add target」→「Include default branch」
4. 「Require a pull request before merging」にチェック → Create

## 手元のパソコンで2つのAIを同時に動かす時

同じフォルダを2つのAIに触らせないよう、作業フォルダを分けます（worktree）。

Claude 用：

```
git worktree add ../リポジトリ名-claude -b claude/タスク名 origin/main
```

Codex 用：

```
git worktree add ../リポジトリ名-codex -b codex/タスク名 origin/main
```

クラウドで使う時（claude.ai/code・Codex のクラウド）は、毎回別のコピーが用意されるので、このコマンドは要りません。
