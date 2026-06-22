---
ticket_id: 98
title: AsrBackend トレイトの定義
slug: asrbackend
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0098-asrbackend/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0098-asrbackend/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0098-asrbackend/review.md
---
# AsrBackend トレイトの定義

## Summary

`trate` crate の `lib.rs` に `AsrBackend` トレイトを定義する。このトレイトは voiput crate の音声認識バックエンド抽象化の中核であり、`transcribe()`（音声データの書き起こし）を唯一の必須メソッドとし、その他はデフォルト実装を持つ軽量な設計とする。

## Background

voiput の `pipeline/streamer.rs` に定義されている既存の `AsrBackend` トレイトは、以下の問題を抱えていた：

1. voiput 内部型（`StreamerLocale`）に依存しており、外部クレートから実装不可
2. `model_name()` のように動的文字列を返すメソッドがあり、`&'static str` を返す単純な識別子としての設計に変更する必要がある
3. 新規ローカル ASR バックエンド（Qwen3AsrBackend）は `post_correct()` などの拡張機能を必要としないため、デフォルト実装を提供して実装負荷を下げる必要がある

trate crate に抽出する新 `AsrBackend` トレイトは、これらの問題を解決し、外部クレートからの実装を可能にする。

**設計上の変更点（既存 voiput コードとの差異）:**

1. `model_name() -> String` → `backend_name() -> &'static str`
   - 理由: 設定可能なモデル名ではなく、固定のバックエンド識別子を返す設計に変更。OpenAIBackend 側の動的モデル名は別途対応。
2. `insert_punctuation(locale: &StreamerLocale)` → `locale: &str`
   - 理由: trate は voiput 内部型 `StreamerLocale` に依存できない。呼び出し側で変換が必要。
3. `post_correct()`, `record_asr_usage()` にデフォルト実装追加
   - 理由: ローカル ASR バックエンドはこれらのメソッドを必要としない。

## Scope

### 実施すること

- `crates/trate/src/lib.rs` に `AsrBackend` トレイトを定義する
- トレイトは `Send` を継承する（`PseudoAsrStreamer` のスレッド間転送要件）
- 5 メソッドの定義（1 必須 + 4 デフォルト実装）
- `mod local;` 宣言を追加（M1-2 で使用する `local.rs` モジュールの事前宣言）
- `cargo check --manifest-path crates/trate/Cargo.toml` でコンパイル確認

### 実施しないこと

- `LocalAsrBackend` トレイトの定義（M1-2 で実施）
- モックベースの単体テスト（M1-3 で実施）
- voiput 既存コードの trate 移行（M3 マイルストーン）
- trate crate への追加依存導入（`anyhow` のみ維持）

## Investigation

### 現在の trate crate の状態（M0-1, #90 完了済み）

- `crates/trate/Cargo.toml`: `anyhow = "1"` のみ。edition 2021
- `crates/trate/src/lib.rs`: コメントのみの空状態
- `cargo check --manifest-path crates/trate/Cargo.toml` ✅ 成功

### 既存 voiput AsrBackend トレイトの定義

ファイル: `crates/voiput/src/pipeline/streamer.rs` L64-72:
```rust
pub trait AsrBackend: Send {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
    fn post_correct(&mut self, text: &str) -> Result<String>;
    fn model_name(&self) -> String;
    fn record_asr_usage(&mut self, duration_ms: u64);
    fn insert_punctuation(&mut self, text: &str, _locale: &StreamerLocale) -> Result<String> {
        Ok(text.to_string())
    }
}
```

### 本チケットで定義する trate トレイト

