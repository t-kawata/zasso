---
ticket_id: 51
title: formulate連携スクリプト群＋既存コマンド改修＋Acceptance Criteriaテスト
slug: formulateacceptance-criteria
status: draft
created_at: 2026-07-06
updated_at: 2026-07-06
---
# formulate連携スクリプト群＋既存コマンド改修＋Acceptance Criteriaテスト

## Summary

graphify-rfc で生成されたグラフを formulate-tickets / formulate-tickets-for-next で利用するための連携スクリプト（load-rfc-graph.js / dump-ticket-graph-commands.js）を新規作成する。あわせて、既存コマンド（formulate-tickets.md / formulate-tickets-for-next.md / plan-ticket.md / start-ticket.md / review-ticket.md / make-ticket.md）にグラフ参照ステップを追加する。さらに、verify.js / embed-markers.js / query.js の4項目のAcceptance Criteriaを検証するテストスクリプトを作成し、P12〜P15 で実装された全基盤スクリプトの品質を確定させる。

## Background

P12〜P15 で6つの基盤スクリプト（crud.js / verify.js / embed-markers.js / query.js / update-step-status.js / schema/validate.js）とそのテストが完了し、P16-1 でこれらを統一的に呼び出す graphify-rfc.md スラッシュコマンドが実装された。

残るは以下の3つの作業であり、本チケット P16-2 で一括対応する：

1. **formulate連携スクリプトの作成**: graphify で生成したグラフを formulate パイプライン（formulate-tickets / formulate-tickets-for-next）から利用可能にする load-rfc-graph.js と dump-ticket-graph-commands.js を新規作成する
2. **既存コマンドの改修**: 6つの既存コマンドファイルにグラフ参照ステップを追加し、実装着手前に設計グラフを探索する習慣を確立する
3. **Acceptance Criteriaテスト**: verify.js / embed-markers.js / query.js の基盤スクリプト群が RFC の品質要件を満たしていることを検証する bash テストスクリプトを作成する

これにより、graphify（発散）→formulate（収束）の完全なパイプラインが形成され、RFC設計文書から実装チケット分解までの流れが一貫する。

RFC-GRAPHIFY.md §3.9 に formulate 連携の設計詳細が、§4.7 に Acceptance Criteria の設計が記述されている。どちらも P16-2 で実装されるべき項目としてスコープ外に明示されている。

## Scope

### 対象ファイル（新規作成）

| ファイル | 役割 | 配置先 | RFC参照 |
|---------|------|-------|---------|
| load-rfc-graph.js | グラフサマリー＋CLI使用例の自然言語出力 | `.claude/scripts/rfc-graph/` | §3.9.1 |
| dump-ticket-graph-commands.js | Tickets.json nodeIDs読み取り→spec機械補完 | `.claude/scripts/rfc-graph/` | §3.9.2 |

### 対象ファイル（改修）

| ファイル | 改修内容 | RFC参照 |
|---------|---------|---------|
| `.claude/commands/formulate-tickets.md` | Step 1 と Step 2 の間に load-rfc-graph.js Step を追加 | §3.9.1 |
| `.claude/commands/formulate-tickets-for-next.md` | Step 1 と Step 2 の間に load-rfc-graph.js Step を追加 | §3.9.1 |
| `.claude/commands/make-ticket.md` | specテンプレートに「RFC設計グラフ構造探索コマンド」セクションを追加 | §3.9.3 |
| `.claude/commands/plan-ticket.md` | 計画フェーズにグラフ探索確認サブステップを追加 | §3.9.3 |
| `.claude/commands/start-ticket.md` | 実装フェーズにグラフ探索確認サブステップを追加 | §3.9.3 |
| `.claude/commands/review-ticket.md` | レビューフェーズにグラフ探索確認サブステップを追加 | §3.9.3 |

### 対象ファイル（テスト追加）

| ファイル | 役割 |
|---------|------|
| `tests/rfc-graph/acceptance-criteria.test.cjs` | 4項目のAcceptance Criteria検証テスト |

### 実装内容

#### 1. load-rfc-graph.js — グラフサマリー＋CLI使用例（RFC §3.9.1）

