---
ticket_id: 20
title: M10-1: Unix 実装（libc）+ SIGTERM ハンドラ
slug: m10-1-unix-libc-sigterm
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0020-m10-1-unix-libc-sigterm/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0020-m10-1-unix-libc-sigterm/review.md
---
# M10-1: Unix 実装（libc）+ SIGTERM ハンドラ

## Summary

Unix プラットフォーム固有の `install_sigterm_handler` を実装する。この関数はプロセスが SIGTERM を受信した際に `ProcessRegistry::shutdown_all()` を自動的に呼び出し、全子プロセスを GracefulShutdown してからプロセスを終了させる。

## Background

`tokio::process::Child` は親プロセスが SIGTERM で終了しても子プロセスを自動的に kill しない。そのため、親プロセスが SIGTERM を受けたら明示的に全子プロセスを停止する必要がある。`install_sigterm_handler` は `tokio::signal::unix` で SIGTERM を捕捉し、`shutdown_all` を呼び出す。

## Scope

- `src/signal.rs` 新規作成:
  - `#[cfg(unix)] pub fn install_sigterm_handler(registry: ProcessRegistry)`
  - `tokio::signal::unix::{signal, SignalKind}` で SIGTERM 待機
  - SIGTERM 受信 → `registry.shutdown_all().await` → `std::process::exit(0)`

## Non-scope

- M10-2（Windows 実装）
- `install_sigterm_handler` の Tauri setup への組み込み（M12-1）

## Investigation

- `child.rs` の graceful_shutdown Unix ブランチは M3-1 で実装済み
- 新規必要なのは `tokio` の `signal` feature のみ
- `install_sigterm_handler` は `cfg(unix)` でのみコンパイル

## Acceptance Criteria

- [ ] `install_sigterm_handler` が cfg(unix) でコンパイル可能
- [ ] SIGTERM 受信時に `shutdown_all()` が呼ばれる
- [ ] `cargo check` 警告ゼロ

## Notes

依存: M3-1（child.rs graceful_shutdown 済み）、M9-1（shutdown_all 済み）。graceful_shutdown 本体は M3-1 で完了済みのため、本チケットは SIGTERM 捕捉＋シャットダウン起動の薄いラッパー。
