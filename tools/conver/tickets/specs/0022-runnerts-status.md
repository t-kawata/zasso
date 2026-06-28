---
ticket_id: 22
title: runner.ts での確定的status更新
slug: deterministic-status
status: draft
created_at: 2026-06-28
updated_at: 2026-06-28
---
# runner.ts での確定的status更新

## Summary

各 `runCommand` の完了直後に `execSync` で `update-ticket.js` を呼び出し、チケットの status を確定的に設定する。.md や Claude Code の自律動作に依存せず必ず status が更新される。

## Background

Claude Code が jpush-branch 実行時に自律的に `update-ticket.js` を呼び出し、P2 の全チケットの status を `made` に書き換える事故が発生。唯一の確実な対策は runner.ts 側での強制更新。

## Scope

1. `runner.ts` に `updateStatus()` 関数を追加（`execSync` + `update-ticket.js`）
2. 各 runCommand 直後に呼び出し：make→made, plan→planned, start→done, review→reviewed

## Investigation

### 現在の課題

runner.ts の各 runCommand 呼び出しと、.md 内の status 更新が分離しており、Claude Code の自律動作や .md の記述漏れで status が未確定になるリスクがある。

### 対策

```typescript
function updateStatus(ticketsPath: string, ticketId: string, status: string): void {
    try {
        const script = path.join(process.cwd(), ".claude", "scripts", "tickets", "update-ticket.js");
        const input = JSON.stringify({ status });
        execSync(`echo '${input}' | node "${script}" "${ticketsPath}" "${ticketId}"`, { timeout: 5000 });
    } catch { /* 失敗してもループ継続 */ }
}
```

各 runCommand 直後に挿入（todo→made, made→planned, planned→done, done→reviewed）。

## Test Plan

- 既存56テスト維持。`execSync` は runner.test.ts のモック経由でテストされる。

## Acceptance Criteria

- [ ] 各工程完了後に status が確定的に更新される
- [ ] .md や Claude Code の動作に影響されない
- [ ] `make test-conver` 全 PASS
- [ ] 犯罪なし

## Notes

- 変更ファイル: `src/runner.ts` のみ
- PX-7（.md 修正）完了が前提（既に reviewed）
- execSync は 5 秒タイムアウト、失敗時もループ継続