CLI: `node .claude/scripts/rfc-graph/load-rfc-graph.js <source-path>`

- `<source-path>` からグラフパスを自動導出（`<source-dir>/<basename>-GRAPH.json`）
- グラフファイルが存在する場合：
  - 自然言語のグラフサマリーを標準出力に出力：
    - グラフファイルパス
    - ノード数と kind 別分布
    - エッジ数と type 別分布
    - 孤立ノード数
    - ツリー表示（オプション）
  - crud.js と query.js の具体的なCLI使用例を出力
- グラフファイルが存在しない場合：
  - 何も出力せず終了コード0で終了（既存動作に影響ゼロ）
- エラー処理プロトコルは既存スクリプトと同じ3段テンプレート形式

**公開関数**:
- `deriveGraphPath(sourcePath)` — ソースパスからグラフパスを導出（純粋関数）
- `loadGraph(graphPath)` — グラフファイルの読み込みとパース
- `summarizeGraph(graph)` — ノード数・kind別分布・エッジ数・type別分布の集計（純粋関数）
- `generateUsageExamples(graphPath, sourcePath)` — CLI使用例の生成（純粋関数）
- `outputSummary(summary, examples)` — 整形して標準出力に出力
- `main()` — エントリポイント

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

#### 2. dump-ticket-graph-commands.js — ノード→specコマンド追記（RFC §3.9.2）

CLI: `node .claude/scripts/rfc-graph/dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>`

- Tickets.json を読み込む
- 各チケットの `nodeIDs` フィールドをスキャン
- グラフファイルが存在する場合：
  - 各ノードIDに対する `query.js` コマンドを機械的に生成
  - チケットの spec に「RFC設計グラフ構造探索コマンド」セクションとして追記
- グラフファイルが存在しない場合：
  - 「グラフファイルがありません。/graphify-rfc を先に実行してグラフを生成してください。」を追記
- エラー処理プロトコルは既存スクリプトと同じ3段テンプレート形式

**公開関数**:
- `parseArguments(args)` — CLI引数のパース
- `loadTickets(path)` — Tickets.json の読み込み
- `collectNodeIds(tickets)` — 全チケットの nodeIDs を収集（純粋関数）
- `generateCommands(nodeIds, graphPath, sourcePath)` — query.js コマンド生成（純粋関数）
- `formatSection(commandsOrMessage)` — 「RFC設計グラフ構造探索コマンド」セクションのフォーマット（純粋関数）
- `appendToSpec(specPath, section)` — spec ファイルへの追記
- `main()` — エントリポイント

**spec への追記フォーマット**（グラフ存在時）:
```
### RFC設計グラフ構造探索コマンド

グラフファイル: RFC-GRAPHIFY-GRAPH.json

チケットに統合されたノード:
- N0001 (認証API定義) → `node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0001 --hops=3`
- N0003 (トークン検証ロジック) → `node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0003 --hops=3`
- N0005 (セッション管理) → `node .claude/scripts/rfc-graph/query.js --graph=RFC-GRAPHIFY-GRAPH.json --source=RFC-GRAPHIFY.md --id=N0005 --hops=3`
```

**spec への追記フォーマット**（グラフ不在時）:
```
### RFC設計グラフ構造探索コマンド

グラフファイルがありません。/graphify-rfc を先に実行してグラフを生成してください。
```

#### 3. formulate-tickets.md 改修 — load-rfc-graph.js Step追加

既存の Step 1（I/O境界参考情報参照）と Step 2（設計書検証）の間に、以下の新 Step を追加する：

```
### Step X: グラフ構造の確認

graphify-rfc で生成されたグラフが存在する場合、load-rfc-graph.js でグラフサマリーを表示する：

```bash
node .claude/scripts/rfc-graph/load-rfc-graph.js "$DOC_PATH"
```

このStepはグラフが存在しない場合でもエラーにせずスキップする（load-rfc-graph.js が何も出力せず終了コード0で終了する）。
```

既存の Step 番号は繰り下げる（Step 2→Step 3, ...）。

#### 4. formulate-tickets-for-next.md 改修 — load-rfc-graph.js Step追加