```rust
pub trait AsrBackend: Send {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
    fn post_correct(&mut self, text: &str) -> Result<String> { Ok(text.to_string()) }
    fn backend_name(&self) -> &'static str { "unknown" }
    fn record_asr_usage(&mut self, _duration_ms: u64) {}
    fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> { Ok(text.to_string()) }
}
```

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/trate/` → 該当なし
- 本チケットではスタブの新規追加は行わない

### 依存チケット

- M0-1 (#90): ✅ reviewed（完了）
- M1-2: 後続（LocalAsrBackend トレイト定義、本チケット完了後）
- M1-3: 後続（モックテスト、M1-1 + M1-2 完了後）
- M3-2: 後続（voiput 移行、本チケット完了後）

## Test Plan

### ユニットテスト計画

本チケットではトレイト定義のみで実装コードは存在しないため、単体テストは実施しない。検証はコンパイル確認とデフォルト実装の動作確認で代用する。正式な単体テストは M1-3（trate 単体テスト）で実施する。

1. **正常系**: `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
2. **正常系**: トレイトが `Send` を継承していること（コンパイル時検証）
3. **正常系**: `backend_name()` のデフォルト値が `"unknown"` であること（後続 M1-3 で確認）
4. **異常系確認**: トレイトの全メソッドが public であり、外部クレートから実装可能であること

### ユニットテスト不可能な項目（例外）

トレイト定義のコンパイル時検証は cargo check で代用可能。デフォルト実装の具体的な動作確認は M1-3（モックベーステスト）で実施する。

## Boy Scout Rule — 翻訳可能性計画

本チケットで作成するトレイト定義は、以下の翻訳可能性を確認する：

- `AsrBackend`: 「ASR バックエンド」— 音声認識バックエンドを意味する名詞として自然
- `transcribe(samples)`: 「サンプルを書き起こす」— 動詞句として自然
- `post_correct(text)`: 「テキストを事後補正する」— 動詞句として自然
- `backend_name()`: 「バックエンド名を返す」— 説明的
- `record_asr_usage(duration_ms)`: 「ASR 使用時間を記録する」— 説明的
- `insert_punctuation(text, locale)`: 「句読点を挿入する」— 動詞句として自然

既存コードの改善はこのチケットでは行わない（trate は新規作成のため）。

## Acceptance Criteria

- [ ] `crates/trate/src/lib.rs` に `AsrBackend` トレイトが定義されていること
- [ ] トレイトが `Send` を継承していること
- [ ] `transcribe()` のみが必須メソッドで、それ以外はデフォルト実装を持つこと
- [ ] `cargo check --manifest-path crates/trate/Cargo.toml` が成功すること
- [ ] `mod local;` 宣言が追加されていること（M1-2 の事前準備）
- [ ] trate に `sherpa-onnx` 等の不要な依存が含まれていないこと

## Notes

### 実装フラグメント

`crates/trate/src/lib.rs` に追加する内容（RFC §2 および Tickets.md M1-1 に基づく）:

```rust
use anyhow::Result;

/// 音声認識バックエンドが実装すべきトレイト。
///
/// `transcribe()` のみが必須。その他のメソッドはデフォルト実装を持ち、
/// 必要に応じてオーバーライドする。
pub trait AsrBackend: Send {
    /// 音声データを認識し、テキスト結果を返す（唯一の必須メソッド）。
    ///
    /// `samples`: モノラル f32 PCM、振幅範囲 [-1.0, 1.0]
    /// PseudoAsrStreamer から渡される音声は常に 16kHz に正規化されている。
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;

    /// 事後補正を実行する（任意）。デフォルト: 入力をそのまま返す。
    fn post_correct(&mut self, text: &str) -> Result<String> {
        Ok(text.to_string())
    }

    /// モデル名またはバックエンドの識別子を返す。
    fn backend_name(&self) -> &'static str {
        "unknown"
    }

    /// ASR API の使用時間を記録する（任意）。
    fn record_asr_usage(&mut self, _duration_ms: u64) {}

    /// 句読点を挿入する（任意）。デフォルト: 入力をそのまま返す。
    fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> {
        Ok(text.to_string())
    }
}
```

### 依存関係

- **先行実装必須**: M0-1 (#90) ✅ reviewed
- **後続**: M1-2 (LocalAsrBackend トレイト定義) — 本チケット完了後、local.rs を作成
- **後続**: M1-3 (trate 単体テスト) — 本チケット + M1-2 完了後
- **後続**: M3-2 (voiput 移行) — 本チケット完了後、voiput が trate::AsrBackend を参照可能に

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M1-1
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§2, §2.1, §2.2)
