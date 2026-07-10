---
ticket_id: 78
title: "Step 5: フェーズ内ノードの安全なI/O境界チケット化パイプライン"
slug: step-5-io
status: draft
created_at: 2026-07-10
updated_at: 2026-07-10
---
# Step 5: フェーズ内ノードの安全なI/O境界チケット化パイプライン

## Summary

`split-to-tickets.md` の Step 5（第一次チケット定義）を完成させる。具体的には以下の6点を実装する：

1. `tickets-schema.json` の `ticket` 定義に `nodeIds` 配列フィールドを追加
2. `add-ticket.js` / `bulk-add-tickets.js` を改修し `nodeIds` を正しく扱えるようにする
3. `show-phase-nodes.js` を新規作成（フェーズ内全ノードの詳細を Markdown で出力）
4. `add-tickets-for-phase.js` を新規作成（チケット追加 + 過不足検証をラップ）
5. `verify-all-ticket-coverage.js` を新規作成（全フェーズの完全性を最終検証）
6. `split-to-tickets.md` の Step 5 セクションを上記スクリプト群で埋める

## Background

現在 `split-to-tickets.md` の Step 5 は空のコメントプレースホルダー（`<!-- ... -->`）しか存在しない。Step 4（`phasify` によるフェーズ設計・名前書き込み）が完了した後、各フェーズに割り当てられたノード群を安全な I/O 境界単位のチケットに分解する工程が未定義である。

一方、`query.js` は `--dirs-tree` フラグ（Dirs-Tree.json の nodeId→ファイルパス解決機能）の改修が完了しており、「ノードIDを指定すると実装先ファイルパス付きで詳細を Markdown 出力できる」状態になっている。

また、`tickets-schema.json` の `phase` 定義には既に `nodeIds` フィールドが存在するが、`ticket` 定義には存在しない。これにより「あるチケットがどのノードから構成されているか」を Tickets.json 上で追跡できない。

このギャップを埋め、設計グラフから実装チケットへのシームレスな変換パイプラインを完成させる。

## Scope

### 1. `tickets-schema.json` の改修

`#/definitions/ticket` に `nodeIds` 配列フィールドを追加する：

```json
"nodeIds": {
  "type": "array",
  "items": { "type": "string" },
  "description": "このチケットに束ねられたグラフノードIDの配列（例: [\"N0001\",\"N0003\"]）。フェーズ内の全nodeIdsが tickets[].nodeIds の和集合と一致することを検証に使う。required には含めず後方互換性を維持。"
}
```

`required` 配列には追加せず、既存チケットとの後方互換性を保つ。

### 2. `add-ticket.js` / `bulk-add-tickets.js` の改修

どちらも現在 `...clean` スプレッドで任意フィールドを素通ししているため、stdin で `nodeIds` を渡せば書き込まれる。しかし validation パスで `nodeIds` が配列であることの軽量チェックを追加する。

また、`add-ticket.js` の `validateTickets()` は現状スキーマ準拠のみをチェックしており、`nodeIds` の値の妥当性（配列要素が文字列）までは検証しない。スキーマに型定義を追加すれば `validateTickets()` 側の改修は不要。

変更点：
- `add-ticket.js`: 変更なし（`...clean` + `additionalProperties: true` で素通し可）
- `bulk-add-tickets.js`: 同上
- ただし、ラッパースクリプト（後述）で nodeIds の整合性検証を行うため、この2ファイル単体での検証追加は行わない

### 3. `show-phase-nodes.js` の新規作成

**配置先**: `.claude/scripts/rfc-graph/show-phase-nodes.js`

**目的**: `split-to-tickets` Step 5-1 でAIにフェーズ内ノードの詳細を読ませるための Markdown 出力。

**CLI引数**:

```
node .claude/scripts/rfc-graph/show-phase-nodes.js \
  --tickets=<Tickets.json のパス> \
  --graph=<GRAPH.json のパス> \
  --dirs-tree=<Dirs-Tree.json のパス> \
  --phase=<P{id} または PX>
```

**出力フォーマット**（stdout）:

