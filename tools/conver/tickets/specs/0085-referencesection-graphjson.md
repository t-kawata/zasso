---
ticket_id: 85
title: referenceSection 機械生成 — GRAPH.json ノードの § マーカーから自動設定
slug: referencesection-graphjson
status: draft
created_at: 2026-07-13
updated_at: 2026-07-13
---
# referenceSection 機械生成 — GRAPH.json ノードの § マーカーから自動設定

## Summary

`add-tickets-for-phase.js` に GRAPH.json のパスを第4引数として追加し、各チケットの `nodeIds` から GRAPH.json のノード `title` に含まれる `§` マーカーを抽出して `referenceSection` を自動設定する。現在 AI 手書きで行われている `referenceSection` の生成を完全決定論的に置き換える。

## Background

Step 5-2 で AI が `referenceSection` を手書きしているが、以下の問題がある：

- **セクション番号の漏れ**: AI がノード一覧から一部のセクションを見落とす
- **セクション番号の誤記**: 存在しないセクション番号や誤った番号が混入
- **余計な文脈テキスト**: "M20追補: ..." のような非機械的情報が混入し、形式が不統一
- **決定論的でない**: 同じ入力でも AI の気分で出力が変わる

一方、GRAPH.json の各ノード `title` には `§1`, `§6.1`, `§27a` のようなセクションマーカーが含まれており、チケットの `nodeIds` から一意に決定できる。

**調査結果（siprs crate 実データ）**:
- 全176ノード中152ノードが `title` に `§` マーカーを持つ（86%）
- `§` を持たない24ノードは "M20 追補: ..." 等の追補ノード
- 機械生成と AI 生成を比較した結果、**セクション番号は完全一致**（5/8フェーズで完全一致、残り3フェーズも機械生成の方が § 番号のみ純粋に正確で、AI の「M20追補:」等の余計なテキストが入らない）

### 既存コードの参照箇所

- `add-tickets-for-phase.js` (`tools/conver/.claude/scripts/tickets/add-tickets-for-phase.js:129-145`) — `parseCliArguments` の現在のシグネチャ（Tickets.json, Dirs-Tree.json, P{id} の3引数）
- `add-tickets-for-phase.js:47-63` — `resolveDefaultFiles` の自動解決パターン（同様の機械設定ロジック）
- `bulkAddTickets.js:36-38` — チケット追加処理（`...batch.tickets[i]` で渡されたフィールドを透過保存）
- `split-to-tickets.md:365-369` — Step 5-2 の CLI 呼び出し（現在3引数）

## Scope

### 1. `add-tickets-for-phase.js` の改修

**1-a. CLI 第4引数に GRAPH.json のパスを追加**

```javascript
function parseCliArguments(argv) {
  const ticketsJsonPath = argv[2] || null;
  const dirsTreePath = argv[3] || null;
  const phaseArg = argv[4] || null;
  const graphPath = argv[5] || null;  // ← 新規: 省略可能（後方互換）
  // ...
  return { ticketsJsonPath, dirsTreePath, phaseArg, graphPath, error: null };
}
```

省略時は従来通りの動作（AI の referenceSection をそのまま使う）。

**1-b. `resolveReferenceSection` 純粋関数の実装**

```javascript
/**
 * チケットの nodeIds から GRAPH.json のノード title の § マーカーを抽出して
 * referenceSection を生成する。
 *
 * @param {string[]} nodeIds — チケットに属するノードID配列
 * @param {Object[]} graphNodes — GRAPH.json の nodes 配列
 * @param {string} sourceFile — GRAPH.json の sourceFile（RFCファイル名、拡張子除去）
 * @returns {string} 生成された referenceSection（例: "RFC-ROOT.md (§1, §1a, §2)"）
 */
function resolveReferenceSection(nodeIds, graphNodes, sourceFile) {
  const sections = new Set();
  for (const nodeId of (nodeIds || [])) {
    const node = graphNodes.find(function(n) { return n.id === nodeId; });
    if (!node) continue;
    const match = node.title.match(/§[0-9]+(?:\.[0-9]+)?[a-z]?/);
    if (match) sections.add(match[0]);
  }
  if (sections.size === 0) return '';
  const sorted = Array.from(sections).sort(function(a, b) {
    const anum = parseFloat(a.replace(/[^0-9.]/g, '')) || 0;
    const bnum = parseFloat(b.replace(/[^0-9.]/g, '')) || 0;
    if (anum !== bnum) return anum - bnum;
    // 同一数値の接尾辞比較（§1a と §1 等）
    const asuf = a.match(/[a-z]$/) ? a.slice(-1) : '';
    const bsuf = b.match(/[a-z]$/) ? b.slice(-1) : '';
    return asuf.localeCompare(bsuf);
  });
  const basename = sourceFile.replace(/\.md$/, '');
  return basename + ' (' + sorted.join(', ') + ')';
}
```

