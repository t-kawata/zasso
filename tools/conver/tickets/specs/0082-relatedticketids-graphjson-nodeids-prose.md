---
ticket_id: 82
title: relatedTicketIds 機械生成ロジック -- GRAPH.json × nodeIds 直積 + prose整形
slug: relatedticketids-graphjson-nodeids-prose
status: draft
created_at: 2026-07-13
updated_at: 2026-07-13
---
# relatedTicketIds 機械生成ロジック — GRAPH.json × nodeIds 直積 + prose整形

## Summary

GRAPH.json の edges と Tickets.json の各チケットが持つ `nodeIds` の直積から、機械的かつ完全に correct な `relatedTicketIds`（prose 文字列）を生成する関数 `generateRelatedTicketIds()` を実装する。自己参照（同一チケット内のノード間エッジ）はスキップする。ticket.id の変更後も GRAPH.json は不変のため再実行で自動追従する。

## Background

現在の `relatedTicketIds` は AI が手書きする prose 文字列であり、以下の問題がある：

- **精度問題**: AI の hallucination により存在しないチケットへの参照や誤った依存方向が混入する可能性がある（`tools/conver/Tickets.json` の既存チケットで確認）
- **維持問題**: チケットIDが振り直された後も古いIDが残り続ける（手動修正が必要）
- **網羅性問題**: AI が見落とした依存関係が relatedTicketIds に反映されない

一方、GRAPH.json の `edges` 配列は RFC から機械生成された静的な事実であり、各エッジは `{from, to, type}` の3フィールドを持つ。各チケットの `nodeIds` はフェーズ内ノードの割り当てを記録した確定値である。両者の直積（SQL で言う JOIN）は完全決定論的であり、AI の判断が入る余地がない。

**既存コードの参照箇所**:
- GRAPH.json の edge 形式: `{from: "N0001", to: "N0003", type: "depends_on"}`（全エッジ種別は phasify-helpers.js の `WEIGHT_MAP` で確認可能）
- チケットの nodeIds: `Tickets.json` の各 ticket.nodeIds 配列
- relatedTicketIds の既存 prose 例: `"P0-2 (依存: エラー型 CryptoError の定義), PX-YY (Ed448ライブラリラッパー, 先行実装必須), P0-4 (被依存: Session管理)"`

## Scope

1. **`generateRelatedTicketIds(tickets, graphEdges)` 純粋関数の実装**
   - 入力: `tickets: Array<{id, nodeIds}>`, `graphEdges: Array<{from, to, type}>`
   - 出力: `Map<ticketId, string>` — 各チケットIDをキーとする prose 文字列のマップ
   - アルゴリズム:
     ```javascript
     function generateRelatedTicketIds(tickets, graphEdges) {
       const result = new Map();
       // 事前準備: nodeId → ticketId の逆引きマップ
       const nodeToTicket = {};
       for (const ticket of tickets) {
         for (const nodeId of (ticket.nodeIds || [])) {
           nodeToTicket[nodeId] = ticket.id;
         }
       }
       // 各チケットについて、その nodeIds から出る/入るエッジを走査
       for (const ticket of tickets) {
         const relations = [];
         for (const edge of graphEdges) {
           const isFrom = ticket.nodeIds.includes(edge.from);
           const isTo = ticket.nodeIds.includes(edge.to);
           if (!isFrom && !isTo) continue; // 無関係のエッジ
           // 自己参照ガード: 両端点とも同一チケット内ならスキップ
           const targetNodeId = isFrom ? edge.to : edge.from;
           const targetTicketId = nodeToTicket[targetNodeId];
           if (!targetTicketId || targetTicketId === ticket.id) continue;
           const direction = isFrom ? "依存先" : "被依存元（依存元）";
           const targetTitle = tickets.find(t => t.id === targetTicketId)?.title || "";
           relations.push(`[${edge.type}] ${targetTicketId} (${direction}: ${targetTitle})`);
         }
         if (relations.length > 0) {
           result.set(ticket.id, relations.join(", "));
         }
       }
       return result;
     }
     ```

2. **出力 prose フォーマット**
   ```
   [depends_on] P1-2 (依存先: エラー型 CryptoError の定義), [refines] P2-1 (被依存元（依存元）: Session管理)
   ```
   - 各エントリ: `[edge_type] ticketId (direction: ticket.title)`
   - 複数エントリは ", " で連結
   - エントリがないチケットは空文字列（relatedTicketIds を設定しない）

3. **自己参照ガード**
   - エッジの両端点（from と to）が同一チケットの nodeIds に含まれる場合、そのエッジは relatedTicketIds に含めない
   - 例: チケット P3-1 が nodeIds = ["N0007", "N0009"] を持ち、エッジ N0007→N0009 が存在する場合 → P3-1 の relatedTicketIds には出力しない

4. **ID振り直し後の再実行**
   - GRAPH.json は不変のため、ID振り直し後も edge の from/to は変わらない
   - nodeToTicket マップを新しい ticket.id で再構築すれば常に最新のチケットIDが出力される
   - 再実行で古いIDのゴミが残ることが絶対にない

## Non-scope

- **consolidate-phase-tickets.js への統合**: PX-44 が本関数を `require()` で読み込む呼び出し元となる
- **relatedTicketIds のスキーマ変更**: 現在 prose（文字列）のままで、配列化は行わない
- **既存チケットの relatedTicketIds クリア**: 本スクリプト初回実行時に既存の relatedTicketIds を上書きするが、それは呼び出し元の責任