```markdown
# Phase P{n}: {phase.name}

{phase.summary}

---
## ノード一覧

以下の {N} 個のノードがこのフェーズに割り当てられています。
各ノードは graphify-rfc によって安全な I/O 境界として策定されています。
ノード同士の組み合わせもまた安全な I/O 境界になりやすい性質を持ちます。
チケットとは、1回の実装で安全に行えるノードの組み合わせです。
1つ以上のノードを束ねてチケット単位を構成してください。
全ノードを重複なく、過不足なくチケット化しなければなりません。
---

### N0001: {node.title}

**種別**: {node.kind}

{node.summary}

**実装先ファイルパス**:
```
{path/to/file.rs}
```

---

### N0002: {node.title}
...
```

**各ノード間に `---` 区切り線を入れ**、どこからどこまでが1ノードかを明示する。

**実装詳細**:
- `Tickets.json` から指定フェーズの `nodeIds` を取得
- 各 `nodeId` に対して `query.js --graph=<path> --source=<source> --dirs-tree=<path> --id=<nodeId> --hops=0` を **子プロセス (`child_process.execFileSync`) で逐次実行** する。`--hops=0` とするのはノード単体の詳細だけが必要で、周辺ノードの探索は不要なため
- フェーズのヘッダー情報（name, summary）を先頭に出力
- ノードの前後に `---` 区切りで境界を明示
- ノードが安全な I/O 境界である旨の注釈をフッターとして出力
- stdout の先頭に全量を出力。エラー時は stderr にメッセージを書き exit 1

**エラーハンドリング**:
- `--tickets` 未指定 → stderr にエラーメッセージ + exit 1
- `--graph` 未指定 → stderr にエラーメッセージ + exit 1
- `--dirs-tree` 未指定 → stderr にエラーメッセージ + exit 1
- `--phase` 未指定 → stderr にエラーメッセージ + exit 1
- 指定フェーズに `nodeIds` がない → stderr に「このフェーズにはノードが割り当てられていません」 + exit 1
- 子プロセスの query.js が失敗 → そのノードはスキップして stderr に警告、全体は exit 1 で終了

### 4. `add-tickets-for-phase.js` の新規作成（ラッパー + 過不足検証）

**配置先**: `.claude/scripts/tickets/add-tickets-for-phase.js`

**目的**: `add-ticket.js` / `bulk-add-tickets.js` をラップし、チケット追加後に「当該フェーズの全 `nodeIds` が `tickets[].nodeIds` の和集合と一致するか」を検証する。検証が通らなければ exit 1 で失敗し次のフェーズに進ませない。

**CLI引数**:

```
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js \
  <Tickets.json のパス> \
  <P{id} または PX>
```

**stdin 入力形式**: `bulk-add-tickets.js` と同じ配列形式。各チケットに `nodeIds` 配列を含める：

```json
[
  {
    "title": "認証トークン生成",
    "nodeIds": ["N0001", "N0003"]
  },
  {
    "title": "トークン検証処理",
    "nodeIds": ["N0002"]
  }
]
```

**処理フロー**:

1. stdin からチケット配列をパース
2. 各チケットデータの `nodeIds` が配列であり空でないことを検証（不正なら exit 1）
3. `bulk-add-tickets.js` のロジックを直接呼び出してチケットを追加（注: モジュールとしての `bulk-add-tickets.js` の関数は現在 `main()` のみ公開。必要に応じて内部関数化を検討）
4. 追加後、当該フェーズの `nodeIds` 全要素と、全 `tickets[].nodeIds` の和集合を比較：
   - フェーズの `nodeIds` に含まれるノードID が `tickets[].nodeIds` の和集合にすべて含まれる → OK
   - 不足がある → stderr に不足しているノードID一覧を出力し exit 1
   - `tickets[].nodeIds` にフェーズ外のノードIDが含まれる → stderr に警告（exit は 0 でも可、ただし stderr で通知）
5. 成功時は stdout に追加結果のサマリー JSON を出力
6. 書き込み後に `validateTickets()` でスキーマ検証

**エラーハンドリング**:
- stdin パース失敗 → stderr にメッセージ + exit 1
- `nodeIds` 未指定のチケットがある → stderr に指摘 + exit 1
- 過不足検証失敗 → stderr に「不足ノード: [N0004, N0005]」 + exit 1
- フェーズ未存在 → stderr にメッセージ + exit 1
- スキーマ検証失敗 → stderr に検証エラー詳細 + exit 1

