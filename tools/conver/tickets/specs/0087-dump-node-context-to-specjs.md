---
ticket_id: 87
title: 新規スクリプト dump-node-context-to-spec.js 作成
slug: dump-node-context-to-specjs
status: made
created_at: 2026-07-13
updated_at: 2026-07-13
---

# 新規スクリプト `dump-node-context-to-spec.js`: GRAPH.json + Dirs-Tree.json から spec への完全設計コンテキスト自動書き込み

## Summary

`dump-node-context-to-spec.js` は、チケットの `nodeIds` フィールドを起点として、GRAPH.json（ノード詳細・エッジ関係性）と Dirs-Tree.json（実装先ファイルパス）の情報を機械的に spec ファイルに書き込む新規スクリプトである。これにより、graphify → boundify → split のパイプラインで綿密に構築された情報資産が、実装者に対して spec を通じて完全にトレース可能な状態になる。

## Background

### 問題: パイプライン情報が spec で欠落する構造的欠陥

現在の `make-ticket` のワークフローには以下の欠落がある:

1. `dump-ticket-graph-commands.js` は query.js コマンド（グラフ探索の入口）のみを spec に書き込む — ノードの詳細情報（kind, summary, language）やエッジの関係性は一切書き込まない
2. `dump-ticket-graph-commands.js` 自体がバグで spec 書き込みに失敗する（PX-49 で修正予定）
3. 実装先ファイルパス（Dirs-Tree.json）の情報は spec に機械的に書き込まれず、AI の手動記述のみに依存していた
4. エッジ情報（ノード間の依存関係）は spec から完全に欠落している

### なぜスクリプトによる機械的書き込みが不可欠か

「可能な限りスクリプトによる機械的な方法で行い、解釈が必要な部分だけAIによって考えさせる」という原則に従い、以下の判断基準で機械的処理とAI処理を切り分ける:

| 処理 | 決定論度 | 方法 | 理由 |
|------|---------|------|------|
| ノードID・タイトル・kind・languageの書き出し | 100% | 機械的 | GRAPH.json からそのまま読める |
| エッジ一覧（from/to/type） | 100% | 機械的 | エッジはグラフに既存 |
| ファイルパスの書き出し | 100% | 機械的 | Dirs-Tree.json から解決可能 |
| headingRefs の書き出し | 100% | 機械的 | GRAPH.json のノードに既存 |
| spec セクションのフォーマット | 100% | 機械的 | 決まったテンプレート |
| 依存関係の重要度判断 | 80% | 機械的(優先度ルール) + AI補完 | エッジ種別に優先度を付けてソート |
| 「この依存関係が実装にどう影響するか」の説明 | 0% | AI が spec 肉付け時に判断 | 解釈が必要 |

つまり本スクリプトは **「決定論的に確定できる全情報」を spec に書き込み、AI はそこから「解釈が必要な部分」を spec の背景・スコープとして肉付けする**という役割分担を実現する。

### 実データによる裏付け

`crates/siprs/Tickets.json`（split-to-tickets で生成）にはすでに以下の情報が格納されている:

```json
// P0-1 のチケット例
{
  "title": "認証基盤",
  "nodeIds": ["N0001", "N0002", "N0003", "N0004", "N0007", "N0008", "N0009"],
  "default_files": ["src/auth/keystore.rs", "src/auth/token.rs"]
}
```

しかしこのチケットの spec には、以下の情報が機械的に書き込まれていない:

- N0001 の kind=`architecture`, summary=`RustからPJSUAを安全に...`, language=`rust`, slug=`purpose`
- ノード間の19本のエッジ（`N0002 ---part_of---> N0001`, `N0009 ---depends_on---> N0022`, etc.）
- チケット外ノード（N0022, N0144 など）との関係
- 実装先ファイルパスの Dirs-Tree からの解決

これらの情報を spec に機械的に書き込むことで、実装者は spec だけで全コンテキストにアクセスできる。

## Scope

### CLI インターフェース

```bash
node .claude/scripts/rfc-graph/dump-node-context-to-spec.js \
  --tickets=<Tickets.json path> \
  --graph=<GRAPH.json path> \
  --dirs-tree=<Dirs-Tree.json path> \
  --ticket-key=<ticketKey> \
  [--ticket-key=<ticketKey2> ...]
```

引数:
- `--tickets=<path>` (必須) — Tickets.json のパス
- `--graph=<path>` (必須) — GRAPH.json のパス
- `--dirs-tree=<path>` (必須) — Dirs-Tree.json のパス
- `--ticket-key=<key>` (1個以上必須) — コンテキストを取得するチケットキー（複数指定可能）。0個の場合、`[ERROR]` テンプレートでエラー終了（exit 1）する。

