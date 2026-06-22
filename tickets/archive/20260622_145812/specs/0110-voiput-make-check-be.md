---
ticket_id: 110
title: voiput 移行完了確認（make check-be + テスト全件パス）
slug: voiput-make-check-be
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0110-voiput-make-check-be/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0110-voiput-make-check-be/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0110-voiput-make-check-be/review.md
---
# voiput 移行完了確認（make check-be + テスト全件パス）

## Summary

M3 マイルストーンの最終確認。`make check-be`（src-tauri）と全 crate のテストが通過することを確認し、voiput → trate 移行の完了を宣言する。

## Background

M3-1 から M3-4 までの作業を経て、voiput 内部の `AsrBackend` トレイトは `trate` crate に完全に移行された。残りの確認として全ビルド・全テストの通過を確認する。

## Scope

### 実施すること

- `make check-be` の成功確認
- `cargo test --manifest-path crates/trate/Cargo.toml` 全通過確認
- `cargo test --manifest-path crates/voiput/Cargo.toml --lib` 全通過確認

### 実施しないこと

- コード変更（確認のみ）

## Investigation

M3-5 作成時点でのビルド状態:
- `make check-be` ✅ 成功
- `cargo test (trate)` ✅ 7 passed
- `cargo test --lib (voiput)` ✅ 154 passed

マイルストーン M0〜M3 の全 15 チケットが完了・レビュー済み。

## Test Plan

確認のみ。

## Boy Scout Rule — 翻訳可能性計画

なし。

## Acceptance Criteria

- [ ] `make check-be` が成功すること
- [ ] `cargo test --manifest-path crates/trate/Cargo.toml` が全通過すること
- [ ] `cargo test --manifest-path crates/voiput/Cargo.toml --lib` が全通過すること

## Notes

### 依存関係

- **先行実装必須**: M3-1〜M3-4（全て reviewed または done）
- **本チケットで M3 マイルストーン完了**

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M3-5