**bulk-add-tickets.js との統合方法**:

```js
// add-ticket.js / bulk-add-tickets.js を require して内部ロジックを呼び出す
const { bulkAddTickets } = require('./bulk-add-tickets.js');
// または直接同等のロジックを実装（関数が公開されていない場合）
```

現状 `bulk-add-tickets.js` は `main` 関数のみを `module.exports` している。本チケットで `bulkAddTickets(data, batch)` のような内部関数を追加で `export` する改修も含める。`add-ticket.js` も同様に `addTicket(data, phaseArg, ticketData)` を export する改修を行う。

### 5. `verify-all-ticket-coverage.js` の新規作成

**配置先**: `.claude/scripts/tickets/verify-all-ticket-coverage.js`

**目的**: 全フェーズのチケット化が完了したことを最終検証。`split-to-tickets` Step 5 全フェーズ完了後に実行する。

**CLI引数**:

```
node .claude/scripts/tickets/verify-all-ticket-coverage.js <Tickets.json のパス>
```

**検証内容**:
1. 全フェーズに `tickets` 配列が存在し、空でない
2. 全フェーズについて、`phase.nodeIds` の全要素が `phase.tickets[].nodeIds` の和集合に含まれる（過不足なし）
3. `tickets[].ticket.nodeIds` にフェーズ外のノードIDが含まれていない（混入チェック）

**出力**:
- 全検証OK → stdout に《✅ PASS》+ 簡単なサマリー（全フェーズ数、全チケット数、全ノードIDカバー率）
- 検証NG → stderr に《❌ FAIL》+ 問題のあるフェーズID一覧 + 不足ノードID一覧 + 混入ノードID一覧 + exit 1

### 6. `split-to-tickets.md` の Step 5 セクション完成

現在の `### Step 5: 第一次チケット定義`（L207-211）を、上記スクリプト群を使用した完全な手順に書き換える。

**旧内容**（L207-211）:
```markdown
### Step 5: 第一次チケット定義

<!--
グルーピングされたノードで構成された各フェーズ内で、関連していて連続した実装が安全で合理的であると判断されるノードを束ねることでチケットを構成していく。全チケットは安全な I/O 境界を持つ単位でなければならない。
-->
```

**新内容の骨格**（後述の Writing セクションで詳細を記述）:

```
### Step 5: 第一次チケット定義

全フェーズに対して、以下の 5-1 → 5-2 を1フェーズずつ逐次実行する。

#### 5-1: フェーズ内ノードの詳細取得（show-phase-nodes.js）

```bash
node .claude/scripts/rfc-graph/show-phase-nodes.js \
  --tickets="$TICKETS_PATH" \
  --graph="$GRAPH_PATH" \
  --dirs-tree="$DIRS_TREE_PATH" \
  --phase="P{n}"
```

出力例の提示（ノードのI/O境界性、組み合わせの安全性の注釈を含む）。

#### 5-2: チケット化（add-tickets-for-phase.js）

AI が 5-1 の出力を読み、1回の実装で安全に行えるノードの組み合わせを判断しチケットを定義する。各チケットは `nodeIds` を持ち、当該フェーズの全 `nodeIds` を過不足なくカバーしなければならない。

```bash
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js \
  "$TICKETS_PATH" \
  "P{n}"
```

5-1 → 5-2 が完了したら次のフェーズ（P1, P2, ...）に進む。

全フェーズ終了後、以下のスクリプトで全フェーズのチケット化が完了していることを確認する。不合格の場合は全てのフェーズが完了するまで Step 6 への進行を禁止する。

```bash
node .claude/scripts/tickets/verify-all-ticket-coverage.js "$TICKETS_PATH"
```
```

**Boy Scout: 旧Step 5-8の重複セクション削除**:
`split-to-tickets.md` の L219-L286 には旧バージョンの Step 5, Step 7, Step 8 の内容が残存している。これらは新しい Step 1-7 構成の前に存在した旧パイプラインの残骸であり、現在の構成と重複・矛盾する。本チケットで削除する。

## Non-scope

