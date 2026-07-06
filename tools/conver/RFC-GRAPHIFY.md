# RFC: `/graphify-rfc` — 長大Markdown文書のマルチホップグラフ検索可能化コマンド

## Abstract

本RFCは、任意の長大なMarkdown設計文書（以下「ソース文書」）をI/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化し、行番号変化に強い恒久的マーカー方式でソース文書内の該当箇所を参照・検索可能にするスラッシュコマンド `/graphify-rfc` を定義する。グラフ構造は `/formulate-tickets` および `/formulate-tickets-for-next` におけるチケット分解の「地図」として機能し、graphify（発散）→formulate（収束）のパイプラインを形成する。コマンドは `.claude/commands/graphify-rfc.md` の単一ファイルとして実装し、バックエンドのNode.jsスクリプト群が決定論的な機械処理を担当する。人間の判断（意味理解・分割・分類）と機械的処理（スキーマ検証・行番号再計算・マーカー挿入・グラフ探索）を厳密に分離し、後者は一切AIの推論に委ねない。

## Motivation

長大な設計文書は、全文をコンテキストに載せずに必要な断片だけを機械的に取得できる必要がある。行番号ベースの参照は文書編集によって容易に破損するため、恒久的なマーカー方式とグラフ構造による関係性の明示が必要となる。

従来の `/formulate-tickets` パイプラインでは、RFCからチケットを生成する際にAIがRFC全体を読み込み、I/O境界を自ら判断してチケット分解を行っていた。この方式には以下の問題がある：

1. **依存関係の暗黙化**: どの設計判断がどの設計判断に依存しているかが明示されない
2. **再現性の欠如**: 同じRFCから同じチケット分解が保証されない
3. **行番号参照の脆さ**: 文書編集により行番号参照が容易に破損する
4. **チケット間関係の非網羅性**: どのチケットがどの設計要素に対応するかの追跡が困難

これらの問題を解決するため、RFCをグラフ構造に変換する `/graphify-rfc` を独立した前処理フェーズとして導入する。graphify が生成したグラフを formulate が読み込むことで、発散（可能な限り細かい粒度への分解）と収束（チケットへの合理的統合）を明確に分離する。

## Design

### 3.1 アーキテクチャ概要

```
.claude/commands/
  graphify-rfc.md                     # 唯一のスラッシュコマンド

.claude/scripts/
  rfc-graph/
    schema/
      node.schema.json                # ノードスキーマ
      edge.schema.json                # エッジスキーマ
      graph.schema.json               # グラフ全体スキーマ
    crud.js                           # グラフCRUD（唯一の書き込み経路）
    verify.js                         # カバレッジ・孤立ノード検証
    embed-markers.js                  # マーカー書き込み（冪等）
    query.js                          # マルチホップ検索 + Markdown整形
    update-step-status.js             # GRAPHIFY-Status.json 管理

  tickets/
    load-rfc-graph.js                 # formulate連携: グラフ読み込み・サマリー表示
    dump-ticket-graph-commands.js     # formulate連携: ノード→specコマンド追記

tests/
  rfc-graph/                          # テストスクリプト群
```

**グラフとステータスファイルの出力規則**:

| 対象 | パス |
|------|------|
| グラフJSON | `<source-dir>/<basename>-GRAPH.json` |
| GRAPHIFY-Status.json | `<source-dir>/<basename>-GRAPHIFY-Status.json` |

両ファイルはソースRFCファイルと同じディレクトリに配置される。グラフパスとステータスパスはスラッシュコマンド側で導出し、各スクリプトには `--graph` や `--graphify-status` で明示的に渡す。

### 3.2 データモデル

#### 3.2.1 ノードスキーマ（node.schema.json）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "title", "kind", "summary", "sourceRanges"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^N[0-9]{4}$" },
    "title": { "type": "string", "minLength": 1, "maxLength": 120 },
    "kind": {
      "type": "string",
      "enum": [
        "requirement", "api_contract", "data_model", "state_machine",
        "architecture", "security",
        "error_policy", "config", "test_policy", "build_ci",
        "rationale", "glossary"
      ]
    },
    "summary": { "type": "string", "minLength": 1 },
    "sourceRanges": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["refId", "startLine", "endLine"],
        "additionalProperties": false,
        "properties": {
          "refId": { "type": "string", "pattern": "^REF[0-9]{3,}$" },
          "startLine": { "type": "integer", "minimum": 1 },
          "endLine": { "type": "integer", "minimum": 1 }
        }
      }
    }
  }
}
```

`sourceRanges` の `startLine`/`endLine` はマーカー埋め込み前の一時座標である。マーカー埋め込み後は、`refId` に対応する実際の行番号を都度ソース文書のマーカーをスキャンして再計算する（5.5節参照）。

#### 3.2.2 エッジスキーマ（edge.schema.json）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["from", "to", "type", "attributes"],
  "additionalProperties": false,
  "properties": {
    "from": { "type": "string", "pattern": "^N[0-9]{4}$" },
    "to": { "type": "string", "pattern": "^N[0-9]{4}$" },
    "type": {
      "type": "string",
      "enum": [
        "depends_on", "implements", "refines", "extends",
        "conflicts_with", "triggers", "constrains",
        "supersedes", "references", "precedes",
        "part_of", "validates"
      ]
    },
    "attributes": {
      "type": "object",
      "required": ["strength", "bidirectional"],
      "additionalProperties": false,
      "properties": {
        "strength": { "enum": ["hard", "soft"] },
        "bidirectional": { "type": "boolean" },
        "note": { "type": "string", "maxLength": 240 }
      }
    }
  }
}
```

