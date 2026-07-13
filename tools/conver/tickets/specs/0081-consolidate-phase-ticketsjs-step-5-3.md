---
ticket_id: 81
title: consolidate-phase-tickets.js -- Step 5-3 コアロジック
slug: consolidate-phase-ticketsjs-step-5-3
status: draft
created_at: 2026-07-13
updated_at: 2026-07-13
---
# consolidate-phase-tickets.js — Step 5-3 コアロジック（ガード・バリデーション・後方1パス統合・ID一括振り直し）

## Summary

`split-to-tickets.md` の Step 5-2（全フェーズのチケット化完了）後に実行する新設 Step 5-3 の中核スクリプト `consolidate-phase-tickets.js` を実装する。フェーズ内のチケット数が3未満の場合、後方から前方貪欲に次のフェーズへ全チケットを移譲（マージ）し、フェーズID・チケットIDを一括振り直す。status.json の prune/renumber までを1スクリプトで完結させる。

## Background

`siprs` crate の split-to-tickets テスト実行結果において、18フェーズ中ほぼ全フェーズが1チケットのみとなり、フェーズ区切りが意味を成さない問題が発覚した（`tools/conver/.claude/commands/split-to-tickets.md` 参照）。設計議論の結果、チケット化完了後に3未満のフェーズを自動統合する Step 5-3 をパイプラインに追加することで解決する。

**既存の仕組み**: phasify（Step 4-1）はグラフノード数に基づき `MIN_NODES_PER_PHASE=10` でフェーズ合併を行うが、この時点ではチケットが存在しないためチケット数ベースの制御は不可能。チケットが確定する Step 5-2 の後で初めて正確な判断ができる。

**関連チケット**: PX-45（relatedTicketIds 機械生成ロジック）で生成された relatedTicketIds を、ID振り直し後に再生成するために使用する。PX-46（update-split-step-status.js改修）で追加される Step 5-3 の step tracking を利用する。

**既存コードの参照箇所**:
- `add-tickets-for-phase.js` (`tools/conver/.claude/scripts/tickets/add-tickets-for-phase.js:83`) — `verifyNodeCoverage()` 関数の nodeIds 過不足検証パターンを流用する
- `phasify-graph-and-dirs-files-tree.js` (`tools/conver/.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js:44`) — `MIN_NODES_PER_PHASE=10` の定数定義
- `update-split-step-status.js` (`tools/conver/.claude/scripts/rfc-graph/update-split-step-status.js:45`) — `STEP_ORDER` 配列

## Scope

**新規スクリプト**: `.claude/scripts/tickets/consolidate-phase-tickets.js`

以下の6機能を1スクリプトに実装する（密結合のため分離不可）：

1. **5-3-1: ガード（`guardPhaseCount`）**
   - フェーズ数 < 3 なら即座に正常終了（統合対象なし）
   - メッセージ出力: `"フェーズ数が3未満のため統合処理をスキップしました"`

2. **5-3-2: バリデーション（`validateAllNodeIdsCovered`）**
   - 全フェーズの全 `phase.nodeIds` が `tickets[].nodeIds` の和集合に含まれているか確認
   - 未カバーの nodeIds があれば exit 1（エラーメッセージに不足ノード一覧）
   - `add-tickets-for-phase.js` の `verifyNodeCoverage()`（同ファイル:83）と同様のロジック

3. **5-3-3: 後方1パス統合（`consolidateFromRight`）**
   ```javascript
   for (let i = phases.length - 2; i >= 0; i--) {
     if (phases[i].tickets.length < 3) {
       // phases[i] の全チケットを phases[i+1].tickets の先頭に挿入
       // phases[i+1].name = phases[i].name + " → " + phases[i+1].name
       // phases[i+1].summary = phases[i].summary + "\n---\n" + phases[i+1].summary
       // phases[i+1].nodeIds = [...phases[i].nodeIds, ...phases[i+1].nodeIds]
       // phases[i] を削除マーク
     }
   }
   ```
   - 削除マークされたフェーズは配列から除去
   - 最終フェーズ自体が3未満でも統合対象外（後方にマージ先がないため）

4. **5-3-4: フェーズID一括振り直し（`renumberPhaseIds`）**
   - 残った全フェーズに `0, 1, 2, ...` の ID を振り直し
   - フェーズ名のプレフィックスも `P0, P1, P2, ...` に更新

5. **5-3-5: チケットID一括振り直し（`renumberTicketIds`）**
   - 全チケットの `id` を `"{newPhaseId}-{intraPhaseIndex+1}"` に更新
   - 全チケットの `phaseId` を新しいフェーズIDに更新
   - チケットの配列インデックス順（0起点）に連番を割り当て
   - PX-45 の `generateRelatedTicketIds()` を呼び出して relatedTicketIds も再生成

6. **5-3-8: 最終検証（`finalValidation`）**
   - 全フェーズのチケット数 >= 3 または最終フェーズであること
   - 全チケットの ID 形式が `P{d}-{n}` であること
   - 全チケットの phaseId が正しいこと
   - 空のチケットがないこと（ticket.nodeIds が空でない）

## Non-scope

- **relatedTicketIds の機械生成ロジック自体**: これは PX-45 のスコープ。PX-44 は PX-45 の関数を `require()` で呼び出すのみ
- **status.json の prune/renumber サブコマンド追加**: これは PX-46 のスコープ。PX-44 は `node update-split-step-status.js --status=... prune-phases` / `renumber-phases` を `child_process.spawnSync()` で呼び出す
- **split-to-tickets.md の Step 5-3 セクション追記**: PX-46 のスコープ

## Investigation

