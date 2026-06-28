---
ticket_id: 19
title: ACPセッションの統合（make/plan/start/review 同セッション化）
slug: acpmakeplanstartreview
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# ACPセッションの統合（make/plan/start/review 同セッション化）

## Summary

PX-4 で status 分岐を導入した際に、make/plan/start が個別の ACP セッション（`withSession`）に分割されてしまった。これらを元の設計通り1つのセッションに統合し、併せて review も同セッション内で実行する。

## Background

### 設計乖離の履歴

| バージョン | make/plan/start | review | resolve |
|-----------|:--------------:|:------:|:-------:|
| PX-2 以前 | **1セッション** | 独立 | 独立 |
| PX-4（現状） | **3独立セッション** | 独立 | 独立 |
| **PX-5（目標）** | **1セッション（review含む）** | ↑に統合 | 独立 |

### PX-4 で何が起きたか

status 分岐の都合で各コマンドを個別の `withSession` で囲んだ結果、1チケットあたり最大4つの ACP プロセスが起動する非効率な状態になった。

## Scope

1. make/plan/start/review を1つの `withSession` に統合（status 分岐と共存）
2. 変更後: 1チケット = 最大2セッション（統合内 + resolve）

## Non-scope

- resolve / jpush-branch / find-omissions のセッション構成は変更しない

## Investigation

### 現在のコード（runner.ts）

```typescript
// ❌ 各コマンドが独立セッション（4セッション）
if (s === "todo")     await withSession(...) { make(session); }
if (s === "todo"||s ==="made") await withSession(...) { plan(session); }
if (s === "todo"||s ==="made"||s ==="planned") await withSession(...) { start(session); }
await withSession(...) { review(session); }
```

### 修正後のコード（想定）

```typescript
// ✅ 1セッションに統合（2セッション）
if (s === "todo" || s === "made" || s === "planned") {
    await withSession(cwd, apiKey, model, async (session) => {
        if (s === "todo")       await make(session);
        if (s !== "planned")    await plan(session);
        await start(session);
        await review(session);
    });
} else { // done
    await withSession(cwd, apiKey, model, async (session) => {
        await review(session);
    });
}
```

## Test Plan

### ユニットテスト計画

- `runner.test.ts`: `withSession` 呼び出し回数の検証
  - todo → 2回（統合内 + resolve）
  - done → 2回（review + resolve）
- 既存56テスト維持

## Boy Scout Rule — 翻訳可能性計画

- セッション統合後のコードは「1チケット = 1セッション（+ resolve）」と読めるように整理

## Acceptance Criteria

- [ ] make/plan/start/review が同一セッションで実行される
- [ ] status 分岐が維持される
- [ ] `make test-conver` 全 PASS
- [ ] 犯罪なし

## Notes

- 影響範囲: `src/runner.ts` のみ
- PX-4 の status 分岐ロジックは維持したままセッション構造のみ修正

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。