formulate-tickets.md と同様に、既存 Step 1（I/O境界参考情報参照）と Step 2（次世代RFC検証）の間に load-rfc-graph.js 呼び出し Step を追加する。

```
### Step X: グラフ構造の確認

graphify-rfc で生成されたグラフが存在する場合、load-rfc-graph.js でグラフサマリーを表示する：

```bash
node .claude/scripts/rfc-graph/load-rfc-graph.js "$NEXT_RFC_PATH"
```

グラフが存在しない場合はスキップされる。
```

#### 5. make-ticket.md 改修 — specテンプレートに「RFC設計グラフ構造探索コマンド」セクション追加

spec ファイル生成後のテンプレート記述（Step 2〜6 の記述）に、以下のセクションを追加する。

```
### RFC設計グラフ構造探索コマンド

dump-ticket-graph-commands.js により、チケットに関連するグラフノードの query.js コマンドが
ここに自動追記される。実装着手前に query.js でグラフ探索を行い、設計全体の中での
位置づけを確認する。

グラフが存在しない場合は、/graphify-rfc を先に実行してグラフを生成する。
```

このセクションは create-spec.js が生成する spec テンプレートにハードコードされているのではなく、dump-ticket-graph-commands.js が動的に追記するものである。そのため、make-ticket.md には「dump-ticket-graph-commands.js の実行」サブステップと「グラフ探索セクションは dump-ticket-graph-commands.js で自動追記される」説明テキストを追加する。

#### 6. plan/start/review テンプレート改修 — グラフ探索確認サブステップ追加

3つのコマンド（plan-ticket.md / start-ticket.md / review-ticket.md）それぞれに、spec 内の「RFC設計グラフ構造探索コマンド」セクションを確認するサブステップを追加する。

**追加する共通サブステップ**:

```
### グラフ探索（RFC設計グラフ構造探索コマンド）

spec 内の「RFC設計グラフ構造探索コマンド」セクションに記載された query.js コマンドを
実行し、対象チケットのグラフ上の位置と依存関係を確認する。

- 全ノード一覧: crud.js list-nodes --graph=<graph-path>
- 起点ノードからの探索: query.js --graph=<graph-path> --source=<rfc-path> --id=<nodeId> --hops=3

グラフが存在しない場合（dump-ticket-graph-commands.js が「グラフファイルがありません」と
記載した場合）は、このサブステップをスキップする。
```

#### 7. acceptance-criteria.test.cjs — 4 Acceptance Criteriaテスト

既存のテストパターン（monkey-patch + node:test + 一時ディレクトリ）に準拠する。

**AC1**: verify.js のカバレッジ検証
- テスト用最小RFCとグラフを作成し、verify.js が `{"ok":true}` を返すことを確認
- `checkCoverage` 関数を monkey-patch して任意のカバレッジ状態をシミュレート
- 未カバー行がある場合に `ok: false` が返ることも確認

**AC2**: embed-markers.js の冪等性
- embed-markers.js を2回連続実行し、2回目の出力内容が1回目と同一であることを確認
- ソース文書に既存マーカーがある場合に重複してマーカーが追加されないことを確認

**AC3**: query.js のマルチホップ
- `--hops=1` と `--hops=2` で返却ノード集合が異なることを確認
- `--hops=1` が直接接続ノードのみを返すこと
- `--hops=2` が2ホップ先のノードも含むこと

**AC4**: 行挿入耐性
- ソース文書に1行挿入後、query.js が正しい新行番号を返すことを確認
- `resolveCurrentLines` 関数の monkey-patch による検証
- 行挿入後も REF マーカーが正しく行番号を解決できること

## Non-scope

- **P12-P15 基盤スクリプト（crud.js / verify.js / embed-markers.js / query.js / update-step-status.js / schema/validate.js）**: 一切変更しない。Acceptance Criteriaテストはこれらを内部から monkey-patch して検証する
- **graphify-rfc.md スラッシュコマンド（P16-1）**: 既存のコマンドファイルは変更しない
- **conver.js ソース・dist・node_modules**: 変更しない
- **bulk-add-tickets.js / add-ticket.js の nodeIDs フィールド対応**: RFC-GRAPHIFY.md §C（スコープ外）に明示され、別タスクで対応する
- **APIサーバー・Webインターフェース**: 対象外
- **複数グラフの同時処理**: 本チケットでは単一グラフのみ対象
- **Tickets.json の nodeIDs フィールド自動設定**: formulate-tickets の生成時に nodeIDs が自動設定されるわけではなく、手動または別タスクで設定される前提

