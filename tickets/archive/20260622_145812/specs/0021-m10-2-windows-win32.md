---
ticket_id: 21
title: M10-2: Windows 実装（win32）
slug: m10-2-windows-win32
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0021-m10-2-windows-win32/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0021-m10-2-windows-win32/review.md
---
# M10-2: Windows 実装（win32）

## Summary

Windows プラットフォーム固有の graceful_shutdown と is_process_alive の実装を検証する。両方とも既に M3-1（child.rs）と M4-1（platform.rs）で `#[cfg(windows)]` 分岐としてコードは書かれている。本チケットでは Windows 環境でのコンパイル・動作を確認する。

## Background

Windows では Unix の SIGTERM/SIGKILL が使用できないため、`TerminateProcess` によるプロセス終了と `OpenProcess` による生存確認が必要。これらのコードは既に実装済みであり、本チケットは主に Windows CI での動作確認を目的とする。

## Scope

- graceful_shutdown Windows ブランチの確認（child.rs: `#[cfg(windows)]`）
- is_process_alive Windows ブランチの確認（platform.rs: `#[cfg(windows)]`）
- Windows 環境で `cargo test` が全件パスすることの確認（CI）

## Non-scope

- Windows 以外のプラットフォームへの影響（cfg でガード済み）
- コードの新規追加（すべて実装済み）

## Investigation

```
src/child.rs:     #[cfg(windows)] graceful_shutdown → start_kill() → timeout → wait()
src/platform.rs:  #[cfg(windows)] is_process_alive → OpenProcess() → CloseHandle()
Cargo.toml:       [target."cfg(windows)".dependencies] windows = { ... }  ← 追加済み
```

M3-1（child.rs）と M4-1（platform.rs）で Windows 向けの実装は完了している。新規実装は不要。

## Test Plan

現状の macOS ビルドで `#[cfg(windows)]` ブロックはコンパイル対象外のため、テストは Windows CI でのみ実行可能。macOS 上では `cargo check` と既存テストの全面通過をもって代償とする。

## Acceptance Criteria

- [ ] macOS 上で `cargo check` が警告ゼロで通過すること
- [ ] macOS 上で全75テストが通過すること
- [ ] Windows CI 上で `#[cfg(windows)]` ブロックがコンパイル可能であること

## Notes

Windows 実装は M3-1 で graceful_shutdown が、M4-1 で is_process_alive が既に完了している。M10-2 はそれらの成果を Windows 環境で検証するためのチケットであり、新規実装は原則として発生しない。
