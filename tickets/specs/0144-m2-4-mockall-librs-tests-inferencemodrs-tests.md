---
ticket_id: 144
title: M2-4: mockall ベース単体テスト (lib.rs tests + inference/mod.rs tests)
slug: m2-4-mockall-librs-tests-inferencemodrs-tests
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0144-m2-4-mockall-librs-tests-inferencemodrs-tests/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0144-m2-4-mockall-librs-tests-inferencemodrs-tests/review.md
---

# M2-4: mockall ベース単体テスト

## Summary

`mockall` で `InferenceEngine` のモックを生成し、crate 全体の単体テストを拡充する。実モデルは一切使用せず、全テストはメモリ内完結・決定論的。

## Background

InferenceEngine トレイトの単体テストにより、トレイトの契約が正しいことを早期に検証する。実モデルが必要な結合テストは Phase E で行う。

依存: M2-1（InferenceEngine）、M2-2（ModelRegistry）— 両方 reviewed ✅

## Scope

- `cargo add mockall --dev` で追加
- `MockEngine` の `mock!` 定義（inference/mod.rs のテスト内）
- InferenceEngine 全4メソッドの正常系・異常系テスト（各2 = 8 tests）
- ModelRegistry get() のモック統合テスト
- エラー伝搬パスのテスト

## Non-scope

- 実モデル結合テスト → M5-3
- サーバー結合テスト → M4-3

## Investigation

### 証拠 1: mockall 未導入

`Cargo.toml` の `[dev-dependencies]` に `mockall` は未追加（STUB のみ）。

### 証拠 2: 依存関係

M2-1 (#141) reviewed ✅、M2-2 (#142) reviewed ✅

## Test Plan

| テストケース | モック対象 |
|-------------|-----------|
| 8 tests (生/異常 x 4 methods) | MockEngine |
| ModelRegistry × InferenceEngine 統合 | MockEngine + ModelRegistry |