## Investigation

### RFC-GRAPHIFY.md §3.9 の設計詳細（L330-L416）

§3.9（formatulate-tickets 連携）は以下の3つのサブセクションで構成される：

**§3.9.1 load-rfc-graph.js**（L332-L354）:
- CLI: `load-rfc-graph.js <source-path>`
- グラフパス自動導出（`<source-dir>/<basename>-GRAPH.json`）
- グラフ存在時: 自然言語サマリー + CLI使用例出力
- グラフ不在時: 何も出力せず終了コード0
- 出力例: ノード12件/エッジ18件のサマリー、crud.js/query.js の使用例

**§3.9.2 dump-ticket-graph-commands.js**（L356-L400）:
- CLI: `dump-ticket-graph-commands.js --tickets=<path> --graph=<path> --source=<path>`
- Tickets.json の nodeIDs フィールドをスキャン
- グラフ存在時: query.js コマンドを spec に追記
- グラフ不在時: 「グラフファイルがありません」を追記
- Tickets.json のスキーマ拡張として nodeIDs フィールド（オプショナル）を定義
- bulk-add-tickets.js / add-ticket.js の改修（--node-ids対応）はスコープ外

**§3.9.3 make/plan/start/review での確認ステップ**（L402-L415）:
- spec 内の「RFC設計グラフ構造探索コマンド」セクションに記載された query.js を実行
- 全ノード一覧と起点ノードからの探索の2つのサブコマンド
- グラフ不在時はスキップ

### RFC-GRAPHIFY.md §4.7 のテスト設計（L696-L719）

Acceptance Criteria は4項目：

| AC# | 対象 | 検証内容 | 検証方法 |
|-----|------|---------|---------|
| AC1 | verify.js | カバレッジ100%で `{"ok":true}` を返す | monkey-patch + テスト用最小グラフ |
| AC2 | embed-markers.js | 2回連続実行でソース文書に差分なし（冪等性） | monkey-patch + テスト用最小グラフ |
| AC3 | query.js | --hops=1 と --hops=2 で返却ノード集合が異なる | monkey-patch + テスト用最小グラフ |
| AC4 | query.js | ソース文書に1行挿入後、正しい新行番号を返す | monkey-patch + テスト用最小グラフ |

### 既存スクリプトの状態確認（全スクリプト実装済み）

| ファイル | 行数 | テストファイル | テスト行数 |
|---------|------|---------------|-----------|
| `.claude/scripts/rfc-graph/crud.js` | 516行 | `tests/rfc-graph/crud.test.cjs` | 453行 |
| `.claude/scripts/rfc-graph/verify.js` | 399行 | `tests/rfc-graph/verify.test.cjs` | 432行 |
| `.claude/scripts/rfc-graph/embed-markers.js` | 458行 | `tests/rfc-graph/embed-markers.test.cjs` | 348行 |
| `.claude/scripts/rfc-graph/query.js` | 606行 | `tests/rfc-graph/query.test.cjs` | 706行 |
| `.claude/scripts/rfc-graph/update-step-status.js` | 463行 | `tests/rfc-graph/update-step-status.test.cjs` | 491行 |
| `.claude/scripts/rfc-graph/schema/validate.js` | 169行 | `tests/rfc-graph/schema/validate.test.cjs` | 473行 |

### 既存コマンドの状態確認

| コマンドファイル | グラフ参照 | 改修必要 |
|-----------------|-----------|---------|
| `.claude/commands/make-ticket.md` | なし | ✅ specテンプレート + dump-ticket-graph-commands.js呼び出し |
| `.claude/commands/plan-ticket.md` | なし | ✅ グラフ探索サブステップ追加 |
| `.claude/commands/start-ticket.md` | なし | ✅ グラフ探索サブステップ追加 |
| `.claude/commands/review-ticket.md` | なし | ✅ グラフ探索サブステップ追加 |
| `.claude/commands/formulate-tickets.md` | なし | ✅ load-rfc-graph.js Step追加 |
| `.claude/commands/formulate-tickets-for-next.md` | なし | ✅ load-rfc-graph.js Step追加 |