| type | 意味 |
|------|------|
| depends_on | 前提仕様への依存 |
| implements | 抽象要件の具体実装 |
| refines | 詳細化・補足 |
| extends | 汎化・型階層の継承関係 |
| conflicts_with | 相互矛盾・排他 |
| triggers | イベント/遷移の誘発 |
| constrains | 制約を課す |
| supersedes | 旧仕様の置換 |
| references | 単純参照 |
| precedes | 時系列的な先行関係 |
| part_of | 包含・親子関係 |
| validates | 検証・テスト関係 |

#### 3.2.3 グラフ全体スキーマ（graph.schema.json）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["sourceFile", "nodes", "edges"],
  "additionalProperties": false,
  "properties": {
    "sourceFile": { "type": "string" },
    "nodes": { "type": "array", "items": { "$ref": "node.schema.json" } },
    "edges": { "type": "array", "items": { "$ref": "edge.schema.json" } }
  }
}
```

### 3.3 ディレクトリ構成とファイル命名規則

| カテゴリ | パス | 備考 |
|----------|------|------|
| スラッシュコマンド | `.claude/commands/graphify-rfc.md` | ユーザーが `/graphify-rfc <path>` で起動 |
| グラフ化スクリプト | `.claude/scripts/rfc-graph/` | crud.js・verify.js・embed-markers.js・query.js・update-step-status.js の5本 |
| JSON Schema | `.claude/scripts/rfc-graph/schema/` | node.schema.json・edge.schema.json・graph.schema.json の3ファイル |
| formulate連携スクリプト | `.claude/scripts/tickets/` | load-rfc-graph.js・dump-ticket-graph-commands.js |
| テスト | `tests/rfc-graph/` | Acceptance Criteria + エッジケースのテストスクリプト |
| グラフ出力 | `<rfc-dir>/<basename>-GRAPH.json` | ソースRFCと同階層に出力 |
| ステータス | `<rfc-dir>/<basename>-GRAPHIFY-Status.json` | 同上 |

実装言語は **JavaScript CommonJS** に統一する。既存の `.claude/scripts/` 内スクリプト（grill-me-for-rfc、tickets等）がすべてCommonJSであるため、新しいビルドステップを導入せず統一する。型安全性はJSON Schema検証と機械的アルゴリズムで担保する。

### 3.4 Step モデル（5Step固定制御）

graphify-rfc は5つのStepで構成される。進行状態は `<basename>-GRAPHIFY-Status.json` で管理され、各Stepの開始/終了/エラー時に `update-step-status.js` がファイルを更新する。

```
Step 1: ノード分割
  └─ AIが3軸基準で分割 → crud.js create-nodes でグラフに投入

Step 2: エッジ付与
  └─ AIが12種エッジタイプで関係定義 → crud.js create-edges でグラフに投入

Step 3: 機械検証
  └─ verify.js で未カバー行・孤立ノードをチェック
      問題あれば Step 1（未カバー行）または Step 2（孤立ノード）に戻る

Step 4: マーカー埋め込み
  └─ embed-markers.js でソース文書に REF マーカーを埋め込み（冪等）

Step 5: 自己検証
  └─ query.js でマルチホップ検索が正常動作することを確認
      問題あれば原因に応じて該当Stepに戻る
```

**graphify と formulate の関係**:

graphify は可能な限り細かい粒度への分割（発散）を担当する。formulate は graphify が生成したグラフを読み取り、ノードをグループ化して実装チケットに束ね直す（収束）。この2段階のパイプラインにより、チケット分解の品質と再現性が向上する。

### 3.5 GRAPHIFY-Status.json スキーマ

```json
{
  "sourceFile": "/path/to/RFC-GRAPHIFY.md",
  "graphFile": "/path/to/RFC-GRAPHIFY-GRAPH.json",
  "currentStep": 1,
  "steps": {
    "1": "pending",
    "2": "pending",
    "3": "pending",
    "4": "pending",
    "5": "pending"
  }
}
```

各Stepの status は4値：`pending`（未着手） / `running`（実行中） / `done`（完了） / `error`（異常終了）。

`update-step-status.js` が提供する5サブコマンド：

```bash
# Step N を開始（status=running, currentStep=N）
update-step-status.js --graphify-status=<path> start-step <N>

# Step N を正常終了（status=done, currentStep=N+1）
update-step-status.js --graphify-status=<path> end-step <N>

# Step N を異常終了（status=error, currentStep 変更なし）
update-step-status.js --graphify-status=<path> fail-step <N>

