---
ticket_id: 91
title: trate クレートの empty lib.rs コンパイル確認
slug: trate-empty-librs
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0091-trate-empty-librs/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0091-trate-empty-librs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0091-trate-empty-librs/review.md
---
# trate クレートの empty lib.rs コンパイル確認

## Summary

trate crate が空の lib.rs でもビルド可能であることを確認する。M0-1 で既に lib.rs は作成・検証済みであり、本チケットはその確認を正式に記録する。

## Background

Tickets.md の M0-2 は「trate crate が独立した Rust パッケージとして正しくビルド可能であることを最低限確認する」ことを目的としているが、この確認は先行チケット M0-1（#90）の実装時に既に完了している。

M0-1 で作成された `crates/trate/src/lib.rs` は内容がコメントのみ（実コードなし）であり、`cargo check` が成功している。したがって M0-2 の要件は M0-1 の実装により満たされている。

## Scope

### 実施すること

- 既存の `crates/trate/src/lib.rs` がコンパイル可能であることを確認する
- 実装作業は M0-1 で完了済みのため、新規のコード変更は行わない

### 実施しないこと

- lib.rs へのトレイト定義追加（M1-1, M1-2）
- lib.rs の内容変更（現状のコメントのみの状態を維持）
- Cargo.toml への依存追加

## Investigation

- `crates/trate/src/lib.rs` の現状（M0-1 で作成済み）:
  - 6行のコメントのみ。実コードは存在しない（空の crate）。
  - コメント内容: crate の目的（trate = Abstract AsrBackend trait）と後続チケットへの言及
- `cargo check --manifest-path crates/trate/Cargo.toml` ✅ 成功（M0-1 実装時に確認済み）
- `cargo tree --manifest-path crates/trate/Cargo.toml`: `anyhow` のみ ✅

## Test Plan

### ユニットテスト計画

本チケットは検証のみ（コード変更なし）のため、ユニットテストは不要。検証は cargo check の再実行で代用する：

1. `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること（1回目と同様）

### ユニットテスト不可能な項目（例外）

なし（検証不要）

## Boy Scout Rule — 翻訳可能性計画

本チケットでコード変更は行わない。既存の lib.rs のコメントは crate の目的と後続チケットを明示しており、翻訳可能性に問題はない。

## Acceptance Criteria

- [ ] `crates/trate/src/lib.rs` が存在し、コメントのみ（実コードなし）であること
- [ ] `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
- [ ] 後続チケット（M1-1, M1-2）が trate crate にトレイト定義を追加可能であること

## Notes

### 本チケットの性質

本チケット（M0-2）は M0-1（#90）の実装により既に要件が満たされている。実装作業は不要だが、Tickets.md 上の整合性を保つためにチケットとして作成する。

### 依存関係

- **先行実装必須**: M0-1（#90）— 完了済み（reviewed）
- **後続**: M1-1（AsrBackend トレイト定義）、M1-2（LocalAsrBackend トレイト定義）
- **並列可能**: M2 群（voiput 型定義）

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M0-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§1 — crates/trate/src/lib.rs)
