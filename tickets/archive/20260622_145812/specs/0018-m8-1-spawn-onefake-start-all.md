---
ticket_id: 18
title: M8-1: spawn_one（Fake プロセス版）と start_all の実装
slug: m8-1-spawn-onefake-start-all
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0018-m8-1-spawn-onefake-start-all/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0018-m8-1-spawn-onefake-start-all/review.md
---
# M8-1: spawn_one（Fake プロセス版）と start_all の実装

## Summary

単一プロセスを spawn する `spawn_one`（出力キャプチャ＋PID probe＋ChildGuard ラップ）と、複数プロセスを依存順序で起動する `start_all` を実装する。これにより watch_loop の再起動パスが有効化され、Phase 2 のほぼ全機能が完成する。

## Background

ProcessRegistry の中核となるプロセス起動機能。`spawn_one` は `tokio::process::Command` でプロセスを起動し、stdout/stderr を `broadcast` に転送、`wait_ready` で起動完了を確認、`ChildGuard` で GracefulShutdown を保証、PID probe タスクで終了検知を行う。`start_all` は `resolve_start_order` で依存順序を解決し、順次 `spawn_one` を呼び出し、各プロセスに `start_watch_task` を紐付ける。

**参照設計書:** docs/RFC-001-process-registry.md (§7, §9)

## Scope

- `cargo add tokio --features io-util`（BufReader + AsyncBufReadExt のため）
- `src/spawn.rs` 新規作成:
  - `pub(crate) struct SpawnResult` — child_guard, pid, exit_rx
  - `pub(crate) async fn spawn_one(inner, def, output_tx, cancel_token) -> Result<SpawnResult, RegistryError>`
  - Command 構築 → spawn → PID 取得 → stdout/stderr タスク → wait_ready → ChildGuard ラップ → PID probe タスク → 完了
- `src/start.rs` 新規作成（または registry.rs に start_all 追加）:
  - `pub async fn start_all(&self, defs: Vec<ProcessDef>) -> Result<(), RegistryError>`
  - `resolve_start_order` → 各プロセス: entry 登録 → spawn_one → 状態更新 → start_watch_task
- 既存 watch_loop の再起動パスを本実装に置き換え
- watch テストの `#[ignore]` を解除

## Non-scope

- `shutdown_all` / `stop`（M9-1 のスコープ）
- 実プロセスを使用した統合テスト（M13-1 のスコープ）

## Investigation

### トポロジカルソート・依存関係

```
M0-3 (RegistryEntry, ProcessRegistry) ──┐
M1-1 (RestartPolicy::next_delay) ───────┤
M3-1 (ChildGuard) ──────────────────────┤
M5-1 (wait_ready) ──────────────────────┤── M8-1 (spawn_one/start_all)
M6-1 (ProcessRegistry 基本API) ─────────┤        │
M7-1 (watch_loop) ──────────────────────┘        ├── M9-1 (shutdown_all)
       ↑ 再起動パスを本実装に置き換え              └── M13-1 (統合テスト)
```

- M7-1 watch_loop の再起動パス（TODO）を本実装の `spawn_one` 呼び出しに置き換える
- `spawn_one` は `&self` ではなく `inner: Arc<Mutex<RegistryInner>>` を受け取る（watch_loop から呼ばれるため）

### 必要な tokio feature

現在: `macros, net, process, rt, rt-multi-thread, sync, time`
追加: `io-util`（BufReader + AsyncBufReadExt）

## Test Plan

| # | テスト | 種別 | 検証 |
|---|-------|------|------|
| 1 | `spawn_one_echo_process` | 正常系 | `/bin/echo hello` → Running + 出力確認 |
| 2 | `spawn_one_pid_zero_error` | 異常系 | PID=0 エラーケース（テスト不可能ならスキップ） |
| 3 | `start_all_single_process` | 正常系 | 単一プロセス start_all → Running |
| 4 | `start_all_with_dependency` | 正常系 | 依存関係のあるプロセス → 正しい起動順 |
| 5 | `output_broadcast_delivery` | 正常系 | stdout が broadcast に配信されること |
| 6 | `watch_restart_path` | 正常系 | watch_loop の再起動パスが動作すること（#[ignore] 解除） |

## Boy Scout Rule

- watch_loop の再起動パス TODO を本実装に置き換え（M8-1 完了後はテストも有効化）
- watch テストの `#[ignore]` を解除

## Acceptance Criteria

- [ ] `spawn_one` が実プロセスを起動し SpawnResult を返す
- [ ] `start_all` が依存順序でプロセスを起動する
- [ ] stdout/stderr が broadcast チャンネルに配信される
- [ ] PID probe タスクが終了検知する
- [ ] watch_loop の再起動パスが `spawn_one` を呼び出す
- [ ] `cargo test` で全テスト通過

## Notes

依存 M0-3, M1-1, M3-1, M5-1, M6-1, M7-1。このチケット完了で Phase 2 のほぼ全機能が完成し、残るは M9-1（shutdown_all/stop）のみ。

### 成果物

- 計画: context/0018-m8-1-spawn-onefake-start-all/plan.md（未作成）
