---
description: 例: /graphify-rfc RFC-GRAPHIFY.md（相対パス）/ /graphify-rfc /path/to/RFC-doc.md（絶対パス）。引数なしならエラー、第1引数に対象Markdown文書のファイルパス（相対/絶対）を指定し、7Step進行制御（見出し重複排除→ノード分割→エッジ付与→機械検証→自己検証→最終品質検証）でグラフ変換を実行。
argument-hint: </path/to/RFC-doc.md>
allowed-tools: Read, Write, Bash
---

# /graphify-rfc <source-file-path>

**役割**: 長大Markdown設計文書をI/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化する。生成されたグラフは /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドから利用可能になる。

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

- **/graphify-rfc スラッシュコマンドは /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドよりも常に細かい粒度で分割する（発散）**。/formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがグラフから必要な粒度の情報を取り出す際に、細かすぎるノードは集約可能だが、粗すぎるノードは分割不能である。
- 各Stepで使用するスクリプトは `.claude/scripts/rfc-graph/` 配下に配置されている。
- update-step-status.js の呼び出しは `--graphify-status=<path>` プリフィックスで行う。
- crud.js / verify.js / query.js は `--graph=<path>` / `--source=<path>` の引数形式で呼び出す。

## 使用スクリプト一覧

`.claude/scripts/rfc-graph/` 配下。