# Step N に復帰（Nより後の全Stepをpending, currentStep=N。N自身は変更なし）
update-step-status.js --graphify-status=<path> reset-to-step <N>

# 現在のStep状態を表示
update-step-status.js --graphify-status=<path> status
```

### 3.6 Step 1: ノード分割基準（3軸分割）

ノード分割は以下の3軸に従い、AIがソース文書を読んで判断する。この判断はgraphifyの発散フェーズであり、分割粒度は formulate のチケット粒度よりも常に細かくなければならない。

**第1軸: セクション階層**
- Markdownの `##` 見出しを主要な分割境界とする
- 同一見出し内でも内容が複数の概念にまたがる場合は分割する
- 見出しのない段落群は前後のセクションに統合せず、独立したノードとする

**第2軸: kind（12種）の単一割り当て**
- 各ノードは1つの kind のみを持つ
- 一つのセクション内で複数の kind が混在する場合は強制分割する
- kind は以下から選択する：requirement / api_contract / data_model / state_machine / architecture / security / error_policy / config / test_policy / build_ci / rationale / glossary
- 例: 「要件」と「API契約」が同じセクションに混在 → 2ノードに分割

**第3軸: 外部依存の有無**
- 外部依存（ファイルI/O・ネットワーク・DB・他モジュール呼び出し等）を含む記述は、依存内容を持つノードと依存を持たないノードに強制分割する
- これにより formulate の「1チケット・1不変条件」に対応した分割が可能になる

**粒度の目安**: 1ノードは概ね30〜50行を上限とする。100行を超えるセクションは必ず複数ノードに分割する。formulate のチケット粒度よりも細かいことを常に意識する。

### 3.7 全スクリプトのCLI契約

```bash
# crud.js — グラフの唯一の書き込み経路
crud.js --graph=<path> create-nodes --file=<nodes.json>
crud.js --graph=<path> create-edges --file=<edges.json>
crud.js --graph=<path> list-nodes
crud.js --graph=<path> get-node --id=<nodeId>
crud.js --graph=<path> update-node --id=<nodeId> --file=<patch.json>
crud.js --graph=<path> delete-node --id=<nodeId>

# verify.js — カバレッジ・孤立ノード検証
verify.js --graph=<path> --source=<path>

# embed-markers.js — マーカー埋め込み（冪等）
embed-markers.js --graph=<path> --source=<path>

# query.js — マルチホップグラフ探索
query.js --graph=<path> --source=<path> --id=<nodeId> --hops=<N>

# update-step-status.js — GRAPHIFY-Status.json 管理
update-step-status.js --graphify-status=<path> start-step <N>
update-step-status.js --graphify-status=<path> end-step <N>
update-step-status.js --graphify-status=<path> fail-step <N>
update-step-status.js --graphify-status=<path> reset-to-step <N>
update-step-status.js --graphify-status=<path> status

# load-rfc-graph.js — formulate連携（グラフサマリー＋CLI使用例）
load-rfc-graph.js <source-path>

# dump-ticket-graph-commands.js — formulate連携（ノード→specコマンド追記）
dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>
```

### 3.8 エラー処理プロトコル

全スクリプトに統一されたエラー処理プロトコルを適用する。

**基本方針**:
- エラー発生時は終了コード1で終了する
- エラー詳細は日本語の3段テンプレートでstderrに出力する
- グラフファイル・ソースファイルは一切変更しない（副作用ゼロ）

**3段テンプレートの形式**:

```
[ERROR] <何が起きたか>
原因: <なぜ起きたか>
対応: <次に取るべきアクション>
```

**例**:

```
[ERROR] ノード N0001 の sourceRanges に指定された行番号がソースファイルの行数を超えています。
原因: ソースファイルが編集され、指定行が削除された可能性があります。sourceRanges: L120-L145、ソースファイルの総行数: 130行。
対応: crud.js update-node で該当ノードの sourceRanges を修正し、再実行してください。
```

**アトミック書き込み戦略**:
全書き込み操作（crud.js の全サブコマンド、embed-markers.js のマーカー挿入）は、以下の手順でアトミック性を保証する：

```javascript
const tmpPath = targetPath + '.tmp.' + process.pid;
fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
fs.renameSync(tmpPath, targetPath); // OSレベルのアトミック置換
```

書き込み途中のプロセス異常終了でも、元ファイルが破損することはない。

### 3.9 formatulate-tickets 連携

#### 3.9.1 load-rfc-graph.js

formulate-tickets および formulate-tickets-for-next の両方に、既存 Step 1（I/O境界参照）と Step 2（設計書検証）の間で呼び出す新ステップを追加する。このスクリプトは以下の処理を行う：

1. `<source-path>` からグラフパスを自動導出（`<source-dir>/<basename>-GRAPH.json`）
2. グラフファイルが存在すれば、自然言語のグラフサマリー（ノード数・kind別分布・エッジ数・type別分布・ツリー表示）を標準出力に出力
3. 同時に crud.js と query.js の具体的なCLI使用例も出力する（例: `crud.js list-nodes --graph=<path>`、`query.js --graph=<path> --source=<path> --id=N0001 --hops=2`）
4. グラフファイルが存在しなければ何も出力せず終了コード0で終了（既存動作に影響ゼロ）

