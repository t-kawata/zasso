---
ticket_id: 17
title: M7-1: start_watch_task と watch_loop の実装（監視・再起動ループ）
slug: m7-1-start-watch-task-watch-loop
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0017-m7-1-start-watch-task-watch-loop/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0017-m7-1-start-watch-task-watch-loop/review.md
---
# M7-1: start_watch_task と watch_loop の実装（監視・再起動ループ）

## Summary

プロセス終了をイベント駆動で検知し、`RestartPolicy` に基づいて再起動する監視ループ `watch_loop` と、それを `tokio::spawn` で起動する `start_watch_task` を実装する。

## Background

`spawn_one` で起動された各プロセスには `watch_loop` が紐付けられる。プロセス終了時、`exit_rx`（oneshot::Receiver）が値を受信し、RestartPolicy に基づいて再起動を判断する。再起動時は `next_delay()` で計算されたバックオフ時間だけ待機する。

**参照設計書:** docs/RFC-001-process-registry.md (§10)

## Scope

- `src/watch.rs` 新規作成: `start_watch_task` + `watch_loop`（3テスト）
- `src/lib.rs` 修正: `pub mod watch;` 1行追加

## Investigation

watch_loop は spawn_one 未実装のため再起動パスはスタブ。テスト可能なのは cancel/Stopped/Never の終了パスのみ。

## Test Plan

| # | テスト | 検証 |
|---|-------|------|
| 1 | cancel_stops_immediately | cancel_token → 即時 return |
| 2 | never_policy_sets_failed | Never + exit → Failed 状態 |
| 3 | stopped_state_exits | Stopped 状態 → return |

**ユニットテスト不可能**: 再起動パス（M8-1 完了後）

## Acceptance Criteria

- [ ] cancel_token 発火で即時 return
- [ ] Never + exit → Failed 状態
- [ ] `cargo check` 警告ゼロ
- [ ] 既存 67 テスト通過

## Notes

依存: M1-1 (next_delay), M6-1 (Registry)。結合: M8-1 (spawn_one) で再起動パス完成。
