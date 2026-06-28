---
ticket_id: 20
title: reviewセッション統合/分離フラグの追加
slug: bind-review-flag
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# reviewセッション統合/分離フラグの追加

## Summary

`-b` / `--bind-review-in-one-session` フラグを追加し、make/plan/start/review を同一セッションで実行するか（デフォルト）、review を分離するかを切り替え可能にする。

## Background

PX-5 で make/plan/start/review は常に同一セッションに固定された。`-b 0` で review だけ分離したいケースに対応する。

```
-b 1（デフォルト）: [make→plan→start→review] | resolve
-b 0:              [make→plan→start] | review | resolve
```

## Scope

1. `-b` / `--bind-review-in-one-session` フラグ追加（0 or 1、デフォルト1）
2. 既存テストの更新

## Investigation

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/cli.ts` | `CliOptions` + `parseArgs` + help |
| `src/runner.ts` | `LoopOptions` + 分岐ガード |
| `src/cli.test.ts` | デフォルト値テスト |
| `src/runner.test.ts` | `baseOptions` |

### 分岐ロジック

```typescript
const bindReview = options.bindReviewInOneSession ?? true;
// 統合モードの場合 → review を同一 withSession 内で実行
// 分離モードの場合 → review を独立した withSession で実行
```

## Test Plan

- `-b 0` → `bindReviewInOneSession: false`
- `-b 1`／未指定 → `bindReviewInOneSession: true`
- 既存56テスト維持

## Acceptance Criteria

- [ ] `-b 1`（デフォルト）で review が同セッション内
- [ ] `-b 0` で review が独立セッション
- [ ] `make test-conver` 全 PASS
- [ ] 犯罪なし

## Notes

- PX-5（セッション統合）完了が前提