### テスト用最小グラフの設計

Acceptance Criteriaテストでは、実際のファイルI/Oを避けるため monkey-patch を使用する。ただしパターンマッチテストの精度向上のため、`tests/rfc-graph/schema/` に共有テストフィクスチャとして最小グラフを配置する方針とする。各テストケースの monkey-patch はこのフィクスチャを起点にカスタマイズする。

## Test Plan

### ユニットテスト計画

#### load-rfc-graph.js のユニットテスト

`tests/rfc-graph/load-rfc-graph.test.cjs`（新規作成）

| # | テスト名 | 種別 | 内容 |
|---|---------|------|------|
| 1 | deriveGraphPath: 通常の.mdファイル | 正常系 | `/path/to/doc.md` → `/path/to/doc-GRAPH.json` |
| 2 | deriveGraphPath: 拡張子なし | 正常系 | `/path/to/doc` → `/path/to/doc-GRAPH.json` |
| 3 | deriveGraphPath: 深いパス | 正常系 | `/a/b/c/d/e.md` → `/a/b/c/d/e-GRAPH.json` |
| 4 | loadGraph: 存在するグラフ | 正常系 | 読み込み成功、パース結果が返る |
| 5 | loadGraph: 存在しないグラフ | 異常系 | エラー終了、3段テンプレート出力 |
| 6 | loadGraph: 不正なJSON | 異常系 | パースエラー、3段テンプレート出力 |
| 7 | summarizeGraph: 空グラフ | 境界値 | ノード0件/エッジ0件のサマリー |
| 8 | summarizeGraph: 各種kindが混在 | 正常系 | kind別分布が正確に集計される |
| 9 | summarizeGraph: 孤立ノードあり | 正常系 | 孤立ノード数が正しく報告される |
| 10 | generateUsageExamples: グラフパス使用 | 正常系 | crud.js/query.js の完全なCLI形式 |
| 11 | outputSummary: 整形出力 | 正常系 | 指定フォーマットで標準出力される |
| 12 | main: グラフ存在 | 正常系 | full出力 (summary + examples) |
| 13 | main: グラフ不在 | 正常系 | 何も出力せず終了コード0 |
| 14 | main: 引数不足 | 異常系 | 使用方法表示、終了コード1 |

カバレッジ目標: 公開関数 100%、main の全分岐 100%

#### dump-ticket-graph-commands.js のユニットテスト

`tests/rfc-graph/dump-ticket-graph-commands.test.cjs`（新規作成）

| # | テスト名 | 種別 | 内容 |
|---|---------|------|------|
| 1 | parseArguments: 全引数あり | 正常系 | tickets/graph/source のパスが正しくパースされる |
| 2 | parseArguments: 引数不足 | 異常系 | 使用方法表示、終了コード1 |
| 3 | loadTickets: 正常JSON | 正常系 | パース成功 |
| 4 | loadTickets: ファイル不在 | 異常系 | エラー終了 |
| 5 | collectNodeIds: 全チケットにnodeIDsあり | 正常系 | 全 nodeIDs が収集される |
| 6 | collectNodeIds: nodeIDsなしのチケット混在 | 正常系 | 空・欠落チケットはスキップ |
| 7 | collectNodeIds: 全チケットにnodeIDsなし | 正常系 | 空配列を返す |
| 8 | generateCommands: グラフ存在+nodeIDsあり | 正常系 | query.js コマンドが正しく生成される |
| 9 | generateCommands: グラフ不在 | 正常系 | 「グラフファイルがありません」メッセージ |
| 10 | formatSection: コマンドあり | 正常系 | 完全なセクションフォーマット |
| 11 | formatSection: グラフ不在メッセージ | 正常系 | 不在メッセージフォーマット |
| 12 | main: グラフ存在+nodeIDsあり | 正常系 | spec への追記成功 |
| 13 | main: グラフ不在 | 正常系 | 不在メッセージ追記 |
| 14 | main: nodeIDsなし | 正常系 | 何も追記せず終了コード0 |

