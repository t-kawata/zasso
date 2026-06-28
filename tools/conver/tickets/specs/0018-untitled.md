---
ticket_id: 18
title: ステータス5値化と工程分岐の最適化
slug: five-status-routing
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# ステータス5値化と工程分岐の最適化

## Summary

チケットの status を現在の3値（todo/done/reviewed）から5値（todo/made/planned/done/reviewed）に拡張し、各工程の完了を正確に追跡する。`runLoop` は status に応じて必要な工程のみ実行する。

## Background

### 現状: 3値

```
  todo ──────→ done ──────→ reviewed
```

- `todo`: 全未処理の初期値
- `done`: start 完了後
- `reviewed`: review 完了後

`loadPendingTickets` は `status !== "reviewed"` でフィルタ → `todo` と `done` を区別できない
`runLoop` は status を無視して一律で make/plan/start/review を実行 → `done` でも make からやり直し

### 理想: 5値と工程スキップ

```
  todo ──→ made ──→ planned ──→ done ──→ reviewed
  (make)     (plan)     (start)     (review)
```

| status | 意味 | 次に実行すべき工程 |
|--------|------|------------------|
| `todo` | 未着手 | make |
| `made` | make 完了（spec 作成済み） | plan |
| `planned` | plan 完了（実装計画承認済み） | start |
| `done` | start 完了（実装済み、未レビュー） | review |
| `reviewed` | 全工程完了 | スキップ |

## Scope

1. status の値5種を定義: `todo`, `made`, `planned`, `done`, `reviewed`
2. `loadPendingTickets` → `todo/made/planned/done` を未処理として抽出（`reviewed` のみ除外）
3. `runLoop` の分岐:
   - `todo` → make から開始
   - `made` → plan から開始（make スキップ）
   - `planned` → start から開始（make/plan スキップ）
   - `done` → review から開始（make/plan/start スキップ）
   - `reviewed` → 次のチケットへ
4. 工程完了時に status を適切に更新:
   - make 完了 → `update-ticket.js` で status を `made` に
   - plan 完了 → status を `planned` に
   - start 完了 → status を `done` に（現状維持）
   - review 完了 → status を `reviewed` に（現状維持）

## Non-scope

- resolve / jpush-branch / find-omissions の動作は変更しない
- Slack通知フォーマットは変更しない

## Investigation

### 現在のコード

**loadPendingTickets**（`src/tickets.ts:55`）:
```typescript
.filter((t) => t.status !== "reviewed");
```
変更不要（`reviewed` のみ除外する動作は維持）。

**runLoop**（`src/runner.ts:174-197`）:
```typescript
for (const ticket of target) {
    // status を無視して全工程実行
    make → plan → start → review
}
```

### 必要な変更

**runner.ts** のループ内:
```typescript
for (const ticket of target) {
    if (ticket.status === "todo" || ticket.status === "made") {
        if (ticket.status === "todo") {
            await runCommand(session, `/make-ticket ${ticketId}`, ...);
        }
        if (ticket.status === "todo" || ticket.status === "made") {
            await runCommand(session, `/plan-ticket ${ticketId}`, ...);
        }
    }
    // ... start, review は共通 ...
}
```

よりシンプルな実装案: `makeTicket`, `planTicket`, `startTicket`, `reviewTicket` の各セッションを独立させ、status ガードで囲む。

### スラッシュコマンドの改修

| ファイル | 改修内容 |
|---------|---------|
| `.claude/commands/make-ticket.md` | 完了時に `update-ticket.js` で status を `made` に更新する処理を追加 |
| `.claude/commands/plan-ticket.md` | 完了時に status を `planned` に更新する処理を追加 |

start-ticket / review-ticket は既に `done` / `reviewed` に更新しているため現状維持。

## Test Plan

### ユニットテスト計画

- `runner.test.ts`: 各 status のチケットに対して適切な工程のみ呼ばれるか検証
  - `todo` → make/plan/start/review 全て
  - `made` → plan/start/review（make なし）
  - `planned` → start/review（make/plan なし）
  - `done` → review のみ
  - `reviewed` → スキップ（loadPendingTickets 時点で除外）
- `tickets.test.ts`: `loadPendingTickets` のフィルタ動作維持を確認
- カバレッジ目標: 既存56テスト維持 + 新規テスト

### ユニットテスト不可能な項目

- Slack Webhook 送信はモック代替

## Boy Scout Rule — 翻訳可能性計画

- status の分岐は `switch` 文または条件分岐テーブルで見通し良く実装する
- `if-else` の連鎖は避ける

## Acceptance Criteria

- [ ] `todo` → make/plan/start/review 全て実行
- [ ] `made` → plan/start/review（make スキップ）
- [ ] `planned` → start/review（make/plan スキップ）
- [ ] `done` → review のみ
- [ ] `reviewed` → スキップ
- [ ] 各工程完了時に status が適切に更新される
- [ ] `make test-conver` 全 PASS
- [ ] 犯罪なし

## Notes

- 影響範囲: `src/runner.ts`, `.claude/commands/make-ticket.md`, `.claude/commands/plan-ticket.md`
- `scripts/tickets/` のスクリプト群は `status` にバリデーションを持たないため新規値でも動作する
- `all-tickets.js` の `status-filter` オプションは、渡された文字列で `t.status === filter` の完全一致フィルタをするため新規値でも動作する

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。