## Investigation

### 証拠1: GRAPH.json の edge 形式

phasify-helpers.js の `WEIGHT_MAP` 定義より、全エッジ種別:

| エッジ種別 | 重み | ハード制約 |
|-----------|------|-----------|
| `depends_on` | Infinity | yes |
| `implements` | Infinity | yes |
| `constrains` | Infinity | yes |
| `refines` | 50 | no |
| `references` | 10 | no |
| `relates_to` | 5 | no |
| `alternative_to` | 1 | no |

全てのエッジ種別が relatedTicketIds の出力対象となる。

### 証拠2: 既存 relatedTicketIds の prose フォーマット例

`Tickets.json` の PXフェーズ内既存チケットより:

```json
"relatedTicketIds": "P0-2 (依存: エラー型 CryptoError の定義), PX-YY (Ed448ライブラリラッパー, 先行実装必須), P0-4 (被依存: Session管理が本チケットの Token を入力として使用)"
```

機械生成後は以下のフォーマットに統一する：

```
[depends_on] P1-2 (依存先: エラー型 CryptoError の定義), [refines] P0-4 (被依存元（依存元）: Session管理)
```

- `[]` 内が edge type（機械的に correct）
- `()` 内が方向とタイトル（機械的に解決）
- 「依存先」= 自チケット→他チケット方向、「被依存元（依存元）」= 他チケット→自チケット方向

### 証拠3: ID振り直しとの関係（冪等性の保証）

```javascript
// 入力: GRAPH.json edges（不変）
edges = [
  {from: "N0001", to: "N0003", type: "depends_on"},
  {from: "N0005", to: "N0002", type: "refines"}
];

// 1回目: チケット ID = {"P0-1", "P0-2", ...} に対する relatedTicketIds を生成
// ID振り直し後:
// 2回目: チケット ID = {"P0-1", ...}（新しいID）に対する relatedTicketIds を再生成
// GRAPH.json の edges は不変なので、
// 1回目と2回目で論理的に同じ関係性を異なるチケットIDで表現できる
```

## Test Plan

### ユニットテスト計画

`tools/conver/tests/` 配下に CommonJS（`.test.cjs`）形式で作成する。

| # | テストケース | 入力 | 期待出力 |
|---|-------------|------|---------|
| 1 | 単一エッジ: same-ticket | チケットP0-1(nodeIds=[N1,N2]), edge N1→N2 | 空（自己参照ガードでスキップ） |
| 2 | 単一エッジ: cross-ticket | チケットP0-1(nodeIds=[N1]), P1-1(nodeIds=[N2]), edge N1→N2(depends_on) | P0-1: "[depends_on] P1-1 (依存先: ...)", P1-1: "[depends_on] P0-1 (被依存元（依存元）: ...)" |
| 3 | 複数エッジ: cross-ticket | 同上 + edge N1→N3(refines), N3∈P2-1 | P0-1: "[depends_on] P1-1, [refines] P2-1" |
| 4 | 無関係エッジ | エッジの両端点がどのチケットのnodeIdsにも含まれない | 空マップ |
| 5 | 空の nodeIds | チケットが nodeIds=[] を持つ | そのチケットの relatedTicketIds は空 |
| 6 | 空の edges | edges=[] | 全チケットの relatedTicketIds は空 |
| 7 | ID振り直し後 | 同じ GRAPH.json で新しい ticket.id で再実行 | 新しいIDで正しく出力される |
| 8 | 方向の正確性 | edge N1→N2: P0-1がN1、P1-1がN2 | P0-1に "依存先"、P1-1に "被依存元（依存元）" |

**カバレッジ目標**: 純粋関数のため 100% を目標とする。全分岐・全エッジケースをカバー。

**テストファイル**: `tests/generate-related-ticket-ids.test.cjs`

### ユニットテスト不可能な項目（例外）

なし。本関数は純粋関数（副作用ゼロ）であり、すべてのロジックをユニットテストで検証可能。

## Boy Scout Rule — 翻訳可能性計画

**新規ユーティリティ関数**のため、以下を初めから適用：

- **関数名**: `generateRelatedTicketIds(tickets, graphEdges)` — 「関連チケットIDを生成する」と逐語訳可能
- **内部ヘルパー**: `buildNodeToTicketMap(tickets)`, `formatRelationEntry(edgeType, ticketId, direction, title)`, `collectEdgesForTicket(ticket, graphEdges, nodeToTicket)` に分割
- **定数**: `SELF_REFERENCE_SKIP_REASON`, `DIRECTION_DEPENDENCY`, `DIRECTION_DEPENDENT` 等は名前付き定数
- **コメント**: 自己参照ガードの必要性（同一チケット内エッジが relatedTicketIds に入ると自分への参照になって意味を成さない）をコメントに記述

## Acceptance Criteria

- [ ] `generateRelatedTicketIds()` が純粋関数として実装されている
- [ ] 自己参照エッジが正しくスキップされる
- [ ] 方向（依存先／被依存元）が正しく出力される
- [ ] 複数エッジが ", " で正しく連結される
- [ ] 空の nodeIds / edges でエラーにならない
- [ ] すべてのユニットテストが PASS する
- [ ] PX-44 から `require()` で読み込めるモジュールとして export されている
- [ ] 既存の relatedTicketIds（prose）のスキーマを変更しない
- [ ] 翻訳可能性の検証が通っている
