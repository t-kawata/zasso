---
ticket_id: 91
title: resolve-ticket-context.js specExists 判定追加
slug: resolve-ticket-contextjs-specexists
status: made
created_at: 2026-07-13
updated_at: 2026-07-13
---

# resolve-ticket-context.js: `specExists` / `specPath` 判定追加

## Summary

`resolve-ticket-context.js` の出力に `specExists` と `specPath` フィールドを追加し、Tickets.json 内のチケットの `referenceSection` から spec ファイルが実在するか確認できるようにする。これにより「チケットは存在するが spec ファイルがない」状態を `exists: true` と区別できるようになり、make-ticket.md の分岐がより正確になる。

## Background

### 問題

`resolve-ticket-context.js` の現在の出力は `exists` フィールドで「Tickets.json 内に該当チケットが存在するか」を判定している。しかし、チケットが存在しても `referenceSection` が指す spec ファイルが実在するとは限らない:

| 状態 | 現在の `exists` | 正しい解釈 |
|------|---------------|-----------|
| Tickets.json なし（ensure-tickets-json.js が作成済み） | `false` | 新規作成が必要 |
| Tickets.json はあるが該当チケットなし | `false` | 新規作成が必要 |
| チケットはあるが spec ファイルがない | `true` | ⚠️ `exists` だけでは「spec 欠落」と区別不能 |
| チケットあり、spec ファイルあり | `true` | 正常 |

3つ目のケースは、`resolve-ticket-context.js` の内部で `ensure-tickets-json.js` が呼ばれた直後（チケット未追加）では `exists: false` になるため問題にならない。しかし、`get-ticket.js` で読み取ったチケットの `referenceSection` が存在しないファイルを指している場合などに問題が発生する可能性がある。

### 現状のコード

`resolve-ticket-context.js` の `main()` はチケット存在確認のみで、spec ファイルの存在確認は行っていない:

```javascript
// チケット存在確認
const parsed = parseTicketKey(ticketKey);
const exists = parsed ? ticketExists(tickets, parsed.phaseId, parsed.ticketId) : false;
```

### 依存関係

- **PX-53** (前提): PX-53 で追加された `ticketExists()` 関数と同様のロジックを拡張する
- **PX-49**: `resolve-spec-path.js` の `findTicketInTickets()` が既に `referenceSection` を返すロジックを持っている。本チケットではこれを利用または参考にする

## Scope

### 変更対象

- `.claude/scripts/tickets/resolve-ticket-context.js` — `main()` 内で spec ファイル存在確認を追加し、出力JSONに `specPath` と `specExists` を追加

### 実装要件

`main()` 内で以下のロジックを追加する:

```javascript
// チケット存在確認 + spec ファイル存在確認
const parsed = parseTicketKey(ticketKey);
const exists = parsed ? ticketExists(tickets, parsed.phaseId, parsed.ticketId) : false;

// spec ファイルの存在確認
let specPath = '';
let specExists = false;
if (exists && parsed) {
  const ticket = findTicketInTickets(ticketsPath, parsed.phaseId, parsed.ticketId);
  if (ticket && ticket.referenceSection) {
    const specPathRaw = path.resolve(ticketsDir, ticket.referenceSection);
    specPath = specPathRaw;
    specExists = fs.existsSync(specPathRaw);
  }
}
```

出力JSONに以下を追加:

```javascript
console.log(JSON.stringify({
  ...
  specPath,       // spec ファイルの絶対パス（見つからない場合は空文字列）
  specExists,     // spec ファイルが実在するか
  ...
}));
```

`findTicketInTickets` は PX-49 の `resolve-spec-path.js` に同名関数が存在する。本チケットではそれを import して使用するか、同等のロジックを `resolve-ticket-context.js` 内に実装する（`main()` 内でのみ使用するため、コピーでも可）。

`generateInstruction` の条件分岐に `specExists` を追加する:

```javascript
function generateInstruction(ticketKey, ticketExistsFlag, specExists, docPath, ...) {
  if (!ticketKey || !isValidTicketKey(ticketKey)) { ... }
  if (!ticketExistsFlag) { ... }  // 新規作成
  if (!specExists) { ... }        // spec ファイルがない（新規 or 欠落）
  if (!docPath) { ... }           // スポット
  ...
}
```

### 変更しないもの

