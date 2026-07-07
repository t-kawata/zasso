---
description: 例: /boundify-graph-to-dirs RFC-BOUNDIFY-GRAPH.json（相対パス）/ /boundify-graph-to-dirs /path/to/RFC-BOUNDIFY-GRAPH.json（絶対パス）。第1引数に /graphify-rfc が生成したグラフJSONのファイルパスを指定し、4Step進行制御でディレクトリツリーとDirs-Tree.jsonを生成する。
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
---

# /boundify-graph-to-dirs <graph-file-path>

**役割**: /graphify-rfc が生成したグラフJSONを入力として受け取り、検証・自己修復ループを経て安全な境界を持つ実装ディレクトリツリーを生成する。

## 引数

- **第1引数（必須）**: /graphify-rfc が生成したグラフJSONのファイルパス（絶対パスまたは相対パス）
  - 例: `RFC-BOUNDIFY-GRAPH.json`
  - 例: `/absolute/path/to/rfc-graph.json`

## 導出パス

グラフJSONのパスから以下のファイルパスを計算する：

```bash
graphPath="$1"
graphDir="$(dirname "$1")"
basename="$(basename "$1" -GRAPH.json)"
dirsTreePath="${graphDir}/${basename}-Dirs-Tree.json"
statusPath="${graphDir}/${basename}-BOUNDIFY-Status.json"

# グラフJSONから sourceFile（元Markdown文書パス）を抽出する
sourcePath=$(node -p "JSON.parse(require('fs').readFileSync('${graphPath}','utf8')).sourceFile||''")
if [ -z "$sourcePath" ]; then
  echo "[ERROR] グラフJSONに sourceFile が見つかりません"
  exit 1
fi
```

- `graphPath`: 入力グラフJSONファイル
- `dirsTreePath`: 出力されるディレクトリツリーJSONファイル
- `statusPath`: 進行管理ステータスJSONファイル（update-boundify-step-status.js が読書きする）
- `sourcePath`: 元Markdown文書のパス（グラフJSONの sourceFile フィールドから抽出）

## ガイドライン

- **/boundify-graph-to-dirs は /graphify-rfc の出力を唯一の入力とする**。グラフが存在しない状態では実行できない。
- 各Stepで使用するスクリプトは `.claude/scripts/rfc-graph/` 配下に配置されている。
- update-boundify-step-status.js の呼び出しは `--status=<path>` フラグで行う。
- boundify-graph-to-dirs.js は `--graph=<path>` の引数形式で呼び出す。
- **自己修復ループ**: 各Stepでエラーや警告が発生した場合、スクリプトの出力するメッセージに従ってAIが自力でグラフデータを修正し、再実行する。`/graphify-rfc` に戻る必要はない。修正後は必ず `verify-graph-integrity.js` で退行チェックを実行する。

## 使用スクリプト一覧

`.claude/scripts/rfc-graph/` 配下。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `boundify-graph-to-dirs.js` | `--graph=<path> [--json\|--quiet\|--dry-run\|--force]` | メインスクリプト。グラフ読込・言語収集・ツリー生成・エッジ投影・循環検出・ファイル書出・3出力モード制御 |
| `validate-dirs-tree-schema.js` | `--dirs-tree=<path> --graph=<path>` | Dirs-Tree.json スキーマ検証（nodes/edges/trees/dependencyDirections の構造検証） |
| `verify-graph-integrity.js` | `--graph-after=<path> --graph-before=<path> --source=<path>` | 5軸チェック（nodes/edges/headingRefs/孤立/カバレッジ）。退行チェック用 |
| `generate-all-dir-templates.js` | `--dirs-tree=<path> [--dry-run] [--delete]` | Dirs-Tree.json 内の全言語に対して生成/削除を一括実行 |
| `generate-dir-template.js` | `--dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force] [--delete]` | ディレクトリツリーから実ディレクトリ/ファイルを生成/削除（単一言語） |
| `boundify-helpers.js` | （ライブラリ） | 純粋関数群（projectEdgesToDirectories, tarjanSCC, deduplicateFileNames, collectLanguagesFromGraph 等） |
| `boundify-tree.js` | （ライブラリ） | ディレクトリツリー生成（buildDomainHierarchy, buildDirectoryTree, generateReport 等） |
| `update-boundify-step-status.js` | `--status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | BOUNDIFY-Status.json の進行管理（5サブコマンド） |
| `show-graph-summary-markdown.js` | `--graph=<path> --source=<path>` | グラフサマリーを kind 別Markdown形式で出力 |
| `query.js` | `--graph=<path> --source=<path> --id=<nodeId> --hops=<N>` | マルチホップグラフ検索（退行チェックの補助手段） |

多くのスクリプトはエラー時に問題点と対応方法を出力する。出力された指示に従って修正し、再実行すること。

## Step 0: グラフ読み込み・言語収集（事前処理）

グラフJSONが有効であることを確認し、全ノードの `language` フィールドを読み取って使用言語を把握する。

```bash
# Step 0 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 0