出力: スクリプトは以下の3ブロックから成る「設計コンテキスト」セクションを生成し、該当チケットの spec ファイルに自動追記する。

### 出力ブロックの設計

#### Block 1: ノード詳細（100% 機械的）

対象チケットの `nodeIds` に含まれる全ノードの完全な詳細を表形式で書き出す:

```markdown
### 設計コンテキスト: ノード詳細

チケット P0-1 に統合されたグラフノード（7件）:

| ID | kind | language | slug | title | 要約 |
|----|------|----------|------|-------|------|
| N0001 | architecture | rust | purpose | §1 目的 — 本crateの責務定義 | RustからPJSUAを安全かつ非同期に… |
| N0002 | requirement | rust | m20_priority | §1a M20実装優先度マップ | M20追補の全実装項目を… |
| N0003 | rationale | rust | design_decisions | §1a 設計判断対応表 | M20設計判断Q1:A〜Q14:Aの一覧… |
| ... | ... | ... | ... | ... | ... |

#### headingRefs（RFC参照位置）

| ID | 見出しレベル | 見出しテキスト |
|----|-------------|---------------|
| N0001 | 1 | §1 目的 — 本crateの責務定義 |
| N0007 | 2 | §4 準拠要件 |
| ... | ... | ... |
```

#### Block 2: エッジ関係性（100% 機械的 — これが最重要ブロック）

チケット内ノードを中心とした全エッジを、チケット内外の区別をつけて書き出す。エッジ種別の優先度順（depends_on > precedes > triggers > constrains > conflicts_with > refines > extends > implements > supersedes > references > part_of > validates）にソートする:

```markdown
### 設計コンテキスト: ノード間関係性（エッジ）

凡例: ★ = 自チケット内ノード、☆ = 他チケット/フェーズのノード

#### depends_on（依存）
| From | → | To | 備考 |
|------|---|----|------|
| ★ N0009 (§5 機能要求の確定化) | → | ☆ N0022 (§10 ClientConfig完全仕様) | P1-1 に属するノード。先行実装が必要 |
| ☆ N0006 (§3 用語) | → | ★ N0001 (§1 目的 — 本crateの責務定義) | P0-3 からの依存。本チケット完了後に P0-3 が着手可能 |

#### precedes（先行）
| From | → | To |
|------|---|----|
| ★ N0009 (§5 機能要求の確定化) | → | ☆ N0022 (§10 ClientConfig完全仕様) |
| ★ N0009 (§5 機能要求の確定化) | → | ☆ N0014 (§7.1a 単一Reactorスケーラビリティ注記) |

#### references（参照）
| From | → | To |
|------|---|----|
| ★ N0002 (§1a M20実装優先度マップ) | → | ☆ N0039 (M20 追補: NativeEvent変換基本方針) |

#### part_of（構成要素）
| From | → | To |
|------|---|----|
| ★ N0002 (§1a M20実装優先度マップ) | → | ★ N0001 (§1 目的) |
| ☆ N0173 (§59.1 TLS証明書管理) | → | ★ N0007 (§4 準拠要件) |
```

#### Block 3: 実装ファイルパス（100% 機械的）

チケットの `default_files`（存在する場合のみ）と、Dirs-Tree.json の `mappedNodeIds` から解決した関連ノードのファイルパスを書き出す。`default_files` が undefined または空配列の場合は「本チケットの実装先」セクションを省略し、「関連ノードの実装先」のみを出力する:

```markdown
### 設計コンテキスト: 実装ファイルパス

#### 本チケットの実装先（default_files）
- `src/auth/keystore.rs` (N0001)
- `src/auth/token.rs` (N0001, N0003)

#### 関連ノードの実装先（エッジ接続先）
| ノード | ファイルパス | 関係 |
|--------|-------------|------|
| N0022 (§10 ClientConfig完全仕様) | `src/config/client_config.rs` | depends_on 被依存先 |
| N0006 (§3 用語) | `src/lib.rs` | depends_on 依存元 |
| N0173 (§59.1 TLS証明書管理) | `src/security/tls_cert_management.rs` | part_of 依存元 |

#### 言語別ルール
- 主要言語: rust
- 対応ディレクトリ: `src/`

#### ファイル冒頭の Initial Design Artifact コメント参照

各実装ファイルの先頭には、boundify が生成時に埋め込んだ以下のコメントブロックが存在する:

```rust
// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// ...
// Mapped node(s):
//   - NODE_ID=N0024:  §11 AccountConfig完全仕様
//     → query.js 探索コマンド...
// Cross-referenced design context:
//   - ...
// ============================================================================
```

このブロックにはグラフ探索コマンドやクロスリファレンスが含まれており、実装中にノード間関係性を確認するために直接利用できる。Block 3 の末尾に以下の定型案内文を機械的に追記する:

```markdown
#### 実装ファイル冒頭コメントの活用