**出力例**:

```
[グラフ構造サマリー]
グラフファイル: RFC-GRAPHIFY-GRAPH.json
ノード: 12件 (requirement:4, api_contract:3, data_model:2, rationale:2, glossary:1)
エッジ: 18件 (depends_on:8, refines:4, implements:3, validates:2, part_of:1)
孤立ノード: 0件

[グラフ探索コマンド]
全ノード一覧: node .claude/scripts/rfc-graph/crud.js list-nodes --graph=RFC-GRAPHIFY-GRAPH.json
特定ノード取得: node .claude/scripts/rfc-graph/crud.js get-node --graph=RFC-GRAPHIFY-GRAPH.json --id=N0001
2ホップ探索: node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0001 --hops=2
```

#### 3.9.2 dump-ticket-graph-commands.js

formulate-tickets のチケット生成フェーズ（既存 Step 6とStep 7の間）で呼び出す。以下の処理を行う：

1. Tickets.json を読み込む
2. 各チケットの `nodeIDs` フィールドをスキャンする
3. グラフファイルが存在すれば、各ノードIDに対する `query.js` コマンドを機械的に生成し、チケットの `description` に「RFC設計グラフ構造探索コマンド」セクションとして追記する
4. グラフファイルが存在しなければ、「グラフファイルがありません」を各チケットの description に追記する

**Tickets.json のスキーマ拡張**:
各チケットにオプショナルな `nodeIDs` フィールドを追加する：

```json
{
  "id": "P0-1",
  "phaseId": "P0",
  "title": "認証モジュールの実装",
  "status": "pending",
  "description": "認証モジュールを実装する...",
  "nodeIDs": ["N0001", "N0003", "N0005"]
}
```

`bulk-add-tickets.js` / `add-ticket.js` の改修（`--node-ids` 対応）は本RFCのスコープ外とし、別タスクで対応する。

**spec への追記フォーマット**:

```
### RFC設計グラフ構造探索コマンド

グラフファイル: RFC-GRAPHIFY-GRAPH.json

チケットに統合されたノード:
- N0001 (認証API定義) → `node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0001 --hops=3`
- N0003 (トークン検証ロジック) → `node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0003 --hops=3`
- N0005 (セッション管理) → `node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0005 --hops=3`
```

グラフファイルが存在しない場合：

```
### RFC設計グラフ構造探索コマンド

グラフファイルがありません。/graphify-rfc を先に実行してグラフを生成してください。
```

#### 3.9.3 make/plan/start/review での確認ステップ

各フェーズのテンプレートに以下のサブステップを追加する。これにより、グラフが存在する場合は常にグラフ探索による設計理解を経てから実装に入る。

```
### グラフ探索（RFC設計グラフ構造探索コマンド）

spec 内の「RFC設計グラフ構造探索コマンド」セクションに記載された query.js コマンドを
実行し、対象チケットのグラフ上の位置と依存関係を確認する。
- 全ノード一覧: crud.js list-nodes --graph=<graph-path>
- 起点ノードからの探索: query.js --graph=<graph-path> --source=<rfc-path> --id=<nodeId> --hops=3
```

グラフが存在しない場合（`dump-ticket-graph-commands.js` が「グラフファイルがありません」と記載した場合）は、このサブステップをスキップする。

### 3.10 .gitignore パターン

自動生成される以下のファイルは git 管理対象外とするため、`tools/conver/.gitignore` に追記する：

```
# graphify-rfc 成果物
*GRAPH.json
*GRAPHIFY-Status.json
```

### 3.11 再実行ポリシー

`/graphify-rfc` をソース文書に対して複数回実行した場合の挙動：

- GRAPHIFY-Status.json が存在する場合：**最初から再実行する**（新規実行と同様）。グラフファイルは上書きされる。
- 理由：ソース文書が編集されている可能性があり、前回の分割判断が現在の文書と一致するとは限らないため。
- マーカーは冪等に挿入される（既存マーカーは変更されず、不足分のみ追加）。したがって再実行による副作用は最小限に留まる。

## Implementation

### 4.1 crud.js — グラフの唯一の書き込み経路

全操作は書き込み前に3章のJSON Schemaで検証し、違反時は非ゼロ終了＋スキーマ検証エラー詳細をstderrに出力する。グラフファイルは変更しない。`create-edges`実行時、`from`/`to`が既存ノードIDとして存在しない場合はエラーとする。

