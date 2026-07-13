---
ticket_id: 84
title: ticket.id 型統一 — string→integer 修正 + Phase name 保存 + 表示修正
slug: ticketid-stringinteger-phase-name
status: draft
created_at: 2026-07-13
updated_at: 2026-07-13
---
# ticket.id 型統一 — string→integer 修正 + Phase name 保存 + 表示修正

## Summary

`tickets-schema.json` で `ticket.id` は `{ type: "integer", minimum: 1 }` と定義されているにも関わらず、
Step 5-3 の処理後に `"P0-1"` のような文字列IDが生成されるスキーマ違反を3ファイルにわたって修正する。
同時に、統合後に Phase name が消し飛ぶ問題（`renumberPhaseIds`）と、表示が二重接頭辞になる問題
（`list-phases-and-tickets.js`）も一括修正する。

## Background

`siprs` crate での split-to-tickets テスト結果において、以下の3つの問題が同時に発覚した：

**問題A — ticket.id が文字列になる（スキーマ違反）**: `siprs/Tickets.json` のチケットIDが `"P0-1"`
（string）であり、`tickets-schema.json` の `{ type: "integer" }` に違反している。
`tools/conver/Tickets.json` の既存チケットは `id: 1`（number）で正しい。

**問題B — Phase name が消し飛ぶ**: `consolidateFromRight` で正しく結合された name が、
直後の `renumberPhaseIds` で `name: PHASE_ID_PREFIX + index` により `"P0"` に上書きされる。

**問題C — 表示が二重接頭辞になる**: `list-phases-and-tickets.js` が `phaseLabel + '-' + t.id` で
表示するが、`t.id` が既に `"P0-1"` 形式のため `"P0-P0-1"` となる。

根本原因は3箇所：

| # | ファイル | 行 | 問題 |
|---|---------|-----|------|
| 1 | `bulk-add-tickets.js` | 38 | `...batch.tickets[i]` のスプレッドが auto 数値IDを上書き |
| 2 | `consolidate-phase-tickets.js` | 252 | `name: PHASE_ID_PREFIX + index` が統合済みnameを上書き |
| 3 | `consolidate-phase-tickets.js` | 285 | `phasePrefix + '-' + (index + 1)` が文字列IDを生成 |

`list-phases-and-tickets.js` の問題（`phaseLabel + '-' + t.id`）は、問題A/3を修正して
`t.id` が数値に戻れば自動的に解決するため、単独修正は不要。

## Scope

### 修正1: `bulk-add-tickets.js` L38 — スプレッド順序の修正

```javascript
// 修正前（auto 数値ID を AI の id が上書き）
const ticket = { id: ticketId, phaseId: phase.id, status: 'todo', ...batch.tickets[i] };

// 修正後（...spread の後に id を再代入して auto 数値IDを確定）
const ticket = { ...batch.tickets[i], id: ticketId, phaseId: phase.id, status: 'todo' };
```

これにより、AI がチケットJSONに `"id": "P0-1"` を含めても、自動生成された数値 `ticketId` が優先される。

### 修正2: `consolidate-phase-tickets.js` L252 — Phase name 保存

```javascript
// 修正前
return {
  ...phase,
  id: index,
  name: PHASE_ID_PREFIX + index,  // ← 統合済みnameを上書き
};

// 修正後
return {
  ...phase,
  id: index,
  // name は ...phase でそのまま維持（consolidateFromRight が結合済み）
};
```

`...phase` で既に name がコピーされているため、明示的な `name:` 代入は不要かつ有害。

### 修正3: `consolidate-phase-tickets.js` L285 — 数値ID生成

```javascript
// 修正前
id: phasePrefix + '-' + (index + 1),  // → "P0-1" (string)

// 修正後
id: index + 1,  // → 1 (integer) — スキーマ準拠
```

合わせて、コメントも修正する（「id の形式: {PHASE_ID_PREFIX}{phaseId}-{intraPhaseIndex + 1}」→「id: phaseId 内の連番（1始まり integer）」）。

### 確認: `list-phases-and-tickets.js` L13

`phaseLabel + '-' + t.id` は、`t.id` が数値（`1`）に戻れば正しく `"P0-1"` と表示されるため、**ソースコードの修正不要**。ただしテストで表示フォーマットを確認する。

## Non-scope

- **siprs の Tickets.json 修正**: 本チケットはコード修正が目的。siprs の既存Tickets.json のチケットIDは、次回の split-to-tickets 再実行時に正しく生成される。
- **split-to-tickets.md の AI プロンプト修正**: AI がチケットに `id` を含めても自動的に無視されるようになるため、プロンプト修正は不要。

## Investigation

### 証拠1: 既存 Tickets.json は数値IDで正しい

```javascript
// tools/conver/Tickets.json
PX phase ticket[0].id: 1  (number) ✅ スキーマ準拠
P0 phase ticket[0].id: 1  (number) ✅ スキーマ準拠

// crates/siprs/Tickets.json（split-to-tickets 出力）
siprs ticket[0].id: "P0-1"  (string) ❌ スキーマ違反
```

### 証拠2: bulkAddTickets.js L38 — スプレッド上書き

```javascript
const ticket = { id: ticketId, phaseId: phase.id, status: 'todo', ...batch.tickets[i] };
```