上記の各実装ファイルを開くと、ファイル先頭に `Initial Design Artifact — RFC-driven Implementation`
コメントブロックが埋め込まれている。このブロックには query.js 探索コマンドや
エッジ関係のクロスリファレンスが含まれている。実装中にノード間の関係性を
再確認したい場合は、このコメントブロック内のコマンドを直接利用すること。
```

この定型文は `formatFilePathsBlock()` 内で常に出力する（条件分岐不要）。
```

### スクリプトの内部設計

```javascript
// エントリポイント
function main()
  1. parseArguments() → ticketsPath, graphPath, dirsTreePath, ticketKeys[]
  2. loadTickets(ticketsPath) → tickets
  3. loadGraph(graphPath) → graph
  4. loadDirsTree(dirsTreePath) → dirsTree
  5. for each ticketKey in ticketKeys:
     a. resolve nodeIds from Tickets.json
     b. collect node details from graph.nodes
     c. collect edges from graph.edges (filter by nodeIds)
     d. collect file paths from dirsTree.trees[lang].mappedNodeIds
     e. formatNodeDetailsBlock(nodes) → markdown string
     f. formatEdgeRelationsBlock(edges, nodes, graph) → markdown string
     g. formatFilePathsBlock(nodes, edges, dirsTree, ticket) → markdown string
     h. combine blocks → section string
     i. resolveSpecPath(ticketKey, ticketsPath) → specPath (PX-49 の resolveSpecPath と同じロジック)
     j. appendToSpec(specPath, section) (冪等性チェック付き)
```

### 冪等性（同一セクションの重複追記防止）

既に spec に「設計コンテキスト:」を含むセクションが存在する場合、追記をスキップする。判定は spec ファイル内の `### 設計コンテキスト:` で始まる行の有無で行う。

### dump-ticket-graph-commands.js との関係

両スクリプトは異なる情報を spec に書き込む:

| スクリプト | 書き込む情報 | タイミング |
|-----------|-------------|-----------|
| dump-ticket-graph-commands.js | query.js 探索コマンド（グラフへの入り口） | 先に実行 |
| dump-node-context-to-spec.js | ノード詳細＋エッジ関係＋ファイルパス（設計コンテキストの実体） | 後に実行 |

両方とも PX-51（make-ticket.md 改修）の Step 7 で実行される。

## Non-scope

- PX-49 の修正対象（dump-ticket-graph-commands.js の resolveSpecPath）は含めない
- `dump-ticket-graph-commands.js` の既存機能への変更は含めない
- テストファイルの作成は本チケットに含める（新規スクリプトのため）
- Dirs-Tree.json の循環依存の解決は含めない（設計判断として既知）

## Investigation

### 確認された実データ構造

`crates/siprs/` の実データから以下の構造を確認:

**Tickets.json（phase[].tickets[]）:**
- `nodeIds: string[]` — グラフノードIDの配列
- `default_files: string[]` — デフォルトの実装先ファイルパス（Phaseによっては undefined の場合あり）
- `referenceSection: string` — spec ファイルのパス（例: `"tickets/specs/0001-type-defs.md"`）

**GRAPH.json:**
- `nodes[]` 各ノード: `{ id, title, kind, summary, language, slug, headingRefs: [{ refId, heading, texts }] }`
- `edges[]` 各エッジ: `{ from, to, type }`（type は12種の enum）
- `sourceFile` / `mainLanguage`

**Dirs-Tree.json:**
- `trees` オブジェクト: 言語名をキーとするディレクトリツリー（`{ name, type, kind, mappedNodeIds?, children[] }`）
- `dependencyDirections` 配列: ディレクトリ間依存方向
- `analysis` オブジェクト: 統計情報（nodeCount, edgeCount, kindCounts, 循環依存）

### resolveSpecPath の共通モジュール参照

`resolveSpecPath` のロジックは PX-49 で `scripts/lib/resolve-spec-path.js` として共通モジュール化される。本スクリプトはそれを import して使用する。PX-49 が先着手となるため、本スクリプト実装時には共通モジュールが存在していることを前提として良い。

## Test Plan

### ユニットテスト計画

テストファイル: `tests/dump-node-context-to-spec.test.cjs`

1. **正常系: チケットキーからノード詳細ブロックが生成できる**
   - モック GRAPH.json + Tickets.json を入力として `formatNodeDetailsBlock()` が正しい Markdown 表を出力する

2. **正常系: エッジ関係ブロックが正しくソート・グルーピングされる**
   - モックエッジ配列を入力として、エッジ種別ごとにグループ化され、チケット内/外の区別（★/☆）がつく

