# RFC: `/graphify-rfc` — 長大Markdown文書のマルチホップグラフ検索可能化コマンド

## Status
Draft — 実装対象: Claude Code カスタムスラッシュコマンド1個 + バックエンドNode.jsスクリプト群

## 0. Abstract
本RFCは、任意の長大なMarkdown設計文書(以下「ソース文書」)を、I/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化し、行番号変化に強い方式でソース文書内の該当箇所を参照・検索可能にする単一のスラッシュコマンド `/graphify-rfc` を定義する。コマンドはClaude Codeの `.claude/commands/*.md` 形式で実装し、フロントマターとBashツール許可を用いる。 [zenn](https://zenn.dev/kterui9019/articles/001e146d4f0a61)

## 1. Motivation
長大な設計文書は、全文をコンテキストに載せずに必要な断片だけを機械的に取得できる必要がある。行番号ベースの参照は文書編集によって容易に破損するため、恒久的なマーカー方式とグラフ構造による関係性の明示が必要となる。AIの判断(意味理解・分割・分類)が必要な工程と、機械的に確定できる工程(スキーマ検証・行番号再計算・マーカー挿入・グラフ探索)を厳密に分離し、後者は一切AIの推論に委ねずスクリプトのみで実行することを目的とする。

## 2. Terminology

| 用語 | 定義 |
|---|---|
| ノード (Node) | ソース文書中の意味的に一貫したI/O境界単位を表す最小情報単位 |
| エッジ (Edge) | 2ノード間の事前定義された関係 |
| REF | ノードのソース範囲を一意に識別する番号(`REF001`など) |
| マーカー | ソース文書に埋め込む恒久的な範囲区切り文字列 |
| ホップ (Hop) | グラフ探索において起点ノードからのエッジ経由回数 |

## 3. Architecture Overview

```
.claude/commands/
  graphify-rfc.md            # 唯一のスラッシュコマンド

<project-root>/
  scripts/rfc-graph/
    schema/
      node.schema.json
      edge.schema.json
      graph.schema.json
    crud.js                  # グラフのCRUD + スキーマ検証(唯一の書き込み経路)
    verify.js                # カバレッジ/孤立ノード検証
    embed-markers.js         # マーカー書き込み(冪等)
    query.js                 # マルチホップ検索 + Markdown整形出力

  <graph-output-dir>/
    <source-file-basename>.graph.json   # グラフ本体(唯一の正データ)
```

グラフ本体JSONへの書き込みは常に `crud.js` を経由し、直接編集は禁止する。これにより、スキーマ違反状態のグラフが生成されることを構造的に防止する。

## 4. データモデル(厳格スキーマ)

### 4.1 ノードスキーマ

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "node.schema.json",
  "type": "object",
  "required": ["id", "title", "kind", "summary", "sourceRanges"],
  "additionalProperties": false,
  "properties": {
    "id": { "type": "string", "pattern": "^N[0-9]{4}$" },
    "title": { "type": "string", "minLength": 1, "maxLength": 120 },
    "kind": {
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

`startLine`/`endLine`は**初回分割時点の記録値**であり、マーカー埋め込み後の唯一の真実ではない(4.4節参照)。

### 4.2 エッジスキーマ(属性つき、種別は事前定義12種で固定)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "edge.schema.json",
  "type": "object",
  "required": ["from", "to", "type", "attributes"],
  "additionalProperties": false,
  "properties": {
    "from": { "type": "string", "pattern": "^N[0-9]{4}$" },
    "to": { "type": "string", "pattern": "^N[0-9]{4}$" },
    "type": {
      "enum": [
        "depends_on", "implements", "refines", "conflicts_with",
        "triggers", "constrains", "supersedes", "references",
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
|---|---|
| depends_on | 前提仕様への依存 |
| implements | 抽象要件の具体実装 |
| refines | 詳細化・補足 |
| conflicts_with | 相互矛盾・排他 |
| triggers | イベント/遷移の誘発 |
| constrains | 制約を課す |
| supersedes | 旧仕様の置換 |
| references | 単純参照 |
| part_of | 包含・親子関係 |
| validates | 検証・テスト関係 |

### 4.3 グラフ全体スキーマ

```json
{
  "$id": "graph.schema.json",
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

### 4.4 行番号の位置づけ
`sourceRanges`の`startLine`/`endLine`はマーカー埋め込み前の一時的な座標にすぎない。マーカー埋め込み後は、`refId`に対応する実際の行番号は**都度ソース文書をスキャンして再計算**する(7.2節)。これにより文書編集後も参照が破損しない。

## 5. CLIツール仕様

### 5.1 `crud.js` — グラフの唯一の書き込み経路

```
node crud.js create-nodes  --graph=<path> --file=<nodes.json>
node crud.js create-edges  --graph=<path> --file=<edges.json>
node crud.js list-nodes    --graph=<path>
node crud.js get-node      --graph=<path> --id=<nodeId>
node crud.js update-node   --graph=<path> --id=<nodeId> --file=<patch.json>
node crud.js delete-node   --graph=<path> --id=<nodeId>
```

**契約**:
- 全操作は書き込み前に4章のJSON Schemaで検証し、違反時は非ゼロ終了+検証エラー詳細をstderrへ出力、グラフファイルは変更しない(全体をアトミックに書き換える、部分書き込み禁止)。
- `create-edges`実行時、`from`/`to`が既存ノードIDとして存在しない場合はエラー。
- 出力は常に構造化JSON(成功時 `{"ok": true, "created": [...]}`)。AIはこの出力を解釈するだけでよく、スキーマ検証ロジック自体を推論する必要はない。

### 5.2 `verify.js` — カバレッジ・孤立ノード検証(完全に機械的)

```
node verify.js --graph=<path> --source=<source-file> --check-coverage --check-isolated
```

**アルゴリズム(擬似コード、AIの判断不要)**:

```javascript
function checkCoverage(sourceLines, nodes) {
  const covered = new Set();
  for (const n of nodes)
    for (const r of n.sourceRanges)
      for (let i = r.startLine; i <= r.endLine; i++) covered.add(i);
  return sourceLines
    .map((text, idx) => ({ line: idx + 1, text }))
    .filter(l => l.text.trim() !== "" && !covered.has(l.line));
}

function checkIsolated(nodes, edges) {
  const connected = new Set(edges.flatMap(e => [e.from, e.to]));
  return nodes.map(n => n.id).filter(id => !connected.has(id));
}
```

**出力契約**: 未カバー行が0件かつ孤立ノードが0件のとき `{"ok": true}` を終了コード0で出力。それ以外は `{"ok": false, "uncoveredLines": [...], "isolatedNodes": [...]}` を終了コード1で出力する。この出力の解釈と修正判断のみがAIの仕事であり、検出ロジック自体はAIが再実装・再判断する必要はない。

### 5.3 `embed-markers.js` — マーカー書き込み(冪等、機械的)

```
node embed-markers.js --graph=<path> --source=<source-file>
```

**マーカー形式**: `[::REF<番号>-START::]` / `[::REF<番号>-END::]`(番号は3桁以上のゼロ埋め、上限なし)。

**冪等性アルゴリズム**:

```javascript
function embedAll(sourceLines, nodes) {
  const existingRefs = extractExistingRefIds(sourceLines); // 既存マーカーをスキャン
  for (const node of nodes) {
    for (const range of node.sourceRanges) {
      if (existingRefs.has(range.refId)) continue; // 重複挿入を安全に回避
      insertMarkerPair(sourceLines, range);
    }
  }
}
```

同一`refId`が複数の`sourceRanges`エントリから参照される場合(=同一箇所を複数ノードが参照する場合)でも、マーカーは1回だけ挿入され、以後の`query.js`は同じ`refId`を複数ノードから安全に参照できる。**このスクリプトはソース文書の内容確定後、グラフ確定後に一度だけ実行される**。実行後、AIは行番号を二度と参照してはならない。

### 5.4 `query.js` — マルチホップ検索(機械的、AI判断不要)

```
node query.js --graph=<path> --source=<source-file> --id=<REF番号 or ノードID> --hops=<N>
```

**マルチホップ探索(幅優先探索、完全に決定的)**:

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

**実行時行番号の再計算(文書編集耐性の核心)**:

```javascript
function resolveCurrentLines(sourceText, refId) {
  const lines = sourceText.split("\n");
  const ranges = [];
  let start = null;
  lines.forEach((line, i) => {
    if (line.includes(`::${refId}-START::`)) start = i + 1;
    if (line.includes(`::${refId}-END::`) && start !== null) {
      ranges.push({ startLine: start, endLine: i + 1 });
      start = null;
    }
  });
  return ranges; // マーカー間の現在の実行時行番号
}
```

**出力契約**: 整然としたMarkdown(下記フォーマット)を標準出力する。

```markdown
## <ノードID>: <タイトル>

**種別**: <kind> | **参照**: <refId> (現在 L<startLine>-L<endLine>)

<summary>

### 関係 (<エッジタイプ> / strength)
- <edgeType> → <対象ノードID> (<対象タイトル>) [<strength>]
```

この整形処理は完全にテンプレート的であり、AIの文章生成能力を必要としない。

## 6. 責務の分離: 機械的処理 vs AI判断

本RFCの核心方針として、以下のように厳密に切り分ける。

| フェーズ | AIが判断すること(非決定的) | スクリプトが行うこと(決定的、AI介在禁止) |
|---|---|---|
| 分割 | 意味的I/O境界の見極め、`kind`分類、`title`/`summary`作成 | JSON Schema検証、グラフファイルへの書き込み |
| エッジ付与 | どのノード間にどの関係タイプが成立するかの判断 | 12種以外のタイプ拒否、`from`/`to`存在確認 |
| 検証 | 検証結果の解釈と、どう修正するかの判断 | 未カバー行検出、孤立ノード検出(アルゴリズム固定) |
| マーカー埋込 | なし(判断不要) | 冪等挿入、重複回避、ファイル書き換え |
| 検索 | どのノードを起点にするか、ホップ数の選定 | BFS探索、行番号再計算、Markdown整形 |

AIが担うのは「意味理解」に依存する箇所のみであり、文字列操作・ファイルI/O・検証ロジック・整形出力は一切AIの生成に委ねてはならない。

## 7. `/graphify-rfc` スラッシュコマンド仕様

ファイル: `.claude/commands/graphify-rfc.md`

```markdown
---
argument-hint: [source-file-path]
allowed-tools: Read, Write, Bash
description: 長大Markdown文書をマルチホップグラフ検索可能な構造へ変換する
---
対象ファイル: $1

以下のPhaseを順に実行する。各Phaseの機械検証がOKになるまで、
そのPhaseとその前段のPhaseを繰り返す。行番号やJSON検証ロジックを
独自に再実装してはならず、常に指定スクリプトの出力のみを信頼する。

## Phase 1: ノード分割
$1 の全行を読み込み、意味的なI/O境界でノードに分割する。
各ノードには id, title, kind, summary, sourceRanges を与える。
最終的にファイルの全行(空行を除く)がいずれかのノードの
sourceRanges に含まれなければならない。
分割結果をJSON配列として一時ファイルに書き、
`node scripts/rfc-graph/crud.js create-nodes --graph=<graph-path> --file=<tmp>`
で投入する。

## Phase 2: エッジ付与
事前定義された12種のエッジタイプのみを用いて、
ノード間の関係を全て記述する。全ノードが最低1本のエッジを
持つようにする。
`node scripts/rfc-graph/crud.js create-edges --graph=<graph-path> --file=<tmp>`
で投入する。

## Phase 3: 機械検証
`node scripts/rfc-graph/verify.js --graph=<graph-path> --source=$1 --check-coverage --check-isolated`
を実行する。
- 未カバー行が報告された場合: Phase 1に戻り、該当行を含む
  ノードを追加または既存ノードのsourceRangesを拡張する
- 孤立ノードが報告された場合: Phase 2に戻り、そのノードに
  最低1本のエッジを追加する
- `{"ok": true}` が返るまで繰り返す

## Phase 4: マーカー埋め込み
`node scripts/rfc-graph/embed-markers.js --graph=<graph-path> --source=$1`
を実行する。このスクリプトは冪等であるため、再実行しても安全である。

## Phase 5: 自己検証(マルチホップ検索テスト)
グラフ内の任意のノードIDを1つ選び、
`node scripts/rfc-graph/query.js --graph=<graph-path> --source=$1 --id=<node-id> --hops=2`
を実行し、Markdown出力が生成され、2ホップ先のノードが
含まれていることを確認する。失敗した場合はPhase 1〜4の
どこに原因があるか特定し、そのPhaseに戻る。

## 完了報告
生成されたグラフファイルパス、ノード数、エッジ数、REF数、
検証結果を報告する。
```

## 8. 非機能要件・エッジケース

- 同一箇所を複数ノードが参照する場合、`embed-markers.js`は`refId`単位で重複を検出し二重挿入しない(5.3節)。
- ソース文書がPhase 4実行後に外部で編集された場合でも、`query.js`は毎回マーカーをスキャンして行番号を再計算するため、古い行番号がAIに渡ることはない(5.4節)。
- グラフ本体JSONと元文書のマーカーは非同期に存在しうるため、`query.js`はマーカーが見つからない`refId`についてはエラーを返し、AIに通知する。

## 9. Non-goals
本RFCは、ノード分割の具体的な粒度の最適値やドメイン固有の`kind`拡張については規定しない。これらは適用対象の文書ごとにAIが判断する範囲とする。

## 10. Acceptance Criteria

- `verify.js`が`{"ok": true}`を返す(カバレッジ100%、孤立ノード0)
- `embed-markers.js`を2回連続実行してもソース文書に差分が生じない(冪等性)
- `query.js --hops=1`と`--hops=2`で返却ノード集合が異なる(マルチホップが機能している)
- ソース文書の任意行に手動で1行挿入後、`query.js`が正しい新行番号を返す