| スクリプト | 引数 | 説明 |
|---|---|---|
| `crud.js` | `--graph=<path> <subcommand>`（各サブコマンド参照） | グラフの唯一の書き込み経路。create-nodes / list-nodes / get-node / update-node / delete-node / create-edges / delete-edges |
| `deduplicate-headings.js` | `<source-path>` | 見出し重複排除（同一階層・同一テキストに A-Z 追記） |
| `resolve-by-heading.js` | `<source-path> --target=<heading>` | headingRefs 解決（4段階フォールバック照合） |
| `verify.js` | `--graph=<path> --source=<path>` | 未カバー行と孤立ノードの機械検証 |
| `validate-slug.js` | `--graph=<path>` | 全ノードの slug 命名規則・長さ検証（Step 1 自己修復ループで使用） |
| `query.js` | `--graph=<path> --source=<path> --id=<nodeId> --hops=<N>` | マルチホップグラフ検索とMarkdown整形出力 |
| `test-query-all.js` | `--graph=<path> --source=<path>` | 全 headingRefs 一括検証（exit 0/1 + _fix_graph_hints.json 出力） |
| `query-fix-hints.js` | `--hints=<path> [--id=<nodeId>] [--diagnosis=<M0-M10>] [--refId=<refId>]` | _fix_graph_hints.json 検索・Markdown整形表示 |
| `update-step-status.js` | `--graphify-status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | GRAPHIFY-Status.json の進行管理（5サブコマンド） |
| ~~`load-rfc-graph.js`~~ | （廃止） | `show-graph-summary-markdown.js --with-cli-examples` に統合 |
| `dump-ticket-graph-commands.js` | `--tickets=<path> --graph=<path> --source=<path>` | formulate連携: チケットの spec に query.js コマンドを追記 |
| `analyze-source-structure.js` | `<source-path>` | ソース文書の構造分析レポート（3軸分割支援） |
| `show-graph-summary-markdown.js` | `--graph=<path> --source=<path>` | グラフサマリーを kind 別Markdown形式で出力 |

全スクリプトはエラー時に3段テンプレート（`[ERROR]` / `原因:` / `対応:`）を stderr に出力し、終了コード1で終了する。書き込み前の JSON Schema 検証に違反した場合も同様のテンプレートでエラー内容を報告する。

## グラフスキーマ定義

`*-GRAPH.json` は以下の3層スキーマで構成される。

### ルート (graph.schema.json)

```json
{
  "sourceFile": "RFC-ROOT.md",
  "mainLanguage": "rust",
  "nodes": [...],
  "edges": [...]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `sourceFile` | string | required | 元Markdown文書のパス |
| `mainLanguage` | string | required | プロジェクト全体の主要プログラミング言語（例: `"rust"`）。複数言語混在プロジェクトでは中心言語を指定する。全ノードの `language` 未設定時の唯一のフォールバック値として使用される。 |
| `nodes` | array | required | ノード配列（node.schema.json） |
| `edges` | array | required | エッジ配列（edge.schema.json） |

### ノード (node.schema.json)

```json
{
  "id": "N0001",
  "title": "§1 目的 — 本crateの責務定義",
  "kind": "architecture",
  "summary": "本crateの目的を定義...",
  "language": "rust",
  "slug": "purpose_crate_responsibility",
  "headingRefs": [
    { "refId": "REF001", "heading": 2, "texts": ["§1 目的"] }
  ]
}
```

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | required | `^N[0-9]{4}$` 形式のノードID |
| `title` | string | required | 1〜120文字のタイトル |
| `kind` | string | required | 12種の enum から選択 |
| `summary` | string | required | 1文字以上の要約 |
| `language` | string | required（原則） | 当該ノードが実装されるプログラミング言語（単一値、配列ではない）。Step 1 の「言語割り当てルール」に従って原則必須で設定する。事故で空の場合のみ `mainLanguage` の値をフォールバックとして使用する。 |
| `slug` | string | required | タイトルから生成された lower_snake_case の識別子（パターン: `^[a-z][a-z0-9_]*$`、最大25文字）。Step 1 の「slug 生成ルール」に従って必ず設定する。空を許容しない。ファイル名・ディレクトリ名のベースとして機械的に使用される。 |
| `headingRefs` | array | required | 元文書の見出し参照（1件以上） |

## Step 0: 見出し重複排除（事前処理）

headingRefs 方式では同一階層内で同一テキストの見出しが存在すると参照が一意に解決できない。事前にスクリプトにより機械的に見出しの重複を排除する。

```bash
# Step 0 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 0

# ソース文書の見出し重複を排除（同一階層・同一テキストに A-Z 追記）
# 変更があった場合はファイルを上書きし、変更ログを出力する。変更がなければその旨を報告する。
node .claude/scripts/rfc-graph/deduplicate-headings.js "$1"

# Step 0 正常終了（進行ステータスを done に更新し、currentStep を 1 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 0
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 0` でステータスを戻し、Step 0 のコマンドを最初から再実行する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 0
```

## Step 1: ノード分割

ソース文書の全行を読み込み、以下の3軸で意味的I/O境界を特定しノードに分割する。/graphify-rfc スラッシュコマンドは /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドよりも常に細かい粒度で分割する（発散）ことを徹底する。graphify で発散的に分割した多数のノードを、formulate によって適切な実装チケット単位に束ねることで情報密度の高い収束を実現する為。

**第1軸: セクション階層**
- Markdown の `##` 見出しを主要な分割境界とする
- 同一見出し内でも内容が複数の概念にまたがる場合は分割する
- 見出しのない段落群は前後のセクションに統合せず、独立したノードとする
- 参照情報として `analyze-source-structure.js` が出力するセクションツリーを活用する

**第2軸: kind（12種）の単一割り当て**
- 各ノードは1つの kind のみを持つ。一つのセクション内で複数の kind が混在する場合は強制分割する
- kind は以下の12種から選択する：
  `requirement`（要件） / `api_contract`（API契約） / `data_model`（データモデル） /
  `state_machine`（状態機械） / `architecture`（アーキテクチャ概要・コンポーネント構成） /
  `security`（セキュリティモデル・脅威対策） /
  `error_policy`（エラー処理方針） / `config`（設定） / `test_policy`（テスト方針） /
  `build_ci`（ビルド/CI） / `rationale`（設計判断根拠） / `glossary`（用語集）
- 例: 「要件」と「API契約」が同じセクションに混在 → 2ノードに分割

**第3軸: 外部依存の有無**
- 外部依存（ファイルI/O・ネットワーク・DB・他モジュール呼び出し等）を含む記述は、依存内容を持つノードと依存を持たないノードに強制分割する
- これにより /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドの「1チケット・1不変条件」に対応した分割が可能になる

**第4軸: 言語割り当て**
- 各ノードに `language` フィールド（単一値）を設定する。配列ではない。
- 基本ルール: プロジェクトの主要言語（`mainLanguage`）をデフォルトとする。ほとんどのノードは `mainLanguage` と同じ値になる。
- 例外ルール: ノードの内容が他言語に強く依存する場合のみ、異なる値を設定する（例: TypeScript の型定義を記述したセクション → `"typescript"`、Go のインターフェース設計 → `"go"`）。
- 言語に依存しない内容（要件定義・用語集・設計判断根拠等）には `mainLanguage` を設定する。
- 対応言語: `"rust"`, `"go"`, `"typescript"` の3種。これ以外の値は設定しない。

**slug 生成ルール**

各ノードに `slug` フィールド（lower_snake_case、最大64文字、パターン: `^[a-z][a-z0-9_]*$`）を設定する。以下の優先順位で決定論的に生成する:

1. **英単語抽出**: タイトルから英単語・数字を取り出し、lower_snake_case に変換する。
   - `§1 目的 — 本crateの責務定義` → `purpose_crate_responsibility`
   - `§2.1 Tauri統合との責務境界` → `tauri_integration_boundary`
   - `§4.1 バージョニングポリシー` → `versioning_policy`

2. **セクション番号フォールバック**: 英単語がない（または少なすぎて識別性が低い）場合、セクション番号をベースにする。ドットはアンダースコアに置換する。
   - `§3 用語 — ドメイン固有の定義` → `section_3_glossary`（kind名を接尾辞）
   - `§17.1 登録状態遷移規則` → `section_17_1`
   - `§18.1 通話状態遷移規則` → `section_18_1`

3. **衝突回避**: 同一グラフ内で slug が衝突する場合、末尾に `_2`, `_3` ... を付与して一意にする。最初の出現にはサフィックス不要。

4. **禁止文字**: 大文字、ハイフン、先頭数字を禁止。すべて lower_snake_case に変換すること。
   - `API設計` → `api_design`（大文字→小文字）
   - `3rd-party` → `third_party`（先頭数字回避、ハイフン→_）

**粒度の目安**: コードスニペット（``` で囲まれたブロック）の行数を除いた実質的な記述内容で、1ノード概ね30〜50行程度を上限とする。100行を超えるセクション（コードスニペットを除く）は必ず複数ノードに分割する。/formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドのチケット粒度よりも細かいことを常に意識する。

```bash
# 事前に analyze-source-structure.js で機械的構造情報を取得し、3軸すべての参考としての判断材料とする
node .claude/scripts/rfc-graph/analyze-source-structure.js "$1"
```

`## 100行超セクション` の項目を確認し、100行を超えるセクションがあれば、内容自体の変更や情報の欠損が絶対に起きないように細心の注意を払いながらRFCソースファイルを直接編集して `###` 小見出しを挿入し、30〜50行程度の適切な粒度に分割する。分割が完了したら、再度 `analyze-source-structure.js` を実行して100行超セクションが解消されたことを確認する：

```bash
# 再度構造分析を実行し、100行超セクションがなくなったことを確認する
node .claude/scripts/rfc-graph/analyze-source-structure.js "$1"
```

`## 100行超セクション` が「なし（全セクションが100行未満）」と報告されるまで、RFCソースファイルの編集と再確認を繰り返す。

```bash
# Step 1 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 1

# 4軸の判断基準 + slug 生成ルール（上記）に基づいてノードJSONを生成し、crud.js でグラフファイルに投入する
# 生成したノードJSONは一時ファイル _temp_nodes.json に保存してから crud.js の --file で指定する
# ※ sourceRanges の refId は crud.js が自動採番するため、AI は startLine/endLine のみ指定すればよい
#
# ノードJSONの各エントリは以下の形式:
# {"id":"N0001","title":"§1 目的","kind":"architecture","summary":"...","language":"rust","slug":"purpose","headingRefs":[{"refId":"REF001","heading":2,"texts":["§1 目的"]}]}
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-nodes --file=_temp_nodes.json --source="$1"

# slug 検証（命名規則・長さ・単語数の事前チェック）
node .claude/scripts/rfc-graph/validate-slug.js --graph="$graphPath"

# 検証エラーがある場合、crud.js で各ノードの slug を修正してから再実行する
# 検証エラーは標準出力に {"ok":false, "errors":[...]} のJSON形式で出力される
# 各 error.remedy に crud.js の修正コマンド例が含まれている

# Step 1 正常終了（進行ステータスを done に更新し、currentStep を 2 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 1

# 一時ファイルのクリーンアップ
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### エラー時の復帰

validate-slug.js で slug 検証エラーが報告された場合は、各エラーの remedy フィールドに記載された crud.js コマンドで slug を修正し、`reset-to-step 1` で再実行する：

```bash
# エラー例: {"nodeId":"N0005","slug":"CamelCaseName","reason":"大文字が含まれています","remedy":"node ... crud.js ... update-node --id=N0005 --field=slug --value=camelcasename"}
# remedy のコマンドを実行して slug を修正
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" update-node --id=N0005 --field=slug --value=camelcasename

# 修正後、Step 1 の先頭から再実行
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```
エラーメッセージに従って原因を修正した上で、`reset-to-step 1` でステータスを戻し、Step 1 のコマンドを最初から再実行する。古い一時ファイルがあれば削除してから再実行すること：

```bash
# 古い一時ファイルを削除してから再実行
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

微修正であれば個別操作も利用可能：

```bash
# 特定ノードの sourceRanges などを部分修正する
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" get-node --id=N0003
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" update-node --id=N0003 --file=_patch.json

# 不要なノードを削除する
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" delete-node --id=N0003

# 広範囲の修正が必要なら全体を再実行
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

## Step 2: エッジ付与

12種のエッジタイプ（depends_on / implements / refines / extends / conflicts_with / triggers / constrains / supersedes / references / precedes / part_of / validates）から適切な関係を選択し、全ノードが最低1本のエッジを持つようにする。孤立ノードが発生しないことを確認する。

```bash
# Step 2 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 2

# エッジJSONを生成し、crud.js でグラフファイルに投入する
# 生成したエッジJSONは一時ファイル _temp_edges.json に保存してから crud.js の --file で指定する
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-edges --file=_temp_edges.json

# Step 2 正常終了（進行ステータスを done に更新し、currentStep を 3 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 2

# 一時ファイルのクリーンアップ
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 2` でステータスを戻し、Step 2 のコマンドを最初から再実行する。古い一時ファイルがあれば削除してから再実行すること：

```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
```

個別のエッジを削除してから再追加することも可能。

```bash
# 不要なエッジを削除する（from + to + type で識別）
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" delete-edges --file=_remove_edges.json

# 追加のエッジを投入する
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-edges --file=_add_edges.json

# 広範囲の修正が必要なら全体を再実行
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
```

## Step 3: 機械検証

verify.js で未カバー行と孤立ノードをチェックする。`{"ok":true}` が返るまで繰り返す。

```bash
# Step 3 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 3

# 未カバー行・孤立ノードを機械検証する
node .claude/scripts/rfc-graph/verify.js --graph="$graphPath" --source="$1"
```

検証結果に応じて分岐する：

- **未カバー行が報告された場合** → `reset-to-step 1` でStep 1に戻り、未カバー行を含むノードを追加・修正する
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
  ```
- **孤立ノードが報告された場合** → `reset-to-step 2` でStep 2に戻り、孤立ノードに適切なエッジを追加する
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 2
  ```
- **`{"ok":true}` の場合** → Step 4へ進む
  ```bash
  node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 3
  ```

`{"ok":true}` が返るまでStep 1〜Step 3を繰り返す。

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 3` でステータスを戻し、Step 3 のコマンドを最初から再実行する。
```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 3
```

## Step 4: 自己検証

全 headingRefs の解決可能性を test-query-all.js で機械検証し、通過後に必要に応じて query.js で構造クエリを実行する。グラフ構造が /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドおよび実装段階で参照可能な品質であることを確認する。

```bash
# Step 4 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 4

# 全 headingRefs の解決可能性を検証する（通過必須ゲート）
node .claude/scripts/rfc-graph/test-query-all.js --graph="$graphPath" --source="$1"
```

test-query-all.js の終了コードで分岐する：

- **exit 0（全 headingRefs 解決確認済み）** → 後続の任意クエリに進む
- **exit 1（解決不能な headingRefs が存在）** → 以下の手順で修正する：
  1. stderr に出力された解決不能 headingRefs の一覧を確認する
  2. 必要に応じて `query-fix-hints.js` で詳細診断情報を取得する：
     ```bash
     node .claude/scripts/rfc-graph/query-fix-hints.js --hints=_fix_graph_hints.json
     ```
  3. `_fix_graph_hints.json` の remedyHint に従い、`crud.js update-node` で headingRefs を修正する
  4. 一時ファイルを削除してから再実行する：
     ```bash
     node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
     node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
     ```

test-query-all.js が exit 0 の場合、全 headingRefs の解決が保証されている。以降は必要に応じて任意のノードに対して構造クエリを実行する：

```bash
# 例: 特定ノードのマルチホップ検索（必要に応じて --hops=2）
node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0001 --hops=2
```

ノード数が多い場合も、AI が必要と判断したノードのみクエリすればよい（全 headingRefs 解決済みのため、グラフ全体の到達可能性は保証されている）。

### AI による品質点検（ランダムサンプリング目視確認）

機械的検証では検出できない品質問題（エッジの正しさ、kind 分類の整合、headingRefs の過不足）を、ランダムサンプリングにより目視確認する。

```bash
# 全ノードの query.js 結果を _quality/ に保存し、8%を乱数選出してコマンド一覧を表示
bash .claude/scripts/rfc-graph/query-all-nodes.sh --graph="$graphPath" --source="$1"
```

出力されたコマンド一覧の各ノードに対して、以下の手順で点検する：

```bash
# 選出されたノードの内容を表示（例: N0001）
node .claude/scripts/rfc-graph/get-node-for-check.js N0001
```

各ノードの表示内容を読み、以下の点検項目を確認する：

1. **他のノードとの関係性が設計文書の記述を正しく反映しているか**（必須のエッジが欠落していないか）
2. **各ノードの内容が設計文書の該当箇所を過不足なくカバーしているか**
3. **/formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足している情報がないか**

不足がある場合 → 新規ノードの追加・既存ノードの修正・新規エッジの追加・既存エッジの修正・必要に応じて削除しての再作成を組み合わせ、**グラフを洗練（補強）する**ために Step 1 に戻る。

```bash
# 補強: 不足情報をカバーするため、Step 1 に戻る
# 新規ノード追加・update-node による修正・delete-node による再作成を適宜組み合わせる
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

「やり直す」のではなく「補強（洗練）」である点に注意。重複や粒度の粗いノードは delete-node で削除し、より適切なノードに再分割する。不足があれば add-node で追加する。update-node で既存ノードを微調整してもよい。グラフ全体の品質を高める方向であれば、変更の種類は問わない。

不足がない場合 → Step 4 正常終了。

```bash
# 成功時: Step 4 正常終了（進行ステータスを done に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 4
# 一時ファイルのクリーンアップ（_quality/ ディレクトリも削除対象）
rm -rf _quality/
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

### エラー時の復帰

query.js のエラーメッセージに従って原因を特定し、該当するStep（ノード欠損→Step 1、エッジ欠損→Step 2）の `reset-to-step N` でステータスを戻して修正する。

#### test-query-all.js 失敗時の復帰
stderr に出力された解決不能 headingRefs の一覧を確認し、`_fix_graph_hints.json` の remedyHint に従って `crud.js` で修正する。修正後、cleanup → reset-to-step 4 で再実行する：

```bash
# 一時ファイルを削除してから再実行
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
```

#### 原因不明のエラー時の復帰
```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
```

## Step 5: 最終品質検証 — 全件サマリー点検

show-graph-summary-markdown.js でグラフ全体のサマリーを機械的に出力し、AI が構造の十分性を最終判断する。

```bash
# Step 5 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 5

# グラフ全体のサマリーをMarkdown形式で出力する
node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="$graphPath" --source="$1"
```

### AI による十分性判断

出力されたサマリー全体を読み、以下の観点でグラフが「十分に構造化された関係グラフ」であるか判断する：

1. **設計文書の全主要セクションが過不足なくノード化されているか**
2. **各ノードの kind 分類が設計意図と整合しているか**
3. **ノード間の依存関係（エッジ）が設計文書の論理的関係を正確に反映しているか**
4. **/formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足や曖昧な箇所がないか**

### 判断と分岐

**十分と判断した場合** → その理由を以下の例の形式で具体的に説明する：

```markdown
[十分性の説明]
- 全12セクション中12セクションがノード化されている
- requirement 4件・api_contract 3件・architecture 2件の kind 分類はいずれも設計文書の記述と整合
- 依存関係は「認証API→トークン検証→セッション管理→ACL」のチェーンが fully connected
- 孤立ノードは0件
- 各エッジは設計文書内の該当箇所に headingRefs で紐付いている
- 補足情報: ?????
```

この説明をユーザーが確実に納得できる水準であること。説明が弱いと感じる場合（例：抽象的な「十分です」だけ／具体的事実の列挙がない）は、それは納得させられる説明になっていないと判断し、補強に回る。

**不十分と判断した場合、またはユーザーを納得させる説明を書けない場合** → Step 1 に戻って補強（洗練）する。

```bash
# 補強: グラフを洗練するため Step 1 に戻る
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 1
```

**十分と判断し、かつユーザーを納得させる説明を書けた場合** → Step 5 正常終了。

```bash
# 成功時: Step 5 正常終了（進行ステータスを done に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 5
```

### エラー時の復帰
スクリプトのエラーメッセージに従って原因を修正した上で、`reset-to-step 5` でステータスを戻し、Step 5 のコマンドを最初から再実行する。
```bash
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 5
```

## 完了報告

以下の情報を報告する：

- **生成グラフファイル**: `$graphPath`
- **進行ステータスファイル**: `$statusPath`
- **ノード数**: crud.js list-nodes で取得
- **エッジ数**: グラフJSONの edges 配列長から取得
- **headingRefs 解決率**: test-query-all.js が全 N 件解決確認済み
- **検証結果**: verify.js の最終出力（カバレッジ率、孤立ノード有無）
- **最終品質検証**: show-graph-summary-markdown.js による十分性判断の結果（十分/補強履歴）
- **グラフ構造の要約**: show-graph-summary-markdown.js の出力（kind 別ノード一覧＋エッジ関係）

完了後、このグラフは /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドから `show-graph-summary-markdown.js --with-cli-examples` を介して利用可能になる。
