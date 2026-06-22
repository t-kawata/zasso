---
ticket_id: 112
title: Qwen3AsrBackend の new() と transcribe() 実装
slug: qwen3asrbackend-new-transcribe
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0112-qwen3asrbackend-new-transcribe/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0112-qwen3asrbackend-new-transcribe/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0112-qwen3asrbackend-new-transcribe/review.md
---
# Qwen3AsrBackend の new() と transcribe() 実装

## Summary

`crates/voiput/src/local/qwen3.rs` の `[::STUB::]` を実際の `Qwen3AsrBackend` 実装で置き換える。sherpa-onnx の `OfflineRecognizer` をラップし、`AsrBackend` トレイトの `transcribe()` を実装する。

併せて、M2-5 で残した `recognizer.rs` の 2 つの `#[allow(dead_code)]` 関数（`resolve_qwen3_model_paths` / `resolve_qwen3_asr_config`）のスタブを解決する（本チケットの `Qwen3AsrBackend::new()` で初めて使用されるため）。

## Background

Qwen3-ASR は sherpa-onnx が提供するローカル音声認識モデル。`OfflineRecognizer` を使用して音声データをテキストに変換する。この実装は trate crate の `AsrBackend` トレイトを実装し、`PseudoAsrStreamer<Qwen3AsrBackend>` として voiput のパイプラインに統合される。

## Scope

### 実施すること

- `crates/voiput/src/local/qwen3.rs` に `Qwen3AsrBackend` 構造体と実装を追加
  - `struct Qwen3AsrBackend { recognizer: Mutex<OfflineRecognizer>, config: Qwen3AsrConfig }`
  - `impl Qwen3AsrBackend { pub fn new(config: &Qwen3AsrConfig) -> Result<Self> }`
  - `impl AsrBackend for Qwen3AsrBackend { fn transcribe(...) }`
  - `fn backend_name(&self) -> &'static str { "qwen3-asr" }`
- M4-1 の `[::STUB::]` を除去
- **M2-5 のスタブ解決**: `recognizer.rs` の `resolve_qwen3_model_paths` / `resolve_qwen3_asr_config` の `#[allow(dead_code)]` を除去（本チケットで初めて使用される）
- `cargo check` 0 errors / 0 warnings 確認

### 実施しないこと

- `LocalAsrBackend` の実装（M4-3）
- 結合テスト（M8-1）
- `OfflineRecognizer::create()` → `None` 時のエラーハンドリング以外の FFI エラー処理

## Investigation

### 現在の状態

- `local/qwen3.rs`: `[::STUB::] M4-2: Qwen3AsrBackend 実装に置き換える` ✅（本チケットで解決）
- `recognizer.rs`: `#[allow(dead_code)]` 付き関数 2 件（M2-5）— 本チケットで解決
- `sherpa-onnx` は既に `Cargo.toml` の依存に存在（version 1.13.2, shared feature）

### RFC のコードブロック（§5）

```rust
pub struct Qwen3AsrBackend {
    recognizer: Mutex<OfflineRecognizer>,
    config: Qwen3AsrConfig,
}

impl Qwen3AsrBackend {
    pub fn new(config: &Qwen3AsrConfig) -> Result<Self> {
        let mut recognizer_config = OfflineRecognizerConfig::default();
        recognizer_config.model_config.qwen3_asr = OfflineQwen3ASRModelConfig { ... };
        recognizer_config.model_config.tokens = Some(config.model_paths.tokens.clone());
        recognizer_config.model_config.provider = Some(config.provider.clone());
        recognizer_config.model_config.num_threads = config.num_threads;
        recognizer_config.model_config.debug = config.debug;
        let recognizer = OfflineRecognizer::create(&recognizer_config)
            .ok_or_else(|| anyhow!("..."))?;
        Ok(Self { recognizer: Mutex::new(recognizer), config: config.clone() })
    }
}

impl AsrBackend for Qwen3AsrBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        let recognizer = self.recognizer.lock().unwrap();
        let stream = recognizer.create_stream();
        stream.accept_waveform(QWEN3_SAMPLE_RATE, samples);
        recognizer.decode(&stream);
        let result = stream.get_result().ok_or_else(|| anyhow!("..."))?;
        Ok(result.text)
    }
    fn backend_name(&self) -> &'static str { "qwen3-asr" }
}
```

### 依存チケット

- M4-1 (#111): ✅ reviewed（`local/qwen3.rs` のスタブ元）
- M2-5 (#105): ✅ reviewed（`#[allow(dead_code)]` 関数の解決元）
- M4-3: 後続（LocalAsrBackend impl）

## Test Plan

### ユニットテスト計画

1. **エラー系**: 存在しないモデルパスを渡して `Qwen3AsrBackend::new()` がエラーを返すこと
2. **正常系**: `backend_name()` が `"qwen3-asr"` を返すこと
3. **コンパイル**: `AsrBackend` + `Send` トレイト境界を充足すること
4. **スタブ解決**: `#[allow(dead_code)]` が除去され、unused warning がゼロであること

### ユニットテスト不可能な項目（例外）

実モデルを使った transcribe の結合テストは M8-1 で実施。モデル不在時はスキップ。

## Boy Scout Rule — 翻訳可能性計画

- `Qwen3AsrBackend` — 「Qwen3-ASR バックエンド」— 名詞として自然
- `new(config)` — 「設定から生成する」— コンストラクタとして自明
- `transcribe(samples)` — 「サンプルを書き起こす」— 動詞句として自然

M2-5 の `#[allow(dead_code)]` を除去し、コードベースの正確性を向上させる。

## Acceptance Criteria

- [ ] `local/qwen3.rs` に `Qwen3AsrBackend` 構造体が定義されていること
- [ ] `impl AsrBackend for Qwen3AsrBackend` で `transcribe()` / `backend_name()` が実装されていること
- [ ] `Mutex<OfflineRecognizer>` で排他制御されていること
- [ ] M4-1 の `[::STUB::]` が除去されていること
- [ ] M2-5 の `#[allow(dead_code)]` 2 件が除去されていること
- [ ] `cargo check` が 0 errors / 0 warnings で成功すること

## Notes

### 実装フラグメント

```rust
use std::sync::Mutex;
use anyhow::{anyhow, Result};
use sherpa_onnx::{OfflineQwen3ASRModelConfig, OfflineRecognizer, OfflineRecognizerConfig};
use trate::AsrBackend;
use crate::types::Qwen3AsrConfig;

const QWEN3_SAMPLE_RATE: i32 = 16000;
```

### 依存関係

- **先行実装必須**: M4-1 (#111) ✅ reviewed（local モジュール）
- **先行実装必須**: M2-5 (#105) ✅ reviewed（`#[allow(dead_code)]` 関数）
- **後続**: M4-3 (LocalAsrBackend impl), M8-1 (結合テスト)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M4-2
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§5)
