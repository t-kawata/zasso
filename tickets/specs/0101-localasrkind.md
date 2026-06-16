---
ticket_id: 101
title: LocalAsrKind 列挙型の定義
slug: localasrkind
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0101-localasrkind/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0101-localasrkind/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0101-localasrkind/review.md
---
# LocalAsrKind 列挙型の定義

## Summary

`crates/voiput/src/types.rs` に `LocalAsrKind` 列挙型を定義する。この型はローカル ASR バックエンドの種別を表し、`SttEngine::Local` の内部データとして使用される。現時点では `Qwen3Asr` のみを持つが、将来 `Whisper` / `SenseVoice` 等の追加を想定した拡張可能な設計とする。

## Background

RFC のアーキテクチャでは、`SttEngine` 列挙型に `Local { backend: LocalAsrKind }` バリアントを追加し、ローカル ASR バックエンドを選択可能にする。`LocalAsrKind` はその内部データとしてバックエンドの種別を識別する。`LocalRecognizer::new()`（M5-1）はこの値に応じてバックエンドをディスパッチする。

## Scope

### 実施すること

- `crates/voiput/src/types.rs` に `LocalAsrKind` 列挙型を追加する
- `#[derive(Debug, Clone, Copy, PartialEq, Eq)]` を付与
- バリアント: `Qwen3Asr`
- `cargo check` でコンパイル確認

### 実施しないこと

- `SttEngine::Local` バリアントの追加（M2-2）
- `Qwen3AsrModelPaths` / `Qwen3AsrConfig` 構造体の定義（M2-3）
- モデルファイル名定数の追加（M2-4）
- パス解決関数の実装（M2-5）

## Investigation

### 現在の voiput types.rs の状態

- `crates/voiput/src/types.rs` に既存型（`SttEngine`, `VadConfig` 等）が定義済み
- `lib.rs` で `pub use types::*` により全 public 型が再公開されている

### 定義する型

RFC §3 より:
```rust
/// ローカル ASR バックエンドの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalAsrKind {
    Qwen3Asr,
}
```

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/voiput/src/` → 該当なし

### 依存チケット

- 先行実装必須: なし（独立した純粋な型定義）
- 後続: M2-2 (SttEngine::Local), M5-1 (LocalRecognizer)
- 並列可能: M1 群（trate）、M2-3/M2-4/M2-5（voiput 他の型定義）

## Test Plan

### ユニットテスト計画

最小限のコンパイル時検証：

1. `LocalAsrKind::Qwen3Asr` が構築可能であること
2. `Debug`, `Clone`, `Copy`, `PartialEq`, `Eq` の derive が機能すること

### ユニットテスト不可能な項目（例外）

型定義のみのためランタイムテストは不要。

## Boy Scout Rule — 翻訳可能性計画

- `LocalAsrKind`: 「ローカル ASR の種別」— 名詞として自然
- `Qwen3Asr`: バックエンド名として自明

## Acceptance Criteria

- [ ] `crates/voiput/src/types.rs` に `LocalAsrKind` 列挙型が定義されていること
- [ ] `#[derive(Debug, Clone, Copy, PartialEq, Eq)]` が付与されていること
- [ ] `Qwen3Asr` バリアントが存在すること
- [ ] `cargo check` が成功すること
- [ ] 外部から `voiput::LocalAsrKind` としてアクセス可能であること

## Notes

### 実装フラグメント

```rust
/// ローカル ASR バックエンドの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalAsrKind {
    /// Qwen3-ASR（sherpa-onnx OfflineRecognizer）
    Qwen3Asr,
}
```

### 依存関係

- **先行実装必須**: なし
- **後続**: M2-2 (SttEngine::Local), M5-1 (LocalRecognizer)
- **並列可能**: M2-3/M2-4/M2-5、M1 群

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M2-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§3)
