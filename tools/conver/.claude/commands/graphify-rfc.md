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
| `query.js` | `--graph=<path> --source=<path> --id=<nodeId> --hops=<N>` | マルチホップグラフ検索とMarkdown整形出力 |
| `update-step-status.js` | `--graphify-status=<path> <start-step\|end-step\|fail-step\|reset-to-step\|status> <N>` | GRAPHIFY-Status.json の進行管理（5サブコマンド） |
| ~~`load-rfc-graph.js`~~ | （廃止） | `show-graph-summary-markdown.js --with-cli-examples` に統合 |
| `dump-ticket-graph-commands.js` | `--tickets=<path> --graph=<path> --source=<path>` | formulate連携: チケットの spec に query.js コマンドを追記 |
| `analyze-source-structure.js` | `<source-path>` | ソース文書の構造分析レポート（3軸分割支援） |
| `show-graph-summary-markdown.js` | `--graph=<path> --source=<path>` | グラフサマリーを kind 別Markdown形式で出力 |

全スクリプトはエラー時に3段テンプレート（`[ERROR]` / `原因:` / `対応:`）を stderr に出力し、終了コード1で終了する。書き込み前の JSON Schema 検証に違反した場合も同様のテンプレートでエラー内容を報告する。

## Step 0: 見出し重複排除（事前処理）

headingRefs 方式では同一階層内で同一テキストの見出しが存在すると参照が一意に解決できない。事前に見出しを重複排除する。

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

# 3軸の判断基準（上記）に基づいてノードJSONを生成し、crud.js でグラフファイルに投入する
# 生成したノードJSONは一時ファイル _temp_nodes.json に保存してから crud.js の --file で指定する
# ※ sourceRanges の refId は crud.js が自動採番するため、AI は startLine/endLine のみ指定すればよい
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" create-nodes --file=_temp_nodes.json

# Step 1 正常終了（進行ステータスを done に更新し、currentStep を 2 に進める）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" end-step 1
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 1` でステータスを戻し、Step 1 のコマンドを最初から再実行する。微修正であれば個別操作も利用可能：

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
```

### エラー時の復帰
エラーメッセージに従って原因を修正した上で、`reset-to-step 2` でステータスを戻し、Step 2 のコマンドを最初から再実行する。個別のエッジを削除してから再追加することも可能。

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

全ノードに対して query.js のマルチホップ検索を実行し、グラフ構造が /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドおよび実装段階で参照可能な品質であることを確認する。

```bash
# Step 4 を開始（進行ステータスを running に更新）
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" start-step 4

# 全ノードIDを取得する
node .claude/scripts/rfc-graph/crud.js --graph="$graphPath" list-nodes
```

全ノードそれぞれに対して `--hops=2` のマルチホップ検索を実行する。ノード数が多くとも、最低5ノード以上は実行すること。

```bash
# 例: 各ノードID（N0001, N0002, ...）に対して検索を実行
node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0001 --hops=2
node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0002 --hops=2
node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0003 --hops=2
```

### AI による品質点検

全ノードの検索結果を読み、以下の観点でグラフ構造の十分性を評価する：

1. **各ノードに最低1本のエッジが存在するか**（孤立ノードがないか）
2. **依存関係が設計文書の記述を正しく反映しているか**（必須の依存が欠落していないか）
3. **kind の分類が設計文書の内容と整合しているか**
4. **各ノードの sourceRanges が設計文書の該当箇所を過不足なくカバーしているか**
5. **/formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足している情報がないか**

不足がある場合 → 新規ノードの追加・既存ノードの修正・必要に応じて削除しての再作成を組み合わせ、**グラフを洗練（補強）する**ために Step 1 に戻る。

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
```

### エラー時の復帰
query.js のエラーメッセージに従って原因を特定し、該当するStep（ノード欠損→Step 1、エッジ欠損→Step 2）の `reset-to-step N` でステータスを戻して修正する。
```bash
# 例: Step 4 のエラーが原因不明の場合、Step 4 自体を再実行
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
- 各エッジは設計文書内の該当箇所に sourceRanges で紐付いている
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
- **検証結果**: verify.js の最終出力（カバレッジ率、孤立ノード有無）
- **最終品質検証**: show-graph-summary-markdown.js による十分性判断の結果（十分/補強履歴）
- **グラフ構造の要約**: show-graph-summary-markdown.js の出力（kind 別ノード一覧＋エッジ関係）

完了後、このグラフは /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドから `show-graph-summary-markdown.js --with-cli-examples` を介して利用可能になる。