`...batch.tickets[i]` が右端にあるため、AIが `{ "id": "P0-1", ... }` を含めると
`id: ticketId`（数値）が `id: "P0-1"`（文字列）で上書きされる。

**修正**: スプレッドを先に展開し、`id: ticketId` で確定する。

### 証拠3: consolidate-phase-tickets.js L252 — name 上書き

```javascript
return {
  ...phase,       // ここで phase.name（結合済み）がコピーされる
  id: index,
  name: PHASE_ID_PREFIX + index,  // ← 上書き！ "P0" になってしまう
};
```

`...phase` が先に name をコピーしているが、後続の `name: PHASE_ID_PREFIX + index` で上書きされる。

**修正**: `name:` 代入行を削除。`...phase` の name をそのまま生かす。

### 証拠4: consolidate-phase-tickets.js L285 — 文字列ID生成

```javascript
const phasePrefix = PHASE_ID_PREFIX + newPhaseId;  // "P0"
id: phasePrefix + '-' + (index + 1),  // → "P0-1" (string)
```

**修正**: `id: index + 1` で数値IDを生成する（スキーマ準拠）。

### 証拠5: tickets-schema.json の型定義

```json
"ticket": { "properties": {
  "id": { "type": "integer", "minimum": 1, "description": "フェーズ内のチケット番号（1始まり自動インクリメント）" },
  "phaseId": { "type": "integer", "minimum": -1 },
  ...
}}
```

`id` は `integer` が必須。文字列はスキーマ違反でバリデーションエラーとなる。

### 証拠6: consolidateFromRight が生成する name の形式

```javascript
// consolidateFromRight
next.name = current.name + ' → ' + next.name;
```

例: `"P0" + " → " + "P1"` → `"P0 → P1"`（統合後の正しい結合名）。
この直後に `renumberPhaseIds` が `"P0"` に上書きするため、結合名が消失する。

## Test Plan

### ユニットテスト計画

既存の3テストスイート（172ケース）すべてが修正後に PASS し、かつ以下の新規確認を追加する。

**既存テスト（影響評価）**:

| テストスイート | 影響ケース | 修正内容 |
|--------------|-----------|---------|
| `consolidate-phase-tickets.test.cjs` | `renumberTicketIds` テスト（約6ケース） | 期待値を `id: "P0-1"` → `id: 1`（数値）に変更 |
| `consolidate-phase-tickets.test.cjs` | `renumberPhaseIds` テスト（約2ケース） | name が上書きされないことを確認するアサーション追加 |
| `bulk-add-tickets.test.cjs`（存在すれば） | — | 既存があれば期待値確認 |
| `update-split-step-status-5-3.test.cjs` | なし | 影響を受けない |
| `generate-related-ticket-ids.test.cjs` | なし | 影響を受けない |

**新規確認ケース**:

| # | テスト内容 | 検証方法 |
|---|-----------|---------|
| 1 | `renumberTicketIds` が数値IDを生成する | `typeof ticket.id === 'number'` と `ticket.id >= 1` を確認 |
| 2 | `renumberPhaseIds` が name を上書きしない | 入力の name が出力でも維持されることを確認 |
| 3 | `bulkAddTickets` で AI の string id が無視される | 入力に `{ id: "P0-999" }` を含めても出力は auto 数値IDになる |
| 4 | `list-phases-and-tickets.js` 表示が正しい | 数値ID → `"P0-1"` 形式で表示される |

**カバレッジ目標**: 修正3行の影響を全分岐確認。クリティカルパスは 100%。

### ユニットテスト不可能な項目（例外）

- `list-phases-and-tickets.js` の表示確認: 標準出力のフォーマットは目視確認可能だが、`bulkAddTickets` と `renumberTicketIds` で数値IDに戻れば自動的に解決するため単体テスト不要。

## Boy Scout Rule — 翻訳可能性計画

**修正対象の既存コード**:

1. **`bulk-add-tickets.js` L38**: スプレッド順序の1行修正のみ。関数名・変数名は既に適切。修正後も翻訳可能性に影響なし。

2. **`consolidate-phase-tickets.js` L252**: `name:` 行削除のみ。
   - `renumberPhaseIds` のJSDocコメントに「name は変更しない」旨を追記する（現状のコメントは ID の話のみ）。

3. **`consolidate-phase-tickets.js` L285**: ID 生成を数値化。
   - 関数冒頭のコメント `id の形式: "{PHASE_ID_PREFIX}{phaseId}-{intraPhaseIndex + 1}"` を
     `id: phaseId 内の連番（1始まり integer、スキーマ準拠）` に修正。
   - `phasePrefix` 変数が不要になるため削除する（未使用変数除去）。

## Acceptance Criteria

- [ ] `bulkAddTickets.js` で AI の string id が auto 数値IDを上書きしない
- [ ] `renumberPhaseIds` が結合済み name を維持する（上書きしない）
- [ ] `renumberTicketIds` が数値ID（integer）を生成する
- [ ] 全テストスイートが修正後も PASS する（172ケース）
- [ ] `list-phases-and-tickets.js` の表示が `P0-1` 形式（二重接頭辞なし）になる
- [ ] `tickets-schema.json` の integer 制約に全チケットが準拠する