# メインスクリプトを dry-run モードで実行し、事前処理のみを確認する
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --dry-run

# Step 0 正常終了（進行ステータスを done に更新し、currentStep を 1 に進める）
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 0
```

### エラー時の復帰
スクリプトが出力するエラーメッセージに従ってグラフデータを修正した後、`reset-to-step 0` でステータスを戻し、Step 0 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 0
```

修正後は退行チェックを必ず実行する。

## Step 1: 検証・自己修復ループ（新設）

graphify → boundify の接合部が壊れていないことを5軸で検証する。問題があればスクリプトが具体的な修正指示を出力し、AIが修正 → 再実行 → 問題消失確認まで行う。

### 検証の5軸

| 軸 | チェック内容 | 検出される問題 |
|---|---|---|
| 1 | nodes の ID 集合が変化していないか | ノードの誤削除・誤追加 |
| 2 | edges が変化していないか | エッジの誤削除・誤変更 |
| 3 | headingRefs が全て解決可能か | 参照切れ |
| 4 | 孤立ノードが存在しないか | エッジ切れノード |
| 5 | ソースの全見出しがカバーされているか | 未カバーセクション |

```bash
# Step 1 を開始
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 1

# 以前のバックアップを削除し、新たに取得する
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" backup

# 5軸チェックを実行
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"
```

`{"ok":true}` が返るまで以下の手順を繰り返す（最大5回）：

```bash
# verify-graph-integrity.js を実行し、結果を確認する
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"
```

検証結果に応じて分岐する：

- **`{"ok":true}` の場合** → 自己修復ループ終了。バックアップを削除し、Step 1 正常終了へ進む。
  ```bash
  node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup
  node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 1
  ```

- **エラーが報告された場合** → スクリプトが出力する `remedies` フィールドの指示に従ってグラフデータを修正し、再度 verify-graph-integrity.js を実行する。この修正→実行のサイクルを最大5回まで繰り返す。

- **5回を超えても `{"ok":true}` にならない場合** → reset-to-step 1 で復帰する。
  ```bash
  echo "[ERROR] 自己修復ループが最大試行回数(5)に達しました。"
  node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 1
  ```

### エラー時の復帰
`verify-graph-integrity.js` が出力する `remedies` フィールドの指示に従ってグラフデータを修正した後、同じく `verify-graph-integrity.js` を再実行してエラー消失を確認する。これを `{"ok":true}` が返るまで繰り返す。やむを得ず `reset-to-step 1` で最初からやり直す場合は以下のコマンドを実行する：

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 1
```

## Step 2: Dirs-Tree.json 生成 + スキーマ検証

Dirs-Tree.json を生成し、JSON Schema に準拠していることを検証する。旧 Step 1（ツリー生成）と旧 Step 3（スキーマ検証）を統合した。

```bash
# Step 2 を開始
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 2

# Dirs-Tree.json を生成（ついでに循環依存があれば warnings に記録される）
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath"

# 出力ファイルの存在確認
test -f "$dirsTreePath" && echo "Dirs-Tree.json: OK" || echo "Dirs-Tree.json: MISSING"

# スキーマ検証を実行
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js \
  --dirs-tree="$dirsTreePath" \
  --graph="$graphPath"