```javascript
// crud.js create-nodes の擬似実装（検証＋アトミック書き込み）
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const newNodes = JSON.parse(fs.readFileSync(nodesFilePath, 'utf8'));

for (const node of newNodes) {
  const { valid, errors } = validateAgainstSchema(node, nodeSchema);
  if (!valid) {
    console.error(`[ERROR] ノード ${node.id} がスキーマ検証に失敗しました。`);
    console.error(`原因: ${errors.join('; ')}`);
    console.error(`対応: 指定されたノードJSONをスキーマに従って修正し、再実行してください。`);
    process.exit(1);
  }
  if (graph.nodes.find(n => n.id === node.id)) {
    console.error(`[ERROR] ノード ID ${node.id} は既に存在します。`);
    console.error(`原因: ID の重複。`);
    console.error(`対応: update-node を使用するか、重しない ID を割り当ててください。`);
    process.exit(1);
  }
  graph.nodes.push(node);
}

atomicWrite(graphPath, graph);
console.log(JSON.stringify({ ok: true, created: newNodes.map(n => n.id) }));
```

### 4.2 verify.js — カバレッジ・孤立ノード検証

空行のみをカバレッジ対象外とする。空行以外の全行がいずれかのノードの sourceRanges に含まれていることを検証する。また、全ノードが最低1本のエッジを持つことを検証する。

```javascript
function checkCoverage(sourceLines, nodes) {
  const covered = new Set();
  for (const n of nodes)
    for (const r of n.sourceRanges)
      for (let i = r.startLine; i <= r.endLine; i++)
        covered.add(i);

  return sourceLines
    .map((text, idx) => ({ line: idx + 1, text }))
    .filter(l => l.text.trim() !== '' && !covered.has(l.line));
}

function checkIsolated(nodes, edges) {
  const connected = new Set(edges.flatMap(e => [e.from, e.to]));
  return nodes.map(n => n.id).filter(id => !connected.has(id));
}
```

**出力契約**: 未カバー行0件かつ孤立ノード0件 → `{"ok":true}` を終了コード0で出力。それ以外は未カバー行と孤立ノードを列挙し `{"ok":false,...}` を終了コード1で出力。同時に自然言語のエラーメッセージも3段テンプレートでstderrに出力する。

### 4.3 embed-markers.js — マーカー埋め込み（冪等）

`[::REF<N>-START::]` / `[::REF<N>-END::]` 形式のマーカーをソース文書に埋め込む。番号は3桁以上のゼロ埋め（REF001, REF042, REF999 等）、上限なし。同一 `refId` が複数の `sourceRanges` エントリから参照される場合でもマーカーは1回のみ挿入する。異なる `refId` が同一範囲を指す場合は両方のマーカーを挿入する（範囲が重複する）。

```javascript
function embedAll(sourceLines, nodes) {
  const existingRefs = extractExistingRefIds(sourceLines);

  for (const node of nodes) {
    for (const range of node.sourceRanges) {
      if (existingRefs.has(range.refId)) continue;

      // マーカー挿入位置に既存マーカーがないことを確認
      const startLine = range.startLine - 1;
      const endLine = range.endLine - 1;

      sourceLines[startLine] =
        `[::${range.refId}-START::] ${sourceLines[startLine]}`;
      sourceLines[endLine] =
        `[::${range.refId}-END::] ${sourceLines[endLine]}`;
    }
  }
  return sourceLines;
}
```

### 4.4 query.js — マルチホップ検索

```javascript
function multiHopBFS(graph, startNodeId, hops) {
  const visited = new Map([[startNodeId, 0]]);
  const queue = [startNodeId];
  const resultEdges = [];

  while (queue.length) {
    const current = queue.shift();
    const depth = visited.get(current);
    if (depth >= hops) continue;

    for (const edge of graph.edges) {
      const neighbor = edge.from === current ? edge.to
                      : edge.to === current ? edge.from
                      : null;
      if (!neighbor) continue;
      resultEdges.push(edge);
      if (!visited.has(neighbor)) {
        visited.set(neighbor, depth + 1);
        queue.push(neighbor);
      }
    }
  }
  return { nodeIds: [...visited.keys()], edges: resultEdges };
}
```

**実行時行番号の再計算（文書編集耐性の核心）**:

```javascript
function resolveCurrentLines(sourceText, refId) {
  const lines = sourceText.split('\n');
  const ranges = [];
  let start = null;
  lines.forEach((line, i) => {
    if (line.includes(`::${refId}-START::`)) start = i + 1;
    if (line.includes(`::${refId}-END::`) && start !== null) {
      ranges.push({ startLine: start, endLine: i + 1 });
      start = null;
    }
  });
  return ranges;
}
```

マーカーが見つからない `refId` についてはエラーメッセージをstderrに出力しつつ、見つかったノードのみで結果を構成する。終了コードは0。

**出力フォーマット**:

```markdown
## N0001: 認証API定義

**種別**: api_contract | **参照**: REF001 (現在 L42-L58)

RESTful API によるユーザー認証のエンドポイント定義。
POST /api/v1/auth/login および POST /api/v1/auth/refresh を含む。

### 関係 (depends_on / hard)
- depends_on → N0003 (トークン検証ロジック) [hard]
```

### 4.5 update-step-status.js — GRAPHIFY-Status.json 管理

