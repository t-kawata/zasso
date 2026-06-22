---
ticket_id: 106
title: voiput Cargo.toml への trate 依存追加
slug: voiput-cargotoml-trate
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0106-voiput-cargotoml-trate/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0106-voiput-cargotoml-trate/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0106-voiput-cargotoml-trate/review.md
---
# voiput Cargo.toml への trate 依存追加

## Summary

`crates/voiput/Cargo.toml` の `[dependencies]` に `trate = { path = "../trate" }` を追加する。これにより voiput crate が trate crate の型（`AsrBackend`, `LocalAsrBackend`）を参照可能になる。

## Background

M3 マイルストーンは voiput 内部に定義された `AsrBackend` トレイトを trate crate に移行する。M3-1 はその第一歩として、voiput が trate crate を依存関係として参照できるようにする。この時点では trate の型をまだ使用しないため、既存のビルドに影響はない。

## Scope

### 実施すること

- `crates/voiput/Cargo.toml` の `[dependencies]` に `trate` を追加
- `cargo check` でコンパイル確認（既存動作不変）

### 実施しないこと

- streamer.rs の AsrBackend トレイト削除（M3-2）
- OpenAIBackend の impl 修正（M3-3）
- テストコードの修正（M3-4）

## Investigation

### 現在の voiput Cargo.toml

既存の依存関係には `sherpa-onnx` 等が含まれている。trate は path 依存で追加する。

### 依存チケット

- 先行実装必須: M0-1 (#90) ✅ reviewed（trate crate が存在すること）
- 後続: M3-2 (streamer.rs 移行) — 本チケット完了後、voiput が trate を参照可能に

## Test Plan

依存追加のみのためランタイムテスト不要。`cargo check` と `cargo tree` で検証。

## Boy Scout Rule — 翻訳可能性計画

Cargo.toml の編集のみのため改善対象なし。

## Acceptance Criteria

- [ ] `crates/voiput/Cargo.toml` に `trate` 依存が追加されていること
- [ ] `cargo check --manifest-path crates/voiput/Cargo.toml` が成功すること
- [ ] `cargo tree --manifest-path crates/voiput/Cargo.toml` に trate が表示されること

## Notes

### 実装フラグメント

```toml
trate = { path = "../trate" }
```

### 依存関係

- **先行実装必須**: M0-1 (#90) ✅ reviewed
- **後続**: M3-2, M3-3, M3-4, M3-5

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M3-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (Implementation Step 2)