- `query.js` の改修は含まない（既に完了済み）
- Dirs-Tree.json のスキーマ変更は含まない
- `phasify` 関連スクリプトの改修は含まない
- `add-ticket.js` / `bulk-add-tickets.js` の根本的なアーキテクチャ変更は含まない（必要最小限の改修のみ）
- テストフレームワークの選択・新規導入は含まない（既存の `tests/` パターンに従う）

## Investigation

### 証拠1: `tickets-schema.json` の現状

`#/definitions/ticket` に `nodeIds` フィールドが存在しない。
一方、`#/definitions/phase` には既に `nodeIds` と `summary` が存在する（`required` には含まれず後方互換性を維持）。

ファイル: `tools/conver/.claude/scripts/tickets/tickets-schema.json`
- phase.nodeIds: L44-L48 （配列、型 `string`、description に「phasify で自動設定」）
- ticket: L55-L90 （`required: ["id", "phaseId", "title", "status"]`、`additionalProperties: true`）

### 証拠2: `query.js --dirs-tree` の出力形式

`query.js` に `--dirs-tree` を指定すると、各ノードの出力末尾に `### 実装先となるファイルパス` セクションが追加される。nodeId からファイルパスへの解決は `validate-phasify.js` の `buildNodeToDirMap()` が担当する。

- query.js L454-L464: nodeToDirMap[node.id] があればファイルパス表示
- validate-phasify.js L56-L75: buildNodeToDirMap — Dirs-Tree.json の trees を再帰的に走査し mappedNodeIds から nodeId→path マップを構築

### 証拠3: `add-ticket.js` の出力形式

- stdin から受け取った JSON を `...clean` でスプレッドしているため、nodeIds を渡せば書き込まれる
- ただし validation で nodeIds の正当性はチェックされない（`validateTickets()` はスキーマ準拠のみ、`additionalProperties: true` のため何でも通る）
- `module.exports = { main }` — main 関数のみ公開。内部関数がなく、ラッパーからの再利用が困難

### 証拠4: `bulk-add-tickets.js` の出力形式

- add-ticket.js と同様、`...b.tickets[i]` で素通し
- `module.exports = { main }` — main 関数のみ公開

### 証拠5: `split-to-tickets.md` の現状

- L207-L211: Step 5 は <!-- コメント --> のみで空
- L213-L215: Step 6, Step 7 もヘッダーのみで空
- L217: `---` 区切り
- L219-L286: 旧バージョンの Step 5-8 が残存（重複・矛盾）
- 現状は Step 4 までが定義され、その後が未完成

### 証拠6: 現状の Tickets.json の nodeIds 保有状況

`phasify` がまだ完了していないため、現状の Tickets.json の全フェーズに `nodeIds` は存在しない。Step 4（phasify）完了後に初めて `nodeIds` が各フェーズに書き込まれる。したがって、本チケットのスクリプト群は `nodeIds` が存在しないフェーズを適切にエラーハンドリングする必要がある。

### 証拠7: テストパターン

テストは `tests/rfc-graph/` 配下に `.test.cjs` ファイルとして配置。テストランナーは `node tests/run-all.js` または個別実行 `node tests/rfc-graph/<name>.test.cjs`。

既存テストパターン例:
- `boundify-helpers.test.cjs`: CommonJS、`require()`、`describe/it` 相当の構造化テスト
- `dump-ticket-graph-commands.test.cjs`: 子プロセス実行をテスト

## Test Plan

### ユニットテスト計画

| # | 対象 | テスト内容 | 正常系 | 異常系 |
|---|------|-----------|--------|--------|
| 1 | `show-phase-nodes.js` | CLI引数未指定時のエラー出力 | - | 各引数欠損でexit 1 + stderr |
| 2 | `show-phase-nodes.js` | 存在しないフェーズ指定時のエラー | - | exit 1 + stderr |
| 3 | `show-phase-nodes.js` | nodeIds がないフェーズのエラー | - | exit 1 + stderr |
| 4 | `show-phase-nodes.js` | query.js 子プロセス失敗時のエラー | - | exit 1 + stderr警告 |
| 5 | `add-tickets-for-phase.js` | stdin パース失敗 | - | exit 1 + stderr |
| 6 | `add-tickets-for-phase.js` | nodeIds 未指定チケットの拒否 | - | exit 1 + stderr |
| 7 | `add-tickets-for-phase.js` | 過不足検証（不足あり） | - | exit 1 + 不足ノード一覧 |
| 8 | `add-tickets-for-phase.js` | 過不足検証（完全一致） | 正常終了 |
| 9 | `verify-all-ticket-coverage.js` | 全フェーズ完全カバー | PASS出力 |
| 10 | `verify-all-ticket-coverage.js` | 不足フェーズあり | - | exit 1 + 詳細 |
| 11 | `tickets-schema.json` | nodeIds 追加後のスキーマ検証通過 | 既存チケットが全て通過 |

