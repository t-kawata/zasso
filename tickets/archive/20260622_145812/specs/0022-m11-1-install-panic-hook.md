---
ticket_id: 22
title: M11-1: install_panic_hook（パニック安全網）
slug: m11-1-install-panic-hook
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0022-m11-1-install-panic-hook/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0022-m11-1-install-panic-hook/review.md
---
# M11-1: install_panic_hook（パニック安全網）

## Summary

`std::panic::set_hook` を使用してパニック時に全子プロセスを停止するフックを設定する。専用スレッド + `new_current_thread` Tokio ランタイムでデッドロックを回避し、`ProcessRegistry::shutdown_all()` を確実に実行する。

## Background

Tokio のワーカースレッド上でパニックが発生した場合、同スレッドで `Handle::block_on()` を呼ぶとデッドロックする。そのため、新規スレッドを起動してそこで `current_thread` ランタイムを立ち上げ、`shutdown_all()` を実行する。

**参照設計書:** docs/RFC-001-process-registry.md (§15)

## Scope

- `src/panic.rs` 新規作成:
  - `pub fn install_panic_hook(registry: ProcessRegistry)`
  - `std::panic::set_hook` でフック登録
  - フック内: 専用スレッド → `new_current_thread` Runtime → `shutdown_all().await`
- `src/lib.rs` 修正: `pub mod panic;` 追加

## Non-scope

- panic = "abort" のプロファイル対応（Cargo.toml の注釈のみ）
- graceful_shutdown 自体の動作（M3-1 完了済み）

## Investigation

RFC §15 のコードをそのまま踏襲。`shutdown_all()` は M9-1 で実装済み。`tokio::runtime` は既存依存で利用可能（`rt` feature 済み）。

## Acceptance Criteria

- [ ] `install_panic_hook` がパニックフックを設定する
- [ ] `cargo check` 警告ゼロ
- [ ] 既存 75 テスト通過

## Notes

`panic = "abort"` ではフックが実行されない。リリースプロファイルの設定は利用者側の責任。
