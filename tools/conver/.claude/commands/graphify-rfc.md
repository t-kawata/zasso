---
argument-hint: <source-file-path>
allowed-tools: Read, Write, Bash
description: 長大Markdown文書をマルチホップグラフ検索可能な構造へ変換する。5Step進行制御（ノード分割→エッジ付与→機械検証→マーカー埋め込み→自己検証）を update-step-status.js と連携して実行する。
---

# /graphify-rfc <source-file-path>

**役割**: 長大Markdown設計文書をI/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化する。生成されたグラフは formulate-tickets から利用可能になる。

## 引数

- **第1引数（必須）**: 設計文書のファイルパス（絶対パスまたは相対パス）
  - 例: `RFC-GRAPHIFY.md`
  - 例: `/absolute/path/to/rfc-doc.md`

## 導出パス

ソース文書のパスから以下のファイルパスを計算する：

```bash
graphPath="$(dirname "$1")/$(basename "$1" .md)-GRAPH.json"
statusPath="$(dirname "$1")/$(basename "$1" .md)-GRAPHIFY-Status.json"
```

- `graphPath`: 生成されるグラフJSONファイル
- `statusPath`: 進行管理ステータスJSONファイル（update-step-status.js が読書きする）

## ガイドライン

- **graphify は formulate よりも常に細かい粒度で分割する（発散）**。formulate-tickets がグラフから必要な粒度の情報を取り出す際に、細かすぎるノードは集約可能だが、粗すぎるノードは分割不能である。
- 各Stepで使用するスクリプトは `.claude/scripts/rfc-graph/` 配下に配置されている。
- update-step-status.js の呼び出しは `--graphify-status=<path>` プリフィックスで行う。
- crud.js / verify.js / embed-markers.js / query.js は `--graph=<path>` / `--source=<path>` の引数形式で呼び出す。

## Step 1: ノード分割

ソース文書の全行を読み込み、3軸（セクション階層 + kind + 外部依存の有無）で意味的I/O境界を特定しノードに分割する。各ノードは1つのkindのみを持つ。100行超のセクションは必ず複数ノードに分割する。

1. `update-step-status.js --graphify-status="$statusPath" start-step 1`
2. ノードJSONを生成して一時ファイル `_temp_nodes.json` に書き込み、crud.js で投入する：
   - `crud.js create-nodes --graph="$graphPath" < _temp_nodes.json`
3. `update-step-status.js --graphify-status="$statusPath" end-step 1`

### エラー時の復帰
- 実行に失敗した場合 → `update-step-status.js --graphify-status="$statusPath" fail-step 1`
- 修正後、`reset-to-step 1` で最初からやり直す

## Step 2: エッジ付与

10種のエッジタイプ（depends_on / refines / implements / extends / contradicts / relates_to / precedes / follows / contains / part_of）から適切な関係を選択し、全ノードが最低1本のエッジを持つようにする。孤立ノードが発生しないことを確認する。

1. `update-step-status.js --graphify-status="$statusPath" start-step 2`
2. エッジJSONを生成して一時ファイル `_temp_edges.json` に書き込み、crud.js で投入する：
   - `crud.js create-edges --graph="$graphPath" < _temp_edges.json`
3. `update-step-status.js --graphify-status="$statusPath" end-step 2`

### エラー時の復帰
- 実行に失敗した場合 → `update-step-status.js --graphify-status="$statusPath" fail-step 2`
- 修正後、`reset-to-step 2` で最初からやり直す

## Step 3: 機械検証

verify.js で未カバー行と孤立ノードをチェックする。`{"ok":true}` が返るまで繰り返す。

1. `update-step-status.js --graphify-status="$statusPath" start-step 3`
2. `verify.js --graph="$graphPath" --source="$1"` を実行し、出力結果の `ok` フィールドを確認する
3. 結果に応じた分岐：
   - **未カバー行が報告された場合** → `update-step-status.js --graphify-status="$statusPath" reset-to-step 1` でStep 1に戻り、未カバー行を含むノードを追加・修正する
   - **孤立ノードが報告された場合** → `update-step-status.js --graphify-status="$statusPath" reset-to-step 2` でStep 2に戻り、孤立ノードに適切なエッジを追加する
   - **`{"ok":true}` の場合** → `update-step-status.js --graphify-status="$statusPath" end-step 3` でStep 4へ進む
4. `{"ok":true}` が返るまでStep 1〜Step 3を繰り返す

### エラー時の復帰
- verify.js の実行自体に失敗した場合 → `update-step-status.js --graphify-status="$statusPath" fail-step 3`
- エラー原因を確認し、`reset-to-step 3` で再試行する

## Step 4: マーカー埋め込み

embed-markers.js でソース文書に REF マーカーを埋め込む。このスクリプトは冪等であるため再実行しても安全。

1. `update-step-status.js --graphify-status="$statusPath" start-step 4`
2. `embed-markers.js --graph="$graphPath" --source="$1"`
3. 成功時：`update-step-status.js --graphify-status="$statusPath" end-step 4`
4. エラー時：`update-step-status.js --graphify-status="$statusPath" fail-step 4` で記録して終了する

### エラー時の復帰
- 実行に失敗した場合 → fail-step 4 で記録
- embed-markers.js が出力する3段テンプレートエラーを確認し、原因（ソースファイルの書き込み権限、グラフファイルの不整合等）を特定して修正後、`reset-to-step 4` で再実行する
- 手動修正が必要な場合はエラーメッセージに従って対処する

## Step 5: 自己検証

グラフ内の任意のノードIDを1つ選び、マルチホップ検索が正常に動作することを確認する。

1. `update-step-status.js --graphify-status="$statusPath" start-step 5`
2. グラフファイルから任意のノードID（例: `N0001`）を選び、以下を実行する：
   - `query.js --graph="$graphPath" --source="$1" --id=<任意ノードID> --hops=2`
3. 成功時：`update-step-status.js --graphify-status="$statusPath" end-step 5`
4. 失敗時の復帰：
   - 原因を特定（ノード欠損ならStep 1、エッジ欠損ならStep 2、マーカー欠損ならStep 4）
   - 該当Stepに `reset-to-step N` で戻り、問題を修正する

### エラー時の復帰
- 実行に失敗した場合 → 原因を特定し、適切なStep（1〜4）に `reset-to-step N` で戻る
- query.js が出力するエラーメッセージ（3段テンプレート）を確認し、復帰先を判断する

## 完了報告

以下の情報を報告する：

- **生成グラフファイル**: `$graphPath`
- **進行ステータスファイル**: `$statusPath`
- **ノード数**: crud.js list-nodes で取得
- **エッジ数**: グラフJSONの edges 配列長から取得
- **REF数**: embed-markers.js が埋め込んだマーカー数
- **検証結果**: verify.js の最終出力（カバレッジ率、孤立ノード有無）

完了後、このグラフは formulate-tickets / formulate-tickets-for-next から load-rfc-graph.js を介して利用可能になる。