テストは `tests/rfc-graph/` 配下に `step5-phase-nodes.test.cjs` および `step5-add-tickets-coverage.test.cjs` として作成する。

### ユニットテスト不可能な項目（例外）

- `query.js` の子プロセス呼び出し: 実際のファイルシステムアクセスが必要だが、モックの子プロセスでテスト可能
- Dirs-Tree.json の解決: 実際の JSON ファイルが必要だが、テスト用フィクスチャで対応可能

## Boy Scout Rule — 翻訳可能性計画

### 改善対象: `split-to-tickets.md` の重複セクション

旧 Step 5-8（L219-L286）が残存している。これを削除し、ドキュメントをクリーンな状態にする。

### 改善対象: `add-ticket.js` / `bulk-add-tickets.js` の再利用性

現在 `module.exports = { main }` のみで、内部関数が export されていない。本チケットで `addTicket()` / `bulkAddTickets()` 関数を export する改修を含め、ラッパースクリプトから呼び出せるようにする。関数名は動詞句（`addTicket`, `bulkAddTickets`）とし、翻訳可能性を確保する。

### 新規コードの翻訳可能性方針

- `show-phase-nodes.js`: 関数名は動詞句（`showPhaseNodes`, `getPhaseById`, `formatNodeMarkdown`）, 変数名はドメイン概念（`phase`, `nodeIds`, `nodeDetail`） 
- `add-tickets-for-phase.js`: 関数名は動詞句（`addTicketsForPhase`, `verifyNodeCoverage`, `getMissingNodeIds`）
- `verify-all-ticket-coverage.js`: 関数名は動詞句（`verifyAllTicketCoverage`, `checkPhase`, `getCoverageReport`）
- エラーは決して握りつぶさず、stderr にメッセージを書いて exit 1
- ハードコード値はすべて名前付き定数としてファイル先頭に定義

## Acceptance Criteria

- [ ] `tickets-schema.json` の `#/definitions/ticket` に `nodeIds` 配列が追加されている
- [ ] 既存チケットのスキーマ検証が通過する（後方互換性）
- [ ] `show-phase-nodes.js` が存在し、正しい引数で実行するとフェーズ内ノードの Markdown が stdout に出力される
- [ ] `show-phase-nodes.js` の出力にはノード境界（`---` 区切り）が含まれ、各ノードが安全な I/O 境界である旨の注釈が含まれる
- [ ] `show-phase-nodes.js` が不正な引数で exit 1 になる
- [ ] `add-tickets-for-phase.js` がチケットを追加し、過不足検証が通る
- [ ] `add-tickets-for-phase.js` が不足ノードを検出して exit 1 になる
- [ ] `verify-all-ticket-coverage.js` が全フェーズの完全性を検証する
- [ ] `split-to-tickets.md` の Step 5 が完全な手順として記述されている
- [ ] `split-to-tickets.md` の旧 Step 5-8 重複セクションが削除されている
- [ ] 全てのテストが通過する（`node tests/run-all.js`）
- [ ] `add-ticket.js` / `bulk-add-tickets.js` から `addTicket()` / `bulkAddTickets()` 関数が export されている

## Notes

- 本チケットは1チケットで実装する（全変更が同一目的に収束し、相互依存しているため）
- 実装順序: schema → add-ticket.js/bulk-add-tickets.js 改修 → show-phase-nodes.js → add-tickets-for-phase.js → verify-all-ticket-coverage.js → split-to-tickets.md
- `addTicketsForPhase()` は `bulk-add-tickets.js` の内部関数を直接呼び出す想定（子プロセス経由ではない）