カバレッジ目標: 公開関数 100%、main の全分岐 100%

#### Acceptance Criteriaテスト

`tests/rfc-graph/acceptance-criteria.test.cjs`（新規作成）

既存テストパターン（monkey-patch + 一時ディレクトリ）に準拠し、4項目の Acceptance Criteria を検証する。

| # | AC | テスト名 | 内容 |
|---|----|---------|------|
| 1 | AC1 | verify.js カバレッジ100% → ok:true | checkCoverage を monkey-patch して全行カバー状態をシミュレート |
| 2 | AC1 | verify.js 未カバー行あり → ok:false | checkCoverage を monkey-patch して未カバー行あり状態をシミュレート |
| 3 | AC1 | verify.js 孤立ノードあり → ok:false | checkIsolated を monkey-patch して孤立ノードあり状態をシミュレート |
| 4 | AC2 | embed-markers.js 冪等性: 2回連続実行 | embedAll を monkey-patch して2回連続呼び出し結果が同一であることを確認 |
| 5 | AC2 | embed-markers.js 重複マーカー追加防止 | extractExistingRefIds を monkey-patch して既存マーカーを検出 |
| 6 | AC3 | query.js hops=1 と hops=2 の差異 | multiHopBFS を monkey-patch してホップ数による結果の違いを確認 |
| 7 | AC4 | query.js 行挿入後の行番号解決 | resolveCurrentLines を monkey-patch して1行挿入後の行番号正しさを確認 |
| 8 | AC4 | query.js 行削除後の行番号解決 | resolveCurrentLines を monkey-patch して1行削除後の行番号正しさを確認 |

### ユニットテスト不可能な項目（例外）

| 理由 | 説明 |
|------|------|
| 実際のファイルI/Oを伴う結合テスト | monkey-patch による単体テストで代替する。実際のファイル読み書きは既存の基盤スクリプトテスト（crud.test.cjs 等）で検証済み |
| formulate-tickets からの実際の load-rfc-graph.js 呼び出し | スラッシュコマンド（Markdownテンプレート）の動作は Claude Code の実行に依存する。スクリプト自体の単体テストで代替する |
| dump-ticket-graph-commands.js の spec ファイルへの実際の書き込み | 書き込み先の spec ファイルパスの決定ロジックは単体テスト可能。実際の追記動作は monkey-patch で検証する |

## Boy Scout Rule — 翻訳可能性計画

### 新規スクリプトでの遵守事項

load-rfc-graph.js と dump-ticket-graph-commands.js では以下の翻訳可能性を確保する：

1. **関数名は動詞句**: `deriveGraphPath`, `loadGraph`, `summarizeGraph`, `generateUsageExamples`, `collectNodeIds`, `generateCommands`
2. **変数名はドメイン概念**: `sourcePath`, `graphPath`, `ticketsPath`, `nodeId`, `hopsCount`
3. **一関数一責務**: 各関数は単一の責務（集計、整形、ファイル読み込み、コマンド生成）に特化
4. **ハードコード値は名前付き定数**: ファイル名パターン（`-GRAPH.json` 等）やデフォルトホップ数は定数化
5. **エラー握りつぶし禁止**: 全エラーは3段テンプレート形式で stderr に出力し、終了コード1で終了
6. **既存スクリプトのパターン準拠**: `parseArguments` + `main` の2関数構成、既存のエラー処理プロトコルに統一

### 既存コマンド改修での遵守事項

formulate-tickets.md / formulate-tickets-for-next.md / make-ticket.md / plan-ticket.md / start-ticket.md / review-ticket.md の改修では：

1. **追加するサブステップは既存の記述スタイルに統一**: 既存のStep記述と同じマークダウン構造・番号付きリスト・コードブロックを使用する
2. **既存のStep番号を変更しない**: load-rfc-graph.js のStepは既存Step1とStep2の間に追加する（既存Step2以降は繰り下げ）
3. **グラフ不在時のスキップ動作を明記**: 分岐条件を自然言語で明確に記述する

## Acceptance Criteria