```javascript
const subcommand = process.argv[3];
const statusPath = process.argv[2]; // --graphify-status=<path> の値

let status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

switch (subcommand) {
  case 'start-step': {
    const n = parseInt(process.argv[4]);
    status.steps[n] = 'running';
    status.currentStep = n;
    break;
  }
  case 'end-step': {
    const n = parseInt(process.argv[4]);
    status.steps[n] = 'done';
    status.currentStep = n + 1;
    break;
  }
  case 'fail-step': {
    const n = parseInt(process.argv[4]);
    status.steps[n] = 'error';
    // currentStep は変更しない
    break;
  }
  case 'reset-to-step': {
    const n = parseInt(process.argv[4]);
    for (let i = n + 1; i <= 5; i++) status.steps[i] = 'pending';
    status.currentStep = n;
    break;
  }
  case 'status': {
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }
  default:
    console.error('[ERROR] 未知のサブコマンドです。');
    console.error('原因: 指定されたサブコマンドが start-step / end-step / fail-step / reset-to-step / status のいずれでもありません。');
    console.error('対応: 上記5種のいずれかを指定してください。');
    process.exit(1);
}

atomicWrite(statusPath, status);
```

### 4.6 graphify-rfc.md — スラッシュコマンド

```markdown
---
argument-hint: <source-file-path>
allowed-tools: Read, Write, Bash
description: 長大Markdown文書をマルチホップグラフ検索可能な構造へ変換する
---

# 対象ファイル: $1

以下のStepを順に実行する。各Stepは `<source-dir>/<basename>-GRAPHIFY-Status.json`
で管理され、スクリプト呼び出しの前後で update-step-status.js により更新される。

導出パス:
- graphPath="$(dirname "$1")/$(basename "$1" .md)-GRAPH.json"
- statusPath="$(dirname "$1")/$(basename "$1" .md)-GRAPHIFY-Status.json"

## Step 1: ノード分割
ソース文書の全行を読み込み、3軸（セクション階層＋kind＋外部依存の有無）で
意味的I/O境界を特定しノードに分割する。各ノードは1つのkindのみを持つ。
100行超のセクションは必ず複数ノードに分割する。
graphify は formulate よりも常に細かい粒度で分割する（発散）ことを徹底する。

1. update-step-status.js --graphify-status="$statusPath" start-step 1
2. ノードJSONを一時ファイルに書き、crud.js create-nodes で投入
3. update-step-status.js --graphify-status="$statusPath" end-step 1

## Step 2: エッジ付与
12種のエッジタイプから適切な関係を選択し、全ノードが最低1本のエッジを
持つようにする。孤立ノードが発生しないことを確認する。

1. update-step-status.js --graphify-status="$statusPath" start-step 2
2. エッジJSONを一時ファイルに書き、crud.js create-edges で投入
3. update-step-status.js --graphify-status="$statusPath" end-step 2

## Step 3: 機械検証
verify.js で未カバー行と孤立ノードをチェックする。
- 未カバー行が報告された場合: reset-to-step 1 でStep 1に戻り修正
- 孤立ノードが報告された場合: reset-to-step 2 でStep 2に戻り修正
- {"ok":true} が返るまで繰り返す

1. update-step-status.js --graphify-status="$statusPath" start-step 3
2. verify.js --graph="$graphPath" --source="$1"
3. update-step-status.js --graphify-status="$statusPath" end-step 3

## Step 4: マーカー埋め込み
embed-markers.js でソース文書に REF マーカーを埋め込む。このスクリプトは
冪等であるため再実行しても安全。エラー時は fail-step で記録して終了。

1. update-step-status.js --graphify-status="$statusPath" start-step 4
2. embed-markers.js --graph="$graphPath" --source="$1"
3. update-step-status.js --graphify-status="$statusPath" end-step 4

## Step 5: 自己検証
グラフ内の任意のノードIDを1つ選び、マルチホップ検索が正常に動作することを確認する。
失敗した場合は原因を特定し、該当するStepに戻る。

1. update-step-status.js --graphify-status="$statusPath" start-step 5
2. query.js --graph="$graphPath" --source="$1" --id=<任意ノードID> --hops=2
3. update-step-status.js --graphify-status="$statusPath" end-step 5

## 完了報告
生成されたグラフファイルパス、ノード数、エッジ数、REF数、検証結果を報告する。
完了後、このグラフは formulate-tickets / formulate-tickets-for-next から
load-rfc-graph.js を介して利用可能になる。
```

### 4.7 テスト設計とAcceptance Criteria

`tests/rfc-graph/` にbashテストスクリプトを配置する。以下のAcceptance Criteriaを検証可能にする：

```bash
# AC1: verify.js のカバレッジ検証
cd tests/rfc-graph
# テスト用の最小RFCとグラフを作成
node -e "
  const fs = require('fs');
  fs.writeFileSync('/tmp/test-rfc.md', '# Test\n\n要件1: ログイン機能\n\n## API\n\nPOST /login\n');
"
# verify.js が未カバー行を正しく報告することを確認

# AC2: embed-markers.js の冪等性
# 2回連続実行して差分が生じないことを確認
diff <(md5sum /tmp/test-rfc.md) <(md5sum /tmp/test-rfc.md)

# AC3: query.js のマルチホップ
# --hops=1 と --hops=2 で返却ノード集合が異なることを確認

# AC4: 行挿入耐性
# ソース文書に1行挿入後、query.js が正しい新行番号を返すことを確認
```

