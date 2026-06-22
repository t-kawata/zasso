---
ticket_id: 109
title: テストコードのトレイト変更対応（MockBackend, MockStreamerBackend）
slug: mockbackend-mockstreamerbackend
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0109-mockbackend-mockstreamerbackend/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0109-mockbackend-mockstreamerbackend/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0109-mockbackend-mockstreamerbackend/review.md
---
# テストコードのトレイト変更対応（MockBackend, MockStreamerBackend）

## Summary

streamer.rs の `MockBackend` と binary/test-run.rs の `MockStreamerBackend` の `model_name()` → `backend_name()` 変更を確認する。本チケットの実装内容は M3-2 のレビュー時に既に完了済みである。

## Background

M3-2 の徹底レビュー（警告・エラー完全解決の原則適用時）に、streamer.rs の MockBackend と binary/test-run.rs の MockStreamerBackend は既に `backend_name()` に修正済みである。本チケットは Tickets.md 上の整合性のために作成し、確認のみを行う。

## Scope

### 実施すること

- MockBackend / MockStreamerBackend が `backend_name()` を実装していることの確認
- `cargo check` 0 errors / 0 warnings の確認

### 実施しないこと

- OpenAIBackend の修正（M3-3 で完了済み）
- 新規コードの追加

## Investigation

### 現在の状態

両 MockBackend は既に修正済み:

| ファイル | 行 | 状態 |
|---------|-----|------|
| `crates/voiput/src/pipeline/streamer.rs` L621 | `fn backend_name(&self) -> &'static str { "mock" }` | ✅ 済 |
| `crates/voiput/src/binary/test-run.rs` L808 | `fn backend_name(&self) -> &'static str { "mock" }` | ✅ 済 |

### 依存チケット

- M3-2 (#107): ✅ reviewed（本修正の発生元）
- M3-5: 後続（voiput 移行完了確認）

## Test Plan

確認のみのため専用テスト不要。`cargo test --lib` 全通過で検証。

## Boy Scout Rule — 翻訳可能性計画

本チケットでの変更なし。

## Acceptance Criteria

- [ ] MockBackend が `backend_name()` を実装していること
- [ ] MockStreamerBackend が `backend_name()` を実装していること
- [ ] `cargo check` が成功すること
- [ ] `cargo test --lib` が全通過すること

## Notes

### 依存関係

- **先行実装必須**: M3-2 (#107) ✅ reviewed
- **後続**: M3-5 (voiput 移行完了確認)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M3-4