- `parseArguments` / `isValidTicketKey` / `parseTicketKey` / `ticketExists` / `resolveDocPath` / `derivePaths` / `generateInstruction` の既存の引数・戻り値の互換性は維持する
- `module.exports` は明示的に新規追加しない限り変更不要
- `generateInstruction` の既存呼び出し（spec の test ファイル等）に影響を与えないシグネチャ拡張とする
- `ensure-tickets-json.js` 内部から呼ばれる動作は変更しない

## Non-scope

- `make-ticket.md` の分岐ロジック変更は含めない（`specExists` が追加されることで、より正確な分岐が可能になるが、実際に分岐条件を書き換えるのは次のチケット）

## Investigation

### 現状の main() 出力

```javascript
console.log(JSON.stringify({
  success: true,
  ticketKey,
  exists,
  docPath,
  docPathSource,
  graphPath,
  dirsTreePath,
  pipelineAvailable,
  available,
  missing,
  instruction,
}));
```

`specPath` と `specExists` が欠落している。

### findTicketInTickets の再利用

PX-49 の `resolve-spec-path.js` に定義された `findTicketInTickets()` は `referenceSection` を返す。これを import して使用することで重複実装を避けられる:

```javascript
const { findTicketInTickets } = require('../lib/resolve-spec-path');
```

ただし、この関数は `referenceSection` のみを返すため、実際の spec パス解決は呼び出し側で行う必要がある。

## Test Plan

### ユニットテスト計画

既存テスト `tests/resolve-ticket-context.test.cjs` にテストケースを追加する:

1. **正常系: チケット存在＋referenceSection が実在する spec ファイルを指す → `specExists: true`**
2. **正常系: チケット存在＋referenceSection が存在しないファイルを指す → `specExists: false`**
3. **正常系: チケット存在＋referenceSection なし → `specExists: false`**
4. **正常系: チケット存在しない → `specExists: false`**
5. **正常系: 出力JSON に `specPath` フィールドが含まれる**

### ユニットテスト不可能な項目（例外）

- 該当なし

## Boy Scout Rule — 翻訳可能性計画

- `main()` 関数内で「チケット存在確認」と「spec ファイル存在確認」は明確に分離された2ブロックとして記述する（同じ関数内に混ぜない）

## Acceptance Criteria

- [x] 実装要件を満たしている
- [ ] `resolve-ticket-context.js` の出力JSON に `specPath`（絶対パス or 空文字列）が含まれる
- [ ] `resolve-ticket-context.js` の出力JSON に `specExists`（true/false）が含まれる
- [ ] チケットが存在し spec ファイルも存在する場合 → `exists: true`, `specExists: true`
- [ ] チケットが存在するが spec ファイルが存在しない場合 → `exists: true`, `specExists: false`
- [ ] チケットが存在しない場合 → `exists: false`, `specExists: false`
- [ ] `generateInstruction` が `specExists` を受け取って instruction を生成できる
- [ ] 既存テスト（PX-49/50/52/53）が全件 PASS する（regression）
- [ ] 翻訳可能性の検証が通っている

## Notes

### 依存関係

- **PX-53** (前提): `resolve-ticket-context.js` の `main()` 関数を改修する
- **PX-49** (参照): `resolve-spec-path.js` の `findTicketInTickets()` を import して使用するか検討

### 修正後の出力例（全情報あり）

```json
{
  "success": true,
  "ticketKey": "PX-49",
  "exists": true,
  "specPath": "/path/to/tickets/specs/0086-dump-ticket-graph-commandsjs-spec.md",
  "specExists": true,
  "docPath": "/path/to/RFC-ROOT.md",
  "pipelineAvailable": true,
  "instruction": "全て揃っています。Step 7 で機械的書き込みを実行できます。"
}
```

### 修正後の出力例（spec ファイル欠落）

```json
{
  "success": true,
  "ticketKey": "PX-99",
  "exists": true,
  "specPath": "/path/to/tickets/specs/0099-some-ticket.md",
  "specExists": false,
  "docPath": "",
  "pipelineAvailable": false,
  "instruction": "spec ファイルが見つかりません。create-spec.js で spec ファイルを作成した上で update-ticket.js で referenceSection を更新してください。"
}
```

### 実装手順

```
1. resolve-ticket-context.js の main() に spec 存在確認ロジックを追加
2. 出力JSON に specPath / specExists を追加
3. generateInstruction のシグネチャに specExists を追加（後方互換維持のため省略可）
4. テスト更新
5. 全テスト実行（regression）
```
