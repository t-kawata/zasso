---
description: 例: /boundify-graph-to-dirs RFC-BOUNDIFY-GRAPH.json（相対パス）/ /boundify-graph-to-dirs /path/to/RFC-BOUNDIFY-GRAPH.json（絶対パス）。第1引数に /graphify-rfc が生成したグラフJSONのファイルパスを指定し、6Step進行制御でディレクトリツリーとDirs-Tree.jsonを生成する。
argument-hint: </path/to/*-GRAPH.json>
allowed-tools: Read, Write, Bash
---

# /boundify-graph-to-dirs <graph-file-path>

**役割**: /graphify-rfc が生成したグラフJSONを入力として受け取り、ディレクトリと名前空間で構築された安全な境界を持つ実装ディレクトリツリーを提案・検証・生成する。graphify（論理グラフ）→ boundify（物理ディレクトリ）のパイプラインにより、設計から実装までのシームレスな接続を実現する。

## 引数

- **第1引数（必須）**: /graphify-rfc が生成したグラフJSONのファイルパス（絶対パスまたは相対パス）
  - 例: `RFC-BOUNDIFY-GRAPH.json`
  - 例: `/absolute/path/to/rfc-graph.json`

## 導出パス

グラフJSONのパスから以下のファイルパスを計算する：

```bash
graphPath="$1"
graphDir="$(dirname "$1")"
basename="$(basename "$1" -GRAPH.json | sed 's/-GRAPH$//')"
dirsTreePath="${graphDir}/${basename}-Dirs-Tree.json"
langGraphPath="${graphDir}/${basename}-GRAPH-LANG.json"
statusPath="${graphDir}/${basename}-BOUNDIFY-Status.json"
```

- `graphPath`: 入力グラフJSONファイル
- `dirsTreePath`: 出力されるディレクトリツリーJSONファイル
- `langGraphPath`: 言語注釈付き拡張グラフJSONファイル
- `statusPath`: 進行管理ステータスJSONファイル（update-step-status.js が読書きする）

## ガイドライン

- **/boundify-graph-to-dirs は /graphify-rfc の出力を唯一の入力とする**。グラフが存在しない状態では実行できない。
- 各Stepで使用するスクリプトは `.claude/scripts/rfc-graph/` 配下に配置されている。
- update-step-status.js の呼び出しは `--status=<path>` フラグで行う（`--graphify-status=` も使用可能だが、本コマンドでは統一のため `--status=` を使用する）。
- boundify-graph-to-dirs.js は `--graph=<path>` の引数形式で呼び出す。

## 使用スクリプト一覧

`.claude/scripts/rfc-graph/` 配下。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `boundify-graph-to-dirs.js` | `--graph=<path> [--json\|--quiet\|--dry-run\|--force]` | メインスクリプト。グラフ読込・言語推論・ツリー生成・エッジ投影・循環検出・ファイル書出・3出力モード制御 |
| `validate-dirs-tree-schema.js` | `<Dirs-Tree.json>` | Dirs-Tree.json スキーマ検証（nodes/edges/trees/dependencyDirections の構造検証） |
| `generate-dir-template.js` | `--dirs=<Dirs-Tree.json> --lang=<lang> [--dry-run] [--force]` | ディレクトリツリーから実ディレクトリ/ファイルを生成（dry-run モード対応） |
| `boundify-helpers.js` | （ライブラリ） | 純粋関数群（inferLanguage, titleToFileName, projectEdgesToDirectories, tarjanSCC 等） |
| `boundify-tree.js` | （ライブラリ） | ディレクトリツリー生成（buildDomainHierarchy, buildDirectoryTree, generateReport 等） |
| `update-step-status.js` | `--status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | BOUNDIFY-Status.json の進行管理（5サブコマンド） |
| `show-graph-summary-markdown.js` | `--graph=<path> --source=<path>` | グラフサマリーを kind 別Markdown形式で出力 |

全スクリプトはエラー時に3段テンプレート（`[ERROR]` / `原因:` / `対応:`）を stderr に出力し、終了コード1で終了する。スキーマ検証に違反した場合も同様のテンプレートでエラー内容を報告する。

## Step 0: グラフ読み込み・言語推論（事前処理）

グラフJSONが有効であることを確認し、全ノードに言語推論（rust / go / typescript）を適用して GRAPH-LANG.json を生成する。

```bash
# Step 0 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 0

# メインスクリプトを dry-run モードで実行し、事前処理のみを確認する
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --dry-run

# Step 0 正常終了（進行ステータスを done に更新し、currentStep を 1 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 0
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 0` でステータスを戻し、Step 0 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 0
```

## Step 1: 3言語ディレクトリツリー生成

3言語（rust / go / typescript）それぞれに対してディレクトリツリーを生成する。全言語でツリーが正しく生成されることを確認する。

