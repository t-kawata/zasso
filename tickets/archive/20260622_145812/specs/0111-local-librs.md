---
ticket_id: 111
title: local モジュール宣言 + lib.rs 公開
slug: local-librs
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0111-local-librs/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0111-local-librs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0111-local-librs/review.md
---
# local モジュール宣言 + lib.rs 公開

## Summary

`crates/voiput/src/local/` モジュールディレクトリを作成し（`mod.rs`, `qwen3.rs`, `recognizer.rs`）、`crates/voiput/src/lib.rs` に `pub mod local;` を追加する。M4-2/Qwen3AsrBackend と M5-1/LocalRecognizer の実装基盤となる。

## Background

RFC のアーキテクチャでは、Qwen3-ASR バックエンドのコードは `crates/voiput/src/local/` ディレクトリに配置される。M4-1 はこのディレクトリ構造とモジュール宣言を作成し、後続チケットの実装準備を整える。

## Scope

### 実施すること

- `crates/voiput/src/local/mod.rs` 作成（子モジュール宣言）
- `crates/voiput/src/local/qwen3.rs` 作成（空、M4-2 で実装）
- `crates/voiput/src/local/recognizer.rs` 作成（空、M5-1 で実装）
- `crates/voiput/src/lib.rs` に `pub mod local;` 追加
- `cargo check` でコンパイル確認

### 実施しないこと

- Qwen3AsrBackend の実装（M4-2）
- LocalRecognizer の実装（M5-1）

## Investigation

### 現在の lib.rs のモジュール宣言

`crates/voiput/src/lib.rs` には既存のモジュール宣言が並んでいる。`pub mod local;` を適切な位置に追加する。

### 依存チケット

- 先行実装必須: なし（独立したモジュール作成）
- M4-2: 後続（`local/qwen3.rs` に実装）
- M5-1: 後続（`local/recognizer.rs` に実装）

## Test Plan

モジュール宣言のみのためテスト不要。`cargo check` で検証。

## Boy Scout Rule — 翻訳可能性計画

なし（新規モジュール作成のみ）。

## Acceptance Criteria

- [ ] `crates/voiput/src/local/mod.rs` が作成され、`pub mod qwen3;` / `pub mod recognizer;` が宣言されていること
- [ ] `crates/voiput/src/local/qwen3.rs` が作成されていること
- [ ] `crates/voiput/src/local/recognizer.rs` が作成されていること
- [ ] `crates/voiput/src/lib.rs` に `pub mod local;` が追加されていること
- [ ] `cargo check` が成功すること

## Notes

### 実装フラグメント

```rust
// crates/voiput/src/local/mod.rs
pub mod qwen3;
pub mod recognizer;
```

### 依存関係

- **先行実装必須**: なし
- **後続**: M4-2 (Qwen3AsrBackend), M5-1 (LocalRecognizer)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M4-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§1)