### 証拠1: 既存のフェーズ構造と問題の実例

`Tickets.json` の P0〜P21 フェーズのチケット数分布（`tools/conver/Tickets.json`）:

| フェーズ | チケット数 |
|---------|-----------|
| P0 | 3 |
| P1 | 1 ← 閾値未満 |
| P2 | 1 ← 閾値未満 |
| P3 | 1 ← 閾値未満 |
| P4 | 3 |
| P5 | 5 |
| P6 | 2 ← 閾値未満 |
| P7 | 2 ← 閾値未満 |
| P8 | 3 |
| P9〜P11 | 各1 ← 閾値未満 |
| P12 | 2 ← 閾値未満 |
| P13〜P21 | ほとんどが1 ← 閾値未満 |

統合すると P0〜P21 が P0〜P8 程度に圧縮される見込み。

### 証拠2: 既存の検証パターン

`add-tickets-for-phase.js:83-117` の `verifyNodeCoverage()` 関数が行う nodeIds 過不足検証:

```javascript
function verifyNodeCoverage(phase) {
  const phaseNodeIds = new Set(phase.nodeIds || []);
  const coveredNodeIds = new Set();
  for (const ticket of (phase.tickets || [])) {
    if (Array.isArray(ticket.nodeIds) && ticket.nodeIds.length > 0) {
      for (const nodeId of ticket.nodeIds) {
        coveredNodeIds.add(nodeId);
      }
    }
  }
  const missingNodeIds = phaseNodeIds.difference(coveredNodeIds);
  const valid = missingNodeIds.length === 0;
  return { valid, missingNodeIds, extraNodeIds, ticketsWithoutNodeIds };
}
```

### 証拠3: STEP_ORDER の現在の定義

`update-split-step-status.js:45-52`:

```javascript
const STEP_ORDER = [
  '0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '6',
];
```

5-3 追加後の新しい STEP_ORDER:
```javascript
const STEP_ORDER = [
  '0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '5-3', '6',
];
```

## Test Plan

### ユニットテスト計画

`tools/conver/tests/` 配下に CommonJS（`.test.cjs`）形式で作成する。

| # | テスト関数 | 正常系 | 異常系 | 境界値 |
|---|-----------|--------|--------|--------|
| 1 | `guardPhaseCount` | 5フェーズ → 実行継続 | — | 3フェーズ（通過）、2フェーズ（スキップ）、1フェーズ（スキップ）、0フェーズ（スキップ） |
| 2 | `validateAllNodeIdsCovered` | 全 nodeIds カバー済み → true | 未カバーの nodeIds あり → false + 不足一覧 | 空の nodeIds、チケットなしのフェーズ |
| 3 | `consolidateFromRight` | 3未満フェーズを後方統合 → 全フェーズ3以上 | 全フェーズ既に3以上 → 変更なし | 最終フェーズが3未満（変更なし）、全フェーズ3未満（1フェーズに集約） |
| 4 | `renumberPhaseIds` | P0,P1,P2... に振り直し | 空の配列（何もしない） | 1フェーズのみ（P0になる） |
| 5 | `renumberTicketIds` | id/phaseId が正しく振り直される | — | チケット0個のフェーズ（何もしない） |
| 6 | `finalValidation` | 全条件満たす → true | 3未満フェーズあり → false | 空のフェーズ配列（true? or false?）→ 仕様として true を選択 |

**カバレッジ目標**: クリティカルパス（統合ロジック + ID振り直し）は 95%以上。全体で 85%以上。

**テストファイル**: `tests/consolidate-phase-tickets.test.cjs`

### ユニットテスト不可能な項目（例外）

- status.json の実ファイル操作（prune/renumber の spawnSync 呼び出し）: モックで代替する
- `generateRelatedTicketIds()` の呼び出し（PX-45 の成果物）: モック関数で代替する

## Boy Scout Rule — 翻訳可能性計画

**新規スクリプト**のため、以下の設計を初めから適用する：

- **関数名は動詞句**: `guardPhaseCount`, `validateAllNodeIdsCovered`, `consolidateFromRight`, `renumberPhaseIds`, `renumberTicketIds`, `finalValidation` — 各関数の呼び出しが処理の流れを散文として語るように構成
- **一関数一責務**: 上記6関数はそれぞれ単一責務。統合・ID振り直しは密結合だが、関数単位で分離する
- **定数は名前付き**: `MIN_TICKETS_PER_PHASE = 3`, `PHASE_ID_PREFIX = "P"` 等はハードコードせず const で定義
- **エラー握りつぶし禁止**: すべてのエラーは適切なエラーメッセージと exit code 1 で報告
- **コメントは「なぜ」**: 後方1パスを選んだ理由（前方マージだとカスケードが複雑になる）をコメントに記述

## Acceptance Criteria

- [ ] `consolidate-phase-tickets.js` が新規作成され、6機能すべてが実装されている
- [ ] Tickets.json のパスと status.json のパスを引数で受け取れる
- [ ] 実際の Tickets.json（P0-P21）に対して統合テストが成功する
- [ ] 3未満チケットのフェーズが存在しない場合、何も変更せず正常終了する
- [ ] ID振り直し後にチケットIDの飛び番・重複がない
- [ ] status.json の prune/renumber が正しく動作する
- [ ] すべてのユニットテストが PASS する（`node tests/consolidate-phase-tickets.test.cjs`）
- [ ] PX-45 の関数を `require()` で呼び出せる（モジュール結合）
- [ ] PX-46 の update-split-step-status.js サブコマンドを `spawnSync` で呼び出せる
- [ ] 翻訳可能性の検証（関数名が動詞句であること）が通っている