```bash
# Step 1 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 1

# メインスクリプト実行（デフォルト出力: Markdown + JSONブロック）
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath"

# 3ファイル（Dirs-Tree.json / GRAPH-LANG.json / BOUNDIFY-Status.json）の存在確認
test -f "$dirsTreePath" && echo "Dirs-Tree.json: OK" || echo "Dirs-Tree.json: MISSING"
test -f "$langGraphPath" && echo "GRAPH-LANG.json: OK" || echo "GRAPH-LANG.json: MISSING"
test -f "$statusPath" && echo "BOUNDIFY-Status.json: OK" || echo "BOUNDIFY-Status.json: MISSING"

# Step 1 正常終了（進行ステータスを done に更新し、currentStep を 2 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 1
```

### モード切替

- **`--quiet`**: 標準出力を抑制する（CI用）。エラー時のみ stderr に出力。
- **`--json`**: JSON のみを標準出力に出力する（パイプライン連携用）。

```bash
# JSON モード
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --json

# Quiet モード
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --quiet
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 1` でステータスを戻し、Step 1 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 1
```

## Step 2: エッジ投影・循環検出

グラフのエッジをディレクトリ間依存に投影し、循環依存（Strongly Connected Components）を検出する。

```bash
# Step 2 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 2

# --dry-run で依存解析結果のみを確認
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="$graphPath" --dry-run
```

出力から循環依存の有無を確認する：

- **循環依存が検出された場合** → Dirs-Tree.json の warnings フィールドに記録されている。設計の見直しが必要な場合は /graphify-rfc に戻ってグラフのエッジ定義を修正する。
- **循環依存がない場合** → Step 2 正常終了。

```bash
# 成功時: Step 2 正常終了
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 2
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 2` でステータスを戻し、Step 2 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 2
```

## Step 3: Dirs-Tree.json スキーマ検証

生成された Dirs-Tree.json が JSON Schema に準拠していることを検証する。

```bash
# Step 3 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 3

# スキーマ検証を実行
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js "$dirsTreePath"
```

検証結果に応じて分岐する：

- **検証エラーが報告された場合** → reset-to-step 1 で Step 1 に戻り、Dirs-Tree.json の再生成を行う
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 1
  ```
- **検証成功の場合** → Step 3 正常終了
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 3
  ```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 3` でステータスを戻し、Step 3 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 3
```

## Step 4: 実テンプレート生成（dry-run確認）

generate-dir-template.js を使用して、各言語のディレクトリ/ファイルを実際に生成する。事前に dry-run で確認してから実行する。

```bash
# Step 4 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 4

# 3言語分の dry-run で生成内容を確認
for lang in rust go typescript; do
  echo "=== $lang: dry-run ==="
  node .claude/scripts/rfc-graph/generate-dir-template.js --dirs="$dirsTreePath" --lang="$lang" --dry-run
done

# 確認後、実際の生成を実行
for lang in rust go typescript; do
  echo "=== $lang: generating ==="
  node .claude/scripts/rfc-graph/generate-dir-template.js --dirs="$dirsTreePath" --lang="$lang"
done

# Step 4 正常終了（進行ステータスを done に更新し、currentStep を 5 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 4
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 4` でステータスを戻し、Step 4 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 4
```

## Step 5: 最終品質検証

生成された全成果物の整合性を確認する。

```bash
# Step 5 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 5

# グラフサマリーを確認
node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$graphPath" --source="$1"
```

### AI による十分性判断

出力を読み、以下の観点で最終判断する：

1. **全3言語のディレクトリツリーが過不足なく生成されているか**
2. **Dirs-Tree.json のスキーマ検証が通過しているか**
3. **循環依存が警告されている場合、その内容が設計意図と整合しているか**
4. **各ディレクトリ/ファイルに適切な名前空間と可視性ルールが設定されているか**
5. **実テンプレートファイルが正しく生成されているか**

### 判断と分岐

**十分と判断した場合** → 判断根拠を具体的に説明した上で Step 5 正常終了：

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 5
```

**不十分と判断した場合** → 該当するStepに戻って補正する：

- ツリー構造の問題 → `reset-to-step 1`
- 依存関係の問題 → `reset-to-step 2`
- 検証エラー → `reset-to-step 3`
- テンプレート生成の問題 → `reset-to-step 4`

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 5` でステータスを戻し、Step 5 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" reset-to-step 5
```

## 完了報告

以下の情報を報告する：

- **入力グラフファイル**: `$graphPath`
- **出力 Dirs-Tree.json**: `$dirsTreePath`
- **出力 GRAPH-LANG.json**: `$langGraphPath`
- **進行ステータスファイル**: `$statusPath`
- **ノード数**: boundify-graph-to-dirs.js の出力から取得
- **エッジ数**: 同上
- **循環依存**: 検出有無
- **スキーマ検証**: validate-dirs-tree-schema.js の最終結果
- **生成ファイル数**: 各言語のファイル数合計

完了後、生成されたディレクトリツリーとファイルを起点に実装を開始できる。