**1-c. `add-tickets-for-phase.js` の main() に統合**

`resolveDefaultFiles` と同じタイミング（Dirs-Tree 読込後）で GRAPH.json を読み込み、各チケットに `referenceSection` を設定する：

```javascript
// 3b. GRAPH.json から referenceSection を自動生成
let graphNodes = [];
let sourceFile = '';
if (parsed.graphPath && fs.existsSync(parsed.graphPath)) {
  try {
    const graphData = JSON.parse(fs.readFileSync(parsed.graphPath, 'utf8'));
    graphNodes = graphData.nodes || [];
    sourceFile = graphData.sourceFile || '';
    for (const ticket of ticketsInput) {
      const refSection = resolveReferenceSection(ticket.nodeIds, graphNodes, sourceFile);
      if (refSection) {
        ticket.referenceSection = refSection;
      }
    }
  } catch (_) {
    // GRAPH.json 読み込み失敗時は AI の入力をそのまま使う（後方互換）
  }
}
```

**重要な設計判断**: AI が既に `referenceSection` を含めてきた場合でも、機械生成で**上書きする**（機械生成の方が正確なため）。ユーザーが手動で設定したい場合は GRAPH.json を指定しない。

### 2. `split-to-tickets.md` の改修

Step 5-2 の CLI 呼び出し（`split-to-tickets.md:365-369`）に GRAPH.json パスを追加：

```bash
echo '<tickets-array-json>' | node .claude/scripts/tickets/add-tickets-for-phase.js \
  "$TICKETS_PATH" \
  "$DIRS_TREE_PATH" \
  "P{n}" \
  "$GRAPH_PATH"
```

`$GRAPH_PATH` の導出方法を Step 0（変数定義）に記載する：

```bash
GRAPH_PATH="$(dirname "$TICKETS_PATH")/$(basename "$TICKETS_PATH" | sed 's/Tickets\.json$//')-GRAPH.json"
# または: RFC_ROOT.md から逆算
GRAPH_PATH="$(dirname "$TICKETS_PATH")/RFC_ROOT-GRAPH.json"
```

## Non-scope

- `bulkAddTickets.js` の改修: `add-tickets-for-phase.js` が入力を処理してから `bulkAddTickets` を呼ぶため、bulkAddTickets 側の改修は不要。
- 既存チケットの referenceSection 書き換え: 本チケットは生成ロジックの追加のみ。既存データの一括書き換えは含まない。
- `relatedTicketIds` と同様の複合キー問題: 該当しない（referenceSection はチケットごとの独立 prose）。
- `§` マーカーを持たないノードの対応: 対象ノードがチケットに含まれる場合、`referenceSection` は空文字列になる（従来の AI 生成の方がマシなケースがある）。GRAPH.json 指定時に AI の入力を優先するかどうかは別チケットで検討。

## Investigation

### 証拠1: GRAPH.json のノード title に § マーカーが含まれている

siprs crate の実データ:

```
N0001: "§1 目的 — 本crateの責務定義"              → §1
N0002: "§1a M20実装優先度マップ"                    → §1a
N0003: "§1a 設計判断対応表"                           → §1a
N0004: "§2 非目的"                                    → §2
N0005: "§2.1 Tauri統合との責務境界"                  → §2.1
...
全176ノード中152ノードが § マーカーを持つ（86%）
```

正規表現: `/§[0-9]+(?:\.[0-9]+)?[a-z]?/` で全て抽出可能。

### 証拠2: § を持たないノードの実態

全24ノードが "M20 追補: ..." 形式。これらは元の RFC に後から追加された追補セクションで、通常の § 番号体系に含まれない。`referenceSection` が空になるが、これらだけで構成されるチケットは稀（176ノード中24ノード = 14%）。

### 証拠3: 既存の自動解決パターン（resolveDefaultFiles）

`add-tickets-for-phase.js:47-63` に `resolveDefaultFiles` 関数が既に存在する。同じパターン（引数追加 + nodeIds ループ + 設定）で実装可能。