## Appendix

### A. 改訂履歴

| 版 | 日付 | 改訂内容 |
|----|------|---------|
| 1.0 | 2026-07-06 | 初版。grill による全21ノード設計確定後に作成 |

### B. 設計判断の根拠（重要）

**graphify（発散）と formulate（収束）の関係**:
graphify で可能な限り細かい粒度のノードに分割しておけば、formulate がそれを読み取ってチケットに束ね直す際に、以下の恩恵が得られる：
1. どの設計要素がどのチケットに統合されたかが nodeIDs として追跡可能
2. チケット間の依存関係がグラフのエッジ構造から機械的に導出可能
3. 実装後に設計文書の該当箇所を query.js で即座に特定可能
4. 行番号に依存しない恒久的な参照がマーカーにより保証される

**仕様テンプレート「RFC設計グラフ構造探索コマンド」セクションの目的**:
このセクションは make（仕様策定）時に dump-ticket-graph-commands.js によって機械的に追記される。これにより：
- 各チケットがカバーする設計範囲がグラフノードIDとして明示される
- 実装着手前に query.js でグラフ探索を行うことで、設計全体の中での位置づけを理解できる
- plan/start/review の各フェーズでグラフ探索を確認ステップとして組み込むことで、設計からの逸脱を防止する

### C. スコープ外（別タスク）

以下の項目は本RFCのスコープ外とし、別タスクで対応する：
- `bulk-add-tickets.js` の `nodeIDs` フィールド対応改修
- `add-ticket.js` の `--node-ids` フラグ追加
- formulate-tickets / formulate-tickets-for-next への load-rfc-graph.js Step 追加
- formulate-tickets / formulate-tickets-for-next への dump-ticket-graph-commands.js Step 追加
- make/plan/start/review テンプレートへのグラフ探索確認サブステップ追加

### D. 関連ドキュメント

- `docs/ABOUT-GRAPHIFY-COMMAND.md` — 調査情報（本RFCの母体）
- `tools/conver/CLAUDE.md` — conver プロジェクトの設計全体マップ
- `.claude/commands/formulate-tickets.md` — チケット分解コマンド（グラフの消費者）
- `.claude/commands/formulate-tickets-for-next.md` — 次世代チケット分解コマンド（同上）


## 1. split-rfc-to-children のための参考情報 — RFC設計書が示す I/O 境界の手がかり

本セクションは、後日 `/split-rfc-to-children`（RFC分割）、`/formulate-tickets`（チケット策定）、`/formulate-tickets-for-next`（次フェーズチケット策定）を実行する際に、安全な I/O 境界や実装スコープの判断材料を得るための手がかりとして、RFC 設計書自体が自然な切断面を参考情報として示すものである。「これが正しい分割である」と決めつけるものではなく、設計の記述の中に現れる境界の候補を書き留めておくことで、実際の分割作業の一助とすることを目的とする。

### 1.1 観測された自然な I/O 境界

| ID | 境界の種類 | 切断面 | 該当セクション | 備考 |
|----|-----------|--------|-------------|------|
| B1 | 責務分離 | graphify (グラフ生成) → formulate (チケット分解) | §3.4, §3.9 | パイプラインの最上流。graphify がグラフJSONを生成し、formulate が消費する。グラフJSONが唯一のインターフェース |
| B2 | 書き込み経路 | crud.js (唯一の書き込み経路) → verify/embed/query (読み取り専用) | §4.1 | crud.js のみがグラフファイルを変更する。他スクリプトは読み取り専用。これにより書き込みの競合が原理的に発生しない |
| B3 | 判断主体 | Step 1・2 (AI判断: 分割・エッジ付与) → Step 3〜5 (機械的検証) | §3.4, §4.6 | AIが意味理解を行うフェーズと機械的処理を行うフェーズの明確な境界。Step 3 の検証結果に応じて Step 1・2 に戻るループが存在 |
| B4 | データ vs ロジック | schema/ (JSON Schema) → scripts/ (実行ロジック) | §3.2, §3.3 | スキーマファイルは静的な宣言であり、スクリプトの実行には依存しない。独立したバリデーションが可能 |
| B5 | 直交関心 | update-step-status.js (進行管理) → crud/verify/embed/query (コア機能) | §3.5, §4.5 | 進行管理は全スクリプトから子プロセス経由で呼ばれる直交関心。独立したテストと変更が可能 |

### 1.2 境界の属性