### load-rfc-graph.js
- [ ] `deriveGraphPath` がソースパスから正しいグラフパスを導出する
- [ ] `summarizeGraph` がノード数・kind別分布・エッジ数・type別分布を正確に集計する
- [ ] グラフ存在時に自然言語サマリーとCLI使用例を出力する
- [ ] グラフ不在時に何も出力せず終了コード0で終了する
- [ ] 引数不足時に使用方法を表示して終了コード1で終了する
- [ ] エラー時は3段テンプレート形式で stderr に出力する

### dump-ticket-graph-commands.js
- [ ] Tickets.json の nodeIDs フィールドを正しくスキャンする
- [ ] グラフ存在時に各ノードIDに対する query.js コマンドを生成する
- [ ] グラフ不在時に「グラフファイルがありません」メッセージを追記する
- [ ] nodeIDs がないチケットに対しては何も出力しない
- [ ] 出力フォーマットが RFC §3.9.2 のテンプレートに準拠する
- [ ] エラー時は3段テンプレート形式で stderr に出力する

### 既存コマンド改修
- [ ] formulate-tickets.md に load-rfc-graph.js Step が追加されている
- [ ] formulate-tickets-for-next.md に load-rfc-graph.js Step が追加されている
- [ ] make-ticket.md に dump-ticket-graph-commands.js 呼び出しサブステップが追加されている
- [ ] plan-ticket.md にグラフ探索確認サブステップが追加されている
- [ ] start-ticket.md にグラフ探索確認サブステップが追加されている
- [ ] review-ticket.md にグラフ探索確認サブステップが追加されている
- [ ] 追加された全サブステップにグラフ不在時のスキップ動作が明記されている
- [ ] 追加された全サブステップが既存の記述スタイルに統一されている

### Acceptance Criteriaテスト
- [ ] AC1: verify.js カバレッジ100% → `{"ok":true}` の検証テストが通る
- [ ] AC2: embed-markers.js 冪等性（2回連続実行で差分なし）の検証テストが通る
- [ ] AC3: query.js --hops=1 と --hops=2 で結果が異なる検証テストが通る
- [ ] AC4: 行挿入後の行番号解決の検証テストが通る
- [ ] 全既存テスト（crud.test.cjs / verify.test.cjs / embed-markers.test.cjs / query.test.cjs / update-step-status.test.cjs / schema/validate.test.cjs）が通過している

### 品質
- [ ] 既存テストがすべて通過している
- [ ] `[::STUB::]` マーカーの未付与スタブがない
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存関係

- **先行実装必須**（全完了済み）:
  - P12-1: JSON Schema定義とバリデーション基盤
  - P13-1: update-step-status.js（進行管理基盤）
  - P13-2: crud.js（全CRUD操作）
  - P14-1: verify.js（カバレッジ検証）+ embed-markers.js（冪等マーカー挿入）
  - P15-1: query.js（BFSマルチホップ探索）
  - P16-1: graphify-rfc.md スラッシュコマンド（5Step進行制御）
- **本チケット**: P16-2 formulate連携スクリプト群 + 既存コマンド改修 + Acceptance Criteriaテスト

### 設計上の重要注意点

1. **load-rfc-graph.js のグラフ不在時の動作**: 何も出力せず終了コード0で終了することで、formulate-tickets の既存動作に影響を与えない。これにより、グラフが未生成のRFCに対しても formulate-tickets が正常に動作する。

2. **dump-ticket-graph-commands.js の nodeIDs 不在時の動作**: nodeIDs フィールドがないチケットに対しては何も出力しない（エラーにしない）。これにより、nodeIDs が未設定の既存チケットがエラーになることを防ぐ。

3. **Acceptance Criteriaテストと既存テストの分離**: ACテストは基盤スクリプトの monkey-patch 検証に特化し、既存の unit test（crud.test.cjs 等）は基盤スクリプトの内部ロジック検証に特化する。両者は独立して実行可能。

4. **Tickets.json の nodeIDs フィールド**: formulate-tickets が自動設定するものではなく、手動または別タスクで設定される前提。dump-ticket-graph-commands.js は nodeIDs が設定されていることを前提に動作する。

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
