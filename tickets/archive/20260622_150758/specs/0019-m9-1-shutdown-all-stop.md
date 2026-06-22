---
ticket_id: 19
title: M9-1: shutdown_all と stop の実装
slug: m9-1-shutdown-all-stop
status: reviewed
created_at: 2026-06-10
updated_at: 2026-06-10
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0019-m9-1-shutdown-all-stop/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0019-m9-1-shutdown-all-stop/review.md
---
# M9-1: shutdown_all と stop の実装

## Summary

`ProcessRegistry` に全プロセス停止 `shutdown_all()` と単一停止 `stop()` を実装する。起動の逆順で停止し、`CancellationToken.cancel()` → `ChildGuard::shutdown().await` の順で GracefulShutdown を実行する。Mutex ロック解放後に `shutdown().await` することでデッドロックを回避する。

## Background

`shutdown_all` は運命共同体の中核。アプリ終了時に全ての子プロセスを確実に停止し、孤児プロセスを残留させない。`stop` は動的管理用の単一停止。これで Phase 2 の全機能が完結する。

**参照設計書:** docs/RFC-001-process-registry.md (§12)

## Scope

- `src/registry.rs` の `impl ProcessRegistry` に2メソッド追加
- 2テスト（shutdown_all の逆順確認、stop NotFound）

## Non-scope

- 実プロセスを使用した shutdown 動作確認（M13-1 統合テスト）
- stdout/stderr 読み取りタスクの終了処理（パイプが閉じると自然終了）

## Investigation

実装は RFC §12 のコードをそのまま踏襲。`shutdown_all` は `start_order` の逆順で停止、`stop` は NotFound エラーを返す。

## Test Plan

| # | テスト | 検証 |
|---|-------|------|
| 1 | `shutdown_all_empty_registry` | 空レジストリでパニックしない |
| 2 | `stop_nonexistent_process` | 存在しないプロセス名 → NotFound |

**不可能**: 実プロセス使用の shutdown 確認（M13-1）

## Acceptance Criteria

- [ ] `shutdown_all()` がパニックせず完了する
- [ ] `stop()` が存在しないプロセスに NotFound を返す
- [ ] `cargo check` 警告ゼロ

## Notes

Phase 2 最後のチケット。完了後は Phase 3（プラットフォーム固有実装・統合テスト）。
