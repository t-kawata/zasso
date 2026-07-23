---
description: "現在のブランチの未コミット変更・未pushコミットを処理してリモートにプッシュ（-u でブランチ自動作成）"
---

# JPush Branch — 日本語コミット＆ブランチプッシュ

現在のブランチの変更を処理してリモートにプッシュする。以下の2つを自動的に処理する：

1. **未コミットの変更** → `git diff` を分析して日本語コミットメッセージを生成し、コミット
2. **未pushのコミット** → `git log @{u}..HEAD` で未pushコミットを確認してからプッシュ

プッシュは `git push -u origin <ブランチ名>` で行うため、リモートにブランチが存在しなくても自動的に作成される。

## Process

### Step 1: 全体状態の確認

```bash
git fetch origin
git status --short
git branch --show-current
git log @{u}..HEAD --oneline 2>&1
```

出力から以下を判断する：
- 未コミット変更あり → Step 2 へ
- 未コミット変更なし & 未pushコミットあり → Step 5 へ
- いずれもなし → 何もせず終了

### Step 2: 変更分析

```bash
git diff
git diff --cached
git status
```

以下の観点で分類する：
- 新規追加されたファイル・機能
- 修正された既存コード
- 削除されたファイル
- 設定や依存関係の変更
- テストやドキュメントの変更

### Step 3: コミットメッセージを生成

分類結果をもとに conventional commits 形式で日本語コミットメッセージを生成する：

```
<prefix>: <変更概要>

- **変更内容**: ...
- **変更理由**: ...
- **影響範囲**: ...
```

**prefix** は `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `style` から変更内容に合うものを選択する。

### Step 4: コミット実行

```bash
git add .
git commit -m "<生成したメッセージ>"
```

### Step 5: プッシュ

```bash
git push -u origin <現在のブランチ名>
```

### Step 6: 結果報告

プッシュ結果を簡潔に報告する。失敗した場合はエラー内容を表示して終了。「変更なし」の場合はその旨を報告して終了。

## Edge Cases

- **コンフリクト残留**: `git status` に `UU` や `AA` などがある場合、「コンフリクトが解消されていません」と報告して終了。
- **未コミット変更 & 未pushコミットの両方がない**: 何もせず「変更はありません」と報告して終了。