```javascript
function resolveDefaultFiles(tickets, nodeToDirMap) {
  for (const ticket of tickets) {
    const paths = new Set();
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        const resolvedPath = nodeToDirMap[nodeId];
        if (resolvedPath) paths.add(resolvedPath);
      }
    }
    if (paths.size > 0) ticket.default_files = Array.from(paths).sort();
  }
}
```

このパターンを `resolveReferenceSection` で踏襲する。

### 証拠4: AI 生成と機械生成の比較（siprs 実データ）

| Phase | AI生成 | 機械生成 | 判定 |
|-------|--------|---------|------|
| P0 | `§1, §1a, §2, §4, §4.1, §5` | `§1, §1a, §2, §4, §4.1, §5` | ✅ 一致 |
| P1 | `§14, §14.1, M20追補: ...` | `§14, §14.1` | 機械の方が純粋に正確 |
| P4 | `§41.3, §41.4, §41.5, §42` | `§41.3, §41.4, §41.5, §42` | ✅ 一致 |
| P5 | `§15.4, §19, §22, §39` | `§15.4, §19, §22, §39` | ✅ 一致 |
| P6 | `§8.2, §11.1, §27.1` | `§8.2, §11.1, §27.1` | ✅ 一致 |

セクション番号の精度は機械生成が上回る（余計なテキストが入らない）。

## Test Plan

### ユニットテスト計画

**新規テストファイル**: `tests/resolve-reference-section.test.cjs`

| # | テストケース | 入力 | 期待出力 |
|---|-------------|------|---------|
| 1 | 単一ノード § 抽出 | nodeIds=["N0001"], nodes=[{id:"N0001", title:"§1 目的"}], sourceFile="RFC-ROOT.md" | "RFC-ROOT.md (§1)" |
| 2 | 複数ノード § 抽出・ソート | nodeIds=["N0005","N0001"], nodes=[...] | "RFC-ROOT.md (§1, §2.1)" |
| 3 | 重複 § の除去 | 2ノードが同一 § を持つ | 重複なし |
| 4 | § なしノード | nodeIds=["N0030"], title="M20 追補: ..." | ""（空文字列） |
| 5 | 存在しない nodeId | nodeIds=["NX000"] | ""（スキップ） |
| 6 | 空の nodeIds | nodeIds=[] | "" |
| 7 | ソート順の正確性 | §1, §1a, §2, §10 | "RFC-ROOT.md (§1, §1a, §2, §10)" |
| 8 | sourceFile の .md 除去 | sourceFile="path/RFC-ROOT.md" | "path/RFC-ROOT (§1)" |
| 9 | 引数不足（GRAPH.json なし） | graphPath=null | 既存動作維持（何もしない） |

**カバレッジ目標**: 純粋関数のため 100%（全分岐・全ソートケース）。

### ユニットテスト不可能な項目（例外）

- 実ファイル操作（GRAPH.json の読み込み）: テストではモックデータを直接 `resolveReferenceSection` に渡す
- split-to-tickets.md の Markdown 更新: 目視確認

## Boy Scout Rule — 翻訳可能性計画

**新規関数 `resolveReferenceSection`**:

- **関数名**: `resolveReferenceSection` — 「参照セクションを解決する」と逐語訳可能
- **内部変数**: `sections`（Set）— 抽出した § マーカーの集合。`sorted` — ソート済み配列
- **ソート関数**: コメントで「§1, §1a, §2, §10 のように数値→接尾辞順」と意図を記述
- **エラー握りつぶし禁止**: GRAPH.json の読み込み失敗は catch して空配列にするが、その際に console.warn で警告を出す
- **定数**: `SECTION_PATTERN = /§[0-9]+(?:\.[0-9]+)?[a-z]?/` を名前付きで定義

## Acceptance Criteria

- [ ] `add-tickets-for-phase.js` が第4引数 `GRAPH.json` を受け付け、省略時は従来動作を維持する
- [ ] `resolveReferenceSection` が純粋関数として実装され、全テストケースを PASS する
- [ ] 実際の siprs GRAPH.json に対して、機械生成された referenceSection がセクション番号で AI 生成を上回る精度である
- [ ] `split-to-tickets.md` の Step 5-2 CLI 呼び出しに GRAPH.json パスが追加されている
- [ ] 既存3テストスイートがすべて PASS する（174/174）
- [ ] `§` を持たないノードのみで構成されたチケットの referenceSection は空文字列になる（妥当な fallback）
