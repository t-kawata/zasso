---
ticket_id: 99
title: LocalAsrBackend トレイトの定義
slug: localasrbackend
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0099-localasrbackend/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0099-localasrbackend/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0099-localasrbackend/review.md
---
# LocalAsrBackend トレイトの定義

## Summary

`crates/trate/src/local.rs` に `LocalAsrBackend` トレイトを定義する。このトレイトは `AsrBackend` を継承し、ローカル ASR バックエンドに固有の情報（モデルパス、ヘルスチェック）を提供する。将来 Whisper / SenseVoice 等のローカルモデル追加時も、このトレイトを実装することで統一的に扱えるようにする。

## Background

RFC のアーキテクチャでは、ローカル ASR バックエンド（Qwen3-ASR）と将来的なモデル追加（Whisper / SenseVoice 等）に対応するため、`AsrBackend` を継承する `LocalAsrBackend` トレイトを定義する。`LocalRecognizer`（M5-1）は `Box<dyn LocalAsrBackend>` としてバックエンドを保持し、透過的に呼び出す。

M1-1 で `lib.rs` に `pub mod local;` 宣言が追加され、`local.rs` はスタブとして存在している。本チケットはこのスタブを実際のトレイト定義で置き換える。

## Scope

### 実施すること

- `crates/trate/src/local.rs` の `[::STUB::]` を `LocalAsrBackend` トレイト定義で置き換える
- トレイトは `AsrBackend` を継承する
- 2 メソッドの定義:
  - `model_path(&self) -> &str` — エラーメッセージ等で使用するモデルファイルパス
  - `is_healthy(&self) -> bool` — バックエンドが正常に初期化されているか確認
- `cargo check --manifest-path crates/trate/Cargo.toml` でコンパイル確認

### 実施しないこと

- `AsrBackend` トレイトの定義または修正（M1-1 で完了）
- モックベースの単体テスト（M1-3 で実施）
- トレイトの実装（Qwen3AsrBackend の impl は M4-3）
- trate crate への追加依存導入（`anyhow` のみ維持）

## Investigation

### 現在の trate crate の状態

- `lib.rs`: `AsrBackend` トレイト定義済み ✅。`pub mod local;` 宣言済み ✅
- `local.rs`: `[::STUB::] M1-2 で LocalAsrBackend トレイト定義に置き換える` ✅（本チケットで実装）
- `cargo check --manifest-path crates/trate/Cargo.toml` ✅ 成功

### RFC に定義されたトレイト

RFC §2.1 より:
```rust
use crate::AsrBackend;

/// ローカル ASR バックエンドが実装すべきトレイト。
///
/// AsrBackend に加えて、ローカルモデルに固有の情報（モデルパス等）を提供する。
/// 将来のモデル追加（Whisper / SenseVoice 等）はこのトレイトを実装する。
pub trait LocalAsrBackend: AsrBackend {
    /// 使用中のモデルファイルへのパスを返す（エラーメッセージ等で使用）。
    fn model_path(&self) -> &str;

    /// バックエンドが正常に初期化されているかを確認する。
    fn is_healthy(&self) -> bool;
}
```

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/trate/` → `local.rs` に 1 件（本チケットで解決）
- 本チケット完了後、`local.rs` から `[::STUB::]` マーカーを除去する

### 依存チケット

- M1-1 (#98): ✅ reviewed（先行、local.rs のスタブと pub mod local は M1-1 で作成済み）
- M1-3: 後続（trate 単体テスト）
- M4-3: 後続（Qwen3AsrBackend が LocalAsrBackend を impl）

## Test Plan

### ユニットテスト計画

本チケットではトレイト定義のみのため、単体テストは実施しない。検証はコンパイル確認で代用する。正式な単体テストは M1-3（trate 単体テスト）で実施する。

1. **正常系**: `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
2. **正常系**: トレイトが `AsrBackend` を継承していること（コンパイル時検証）
3. **正常系**: `LocalAsrBackend` トレイトの全メソッド（`model_path`, `is_healthy`）が public であること

### ユニットテスト不可能な項目（例外）

トレイト定義のコンパイル時検証は cargo check で代用可能。デフォルト実装の具体的な動作確認は M1-3 で実施する。

## Boy Scout Rule — 翻訳可能性計画

本チケットで作成するトレイト定義は、以下の翻訳可能性を確認する：

- `LocalAsrBackend`: 「ローカル ASR バックエンド」— 名詞として自然
- `model_path()`: 「モデルパスを返す」— 説明的
- `is_healthy()`: 「健全かを判定する」— 説明的で `is_` 接頭辞に準拠

加えて、スタブマーカーの除去によりコードベースの正確性が向上する。

## Acceptance Criteria

- [ ] `crates/trate/src/local.rs` に `LocalAsrBackend` トレイトが定義されていること
- [ ] トレイトが `AsrBackend` を継承していること
- [ ] `model_path(&self) -> &str` と `is_healthy(&self) -> bool` の 2 メソッドが定義されていること
- [ ] `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
- [ ] `[::STUB::]` マーカーが除去されていること
- [ ] trate に不要な依存が含まれていないこと

## Notes

### 実装フラグメント

`crates/trate/src/local.rs` の内容（RFC §2.1 に基づく）:

```rust
use crate::AsrBackend;

/// ローカル ASR バックエンドが実装すべきトレイト。
///
/// AsrBackend に加えて、ローカルモデルに固有の情報（モデルパス等）を提供する。
/// 将来のモデル追加（Whisper / SenseVoice 等）はこのトレイトを実装する。
pub trait LocalAsrBackend: AsrBackend {
    /// 使用中のモデルファイルへのパスを返す（エラーメッセージ等で使用）。
    fn model_path(&self) -> &str;

    /// バックエンドが正常に初期化されているかを確認する。
    fn is_healthy(&self) -> bool;
}
```

### 依存関係

- **先行実装必須**: M1-1 (#98) ✅ reviewed
- **後続**: M1-3 (trate 単体テスト) — 本チケット完了後、MockLocalBackend のテストを追加
- **後続**: M4-3 (Qwen3AsrBackend 実装) — Qwen3AsrBackend が LocalAsrBackend を impl

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M1-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§2.1)