| ID | 同期/非同期 | データ形式 | 分割後の結合手段 | テスト独立性 |
|----|-----------|----------|---------------|------------|
| B1 | 非同期（ファイル経由） | JSON（graph.json） | load-rfc-graph.js がグラフファイルを読み込んで結合 | 完全独立（graphify のテストと formulate のテストは分離可能） |
| B2 | 同期（同プロセス内） | JSON（graph.json のメモリ表現） | crud.js がグラフファイルを読み書き、他スクリプトは読み取り専用 | crud.js 単体テストは独立。他スクリプトは crud.js で作成したグラフが必要 |
| B3 | 同期（Step間の待機） | JSON（GRAPHIFY-Status.json + graph.json） | update-step-status.js が Step 進行を管理、reset-to-step で統合 | verify.js のテストは独立した最小グラフで実施可能 |
| B4 | 同期（起動時） | JSON Schema（.schema.json） | crud.js が書き込み前にスキーマ検証を呼び出す | 完全独立（スキーマのテストはスクリプトのテストと分離可能） |
| B5 | 同期（子プロセス） | JSON（GRAPHIFY-Status.json） | 各スクリプトが終了直前に update-step-status.js を子プロセス呼び出し | 完全独立（update-step-status.js は単体で完全テスト可能） |

### 1.3 分割時に注意が必要な依存関係

- **crud.js への集中依存**: 全スクリプト（verify/embed/query）が crud.js が生成したグラフファイルを読み取るため、crud.js のスキーマ変更は全スクリプトに影響する。スキーマ互換性の維持が必須。
- **update-step-status.js の暗黙依存**: 各スクリプトが update-step-status.js を子プロセス呼び出しするが、この呼び出しの失敗（パス違い・権限不足）が本処理の成否に影響しないよう、update-step-status.js の呼び出しは本処理の成否とは独立したベストエフォートとすべきではない（Q14=A の設計ではエラー時も正しく記録する必要がある）。したがって update-step-status.js の可用性は全スクリプトの信頼性に直結する。
- **Step 1→Step 3→Step 1 の復帰ループ**: 未カバー行検出による Step 1 復帰時、既存のノード構造を保ったまま新しいノードを追加する必要がある。既存ノードの sourceRanges 変更が必要な場合と新規ノード追加で済む場合の判断はAIに委ねられるが、この判断の品質によってループ回数が変動する。
- **dump-ticket-graph-commands.js の前提**: Tickets.json の nodeIDs フィールドが正しく設定されていることを前提とする。nodeIDs が欠落しているチケットに対しては何も出力しない（エラーにはしない）。この暗黙のスキップ動作が整合性バグの原因にならないよう注意。

### 1.4 テスト分割への参考

| 境界 | 独立テスト可能 | 結合テストが必要 | 理由 |
|------|--------------|----------------|------|
| B1 | graphify 全体、formulate 全体 | 結合テスト（graphify→formulate パイプライン） | グラフJSONがインターフェースのため、事前に定義されたグラフJSONに対する formulate テストが可能 |
| B2 | crud.js（単体）、verify/embed/query（単体） | crud.js→verify/embed/query（構成品テスト） | verify.js のテストには crud.js で作成したグラフファイルが必要だが、テストフィクスチャとして事前生成したJSONファイルを使用すれば結合テストなしで単体テスト可能 |
| B3 | Step 1〜2（AI判断）と Step 3〜5（機械処理） | Step 3→Step 1・2 の復帰ループ全体 | Step 3（verify.js）は事前定義されたグラフに対して独立テスト可能。復帰ループのテストは結合テストで検証 |
| B4 | schema/（JSON Schema単体） | schema/→crud.js（検証統合） | スキーマファイルは独立してテスト可能（該当JSONがスキーマに適合するかのテスト）。crud.js への統合は結合テスト |
| B5 | update-step-status.js（完全独立） | 各スクリプト→update-step-status.js（子プロセス呼び出し） | update-step-status.js は単体で全サブコマンドのテストが可能。呼び出し側のテストはモックで代替可能 |

### 1.5 分割後のファイル構成（一案）

```text
# 境界 B1 で分割: graphify プロジェクトと formulate プロジェクト
# （ただし現行の tools/conver/ 単一プロジェクト運用も選択可能）

# 案1: 単一プロジェクト（現行継続）
tools/conver/
├── .claude/scripts/rfc-graph/     # graphify スクリプト（crud/verify/embed/query/update-step-status）
├── .claude/scripts/tickets/        # formulate スクリプト（load-rfc-graph/dump-ticket-graph-commands）

# 案2: 分割プロジェクト
tools/
├── graphify/                        # グラフ生成エンジン
│   └── .claude/scripts/rfc-graph/
└── conver/                          # チケット分解パイプライン
    └── .claude/scripts/tickets/

# 境界 B2 で分割: crud.js のみ独立リポジトリ化
# （他スクリプトからの依存が強いため、同じリポジトリに留めるのが現実的）

# 境界 B5 で分割: update-step-status.js を独立ユーティリティとして外出し
.claude/scripts/step-status/         # 汎用Step進行管理ツール
└── update-step-status.js
```

### 1.6 参考: 本セクションの目的と限界

- 本セクションは RFC の設計記述から**事後的に観測された**境界を書き留めたものであり、境界を**事前に設計した**ものではない。
- 実際の分割判断は、実装が進みコードとテストが蓄積された後、`/split-rfc-to-children` 実行時に行う。
- ここに書かれた境界の候補は参考情報であり、分割時に新たな発見があればそちらを優先してよい。