# Step 2 正常終了
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 2
```

### 循環依存が検出された場合
boundify-graph-to-dirs.js が出力する `warnings` に循環依存の詳細と修正手順が記録されている。AIが指示に従ってグラフのエッジ定義を修正した後、再度 `boundify-graph-to-dirs.js` を実行し、循環が解消されたことを確認する。エッジ修正後は必ず `verify-graph-integrity.js` で退行チェックを実行する。

### スキーマ検証エラーの場合
`validate-dirs-tree-schema.js` が出力するエラー一覧の先頭に修正優先順位の指示が含まれている。上から1件ずつ修正し、その都度再実行する。

### エラー時の復帰
各スクリプトが出力するエラーメッセージの指示に従ってグラフデータを修正した後、再実行する。問題が解決したら `verify-graph-integrity.js` で退行チェックを実行する。やむを得ず最初からやり直す場合：

```bash
# 生成済みファイルを削除してからリセット
rm -f "$dirsTreePath"
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 2
```

### モード切替

- **`--quiet`**: 標準出力を抑制する（CI用）。エラー時のみ stderr に出力。
- **`--json`**: JSON のみを標準出力に出力する（パイプライン連携用）。

```bash
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --json
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --quiet
```

## Step 3: 一括ファイル生成

Dirs-Tree.json に基づいて、実際のディレクトリとテンプレートファイルを一括生成する。

```bash
# Step 3 を開始
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 3

# 全言語の生成内容を dry-run で確認
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --dry-run

# 確認後、実際の生成を実行
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath"

# Step 3 正常終了
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 3
```

### エラー時の復帰
生成に失敗した場合、エラーメッセージに従って修正した後、`generate-all-dir-templates.js` を再実行する。必要に応じて `--delete` で既存の生成物を削除してから再実行する：

```bash
# 生成物を完全削除してから再実行
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --delete
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath"

# やむを得ずリセット
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 3
```

## Step 4: 最終品質検証

生成された全成果物の整合性を確認し、総合的な品質判断を行う。

```bash
# Step 4 を開始
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" start-step 4

# 退行チェック用にバックアップを取得
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" backup

# 退行チェック（graphify 成果物が壊れていないか最終確認）
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"

# バックアップを削除
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup

# グラフサマリーを確認
node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$graphPath" --source="$sourcePath"
```

### AI による十分性判断

出力を読み、以下の観点で最終判断する：

1. **グラフ内全言語のディレクトリツリーが過不足なく生成されているか**
2. **Dirs-Tree.json のスキーマ検証が通過しているか**
3. **循環依存が警告されている場合、その内容が設計意図と整合しているか**
4. **各ディレクトリ/ファイルに適切な名前空間と可視性ルールが設定されているか**
5. **実テンプレートファイルが正しく生成されているか**
6. **退行チェック（verify-graph-integrity.js）が通過しているか**

**十分と判断した場合:**

```bash
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" end-step 4
```

**不十分と判断した場合** — 問題に応じて該当Stepに戻り、自己修復ループで修正する：

```bash
# 生成済みファイルを完全削除
node .claude/scripts/rfc-graph/generate-all-dir-templates.js --dirs-tree="$dirsTreePath" --delete

# 問題に応じて該当Stepに戻る
# - 検証の問題 → reset-to-step 1
# - ツリー構造の問題 → reset-to-step 2
# - ファイル生成の問題 → reset-to-step 3
```

各Stepに戻った後、問題を修正して再実行し、再度 Step 4 で最終確認を行う。

### エラー時の復帰
エラー内容に応じて必要なStepに戻って修正する。修正後は `verify-graph-integrity.js` で退行チェックを実行する：

```bash
# 退行チェック用にバックアップを取得
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" backup

# 退行チェックを実行
node .claude/scripts/rfc-graph/verify-graph-integrity.js \
  --graph-after="$graphPath" \
  --graph-before="$graphPath.bak" \
  --source="$sourcePath"

# バックアップを削除
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup

# 必要ならリセット
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" reset-to-step 4
```

## 完了報告

全Step正常終了。一時ファイルをクリーンアップする：

```bash
# バックアップファイルが残っていれば削除
node .claude/scripts/rfc-graph/update-boundify-step-status.js --status="$statusPath" cleanup
```

以下の情報を報告する：

- **入力グラフファイル**: `$graphPath`
- **出力 Dirs-Tree.json**: `$dirsTreePath`
- **進行ステータスファイル**: `$statusPath`
- **ノード数**: boundify-graph-to-dirs.js の出力から取得
- **エッジ数**: 同上
- **循環依存**: 検出有無
- **スキーマ検証**: validate-dirs-tree-schema.js の最終結果
- **退行チェック**: verify-graph-integrity.js の最終結果
- **生成ファイル数**: 各言語のファイル数合計

完了後、生成されたディレクトリツリーとファイルを起点に実装を開始できる。