3. **正常系: ファイルパスブロックが Dirs-Tree から解決できる**
   - モック Dirs-Tree.json を入力として、`mappedNodeIds` から正しいファイルパスが解決される

4. **正常系: 空の nodeIds のチケットで処理が失敗しない**
   - nodeIds が空配列のチケットに対して、エラーを投げず何も追記しない

5. **正常系: 冪等性 — 同一セクションが既に存在する場合に追記しない**
   - 既に「設計コンテキスト:」セクションを持つ spec に対してスキップする

6. **異常系: 存在しないチケットキー → stderr にエラー出力、exit 1**
   - 不明なキーを渡すと `[ERROR]` テンプレートでエラー報告

7. **異常系: 存在しない GRAPH.json → stderr にエラー出力、exit 1**
   - グラフファイルが存在しない場合のエラーハンドリング

### ユニットテスト不可能な項目（例外）

- **spec ファイルへの実際の書き込み**: ファイルI/O を含む `appendToSpec` は単体テストではモックする。実際の書き込み確認は E2E 手動テスト

## Boy Scout Rule — 翻訳可能性計画

- **関数分割を徹底する**: `formatNodeDetailsBlock()`, `formatEdgeRelationsBlock()`, `formatFilePathsBlock()` の3関数はそれぞれ100%純粋関数（入力→Markdown文字列出力）とする。これによりテスト容易性と翻訳可能性が両立する
- **関数名は動詞句**: `collectNodeDetails()`, `resolveSpecPath()`, `formatEdgeRelationsBlock()` — 関数呼び出しの並びが処理手順の日本語訳になる
- **マジックナンバー禁止**: エッジ種別の優先順位配列、Markdown 表の列幅、見出しレベルは定数として定義する
- **ハードコード文字列の定数化**: セクション見出し文字列、凡例記号（★/☆）は定数としてスクリプト先頭に定義する

## Acceptance Criteria

- [x] 実装要件を満たしている
- [ ] `dump-node-context-to-spec.js --tickets=Tickets.json --graph=GRAPH.json --dirs-tree=Dirs-Tree.json --ticket-key=P0-1` で spec に3ブロック（ノード詳細・エッジ関係・ファイルパス）が追記される
- [ ] 各ブロックが決定論的に（実行のたびに同一内容を）生成する
- [ ] エッジブロックでチケット内ノード（★）とチケット外ノード（☆）が区別できる
- [ ] 冪等性: 同一セクションを2回追記しない
- [ ] エラー時に `[ERROR]` テンプレート（原因/対応）を stderr に出力し exit 1
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テスト（dump-ticket-graph-commands.js のテストなど）が通過している

## Notes

### 依存関係

- **PX-49** (依存: 本チケットは PX-49 で共通モジュール化された `scripts/lib/resolve-spec-path.js` を import して使用する)
- **PX-51** (被依存: 本チケットの成果物が make-ticket.md の Step 7 で使用される)

### パイプラインにおける位置づけ

```
graphify ──→ GRAPH.json
                  ↓
boundify ──→ Dirs-Tree.json
                  ↓
split ─────→ Tickets.json (with nodeIds + default_files)
                  ↓
make-ticket Step 7:
  1. dump-ticket-graph-commands.js  → query.js コマンド（PX-49）
  2. dump-node-context-to-spec.js   → ノード詳細+エッジ+ファイルパス（PX-50 ← ここ）
                  ↓
plan-ticket ──→ 計画策定（spec の全情報をもとに）
start-ticket ──→ 実装
review-ticket ─→ レビュー
```

### 関連チケット

- **PX-49** (依存: resolveSpecPath の実装パターンを参照): dump-ticket-graph-commands.js spec書き込み不能バグ修正
- **PX-51** (被依存: 本成果物を Step 7 で利用): make-ticket.md 改修
- **PX-1-42** (関連: default_files スキーマ追加): `default_files` が Tickets.json に存在する前提
- **PX-1-44〜PX-1-45** (関連: consolidate/ticketIds 生成): relatedTicketIds の機械生成ロジック

### 設計判断

- エッジブロックのソート順は **実装影響度順**（`depends_on` > `precedes` > `triggers` > ... > `part_of`）とした。上位のエッジ種別ほど実装の優先順位やブロッカーに関わるため
- Dirs-Tree の解決は `mappedNodeIds` の逆引きテーブルを構築して行う。全ツリーを再帰的に走査し、`nodeId → filePath` のマッピングを事前に構築する（毎回走査しない）
- 本スクリプトは `dump-ticket-graph-commands.js` を拡張するのではなく、独立したスクリプトとして作成する。責務が異なる（query.js コマンド生成 vs 設計コンテキスト書き出し）ため、結合すると単一責任の原則に違反する
