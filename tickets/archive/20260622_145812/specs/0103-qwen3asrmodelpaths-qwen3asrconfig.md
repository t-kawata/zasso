---
ticket_id: 103
title: Qwen3AsrModelPaths + Qwen3AsrConfig 構造体の定義
slug: qwen3asrmodelpaths-qwen3asrconfig
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/kawata/shyme/zasso/tickets/context/0103-qwen3asrmodelpaths-qwen3asrconfig/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0103-qwen3asrmodelpaths-qwen3asrconfig/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0103-qwen3asrmodelpaths-qwen3asrconfig/review.md
---
# Qwen3AsrModelPaths + Qwen3AsrConfig 構造体の定義

## Summary

Qwen3-ASR ローカル音声認識バックエンドに必要な設定データ型を定義する。`Qwen3AsrModelPaths`（4 つのモデルファイルパス）と `Qwen3AsrConfig`（推論パラメータ）を `types.rs` に追加し、`VoiputConfig` 構造体と `VoiputConfigBuilder` に `qwen3_asr_config` フィールドを追加する。

## Background

Qwen3-ASR バックエンド（M4-2 で実装）は 4 つの ONNX モデルファイル（encoder/decoder/joiner/tokens）と推論パラメータ（provider, num_threads, debug）を必要とする。これらの設定値を保持するデータ構造を RFC §4 の設計に従って定義する。

VAD モデル管理パターン（`VadModelPaths`）と一貫した設計とすることで、既存のパス解決関数（`resolve_vad_model_path`）を流用可能にする。

## Scope

### 実施すること

- `crates/voiput/src/types.rs` に `Qwen3AsrModelPaths` 構造体を追加（encoder, decoder, joiner, tokens の 4 フィールド）
- `crates/voiput/src/types.rs` に `Qwen3AsrConfig` 構造体を追加（model_paths, provider, num_threads, debug の 4 フィールド）
- `crates/voiput/src/config.rs` の `VoiputConfig` に `qwen3_asr_config: Option<Qwen3AsrConfig>` フィールドを追加
- `crates/voiput/src/config.rs` の `VoiputConfigBuilder` に `qwen3_asr_config` フィールドと builder メソッドを追加
- `build()` メソッドで `qwen3_asr_config` を設定に含める
- `cargo check` でコンパイル確認

### 実施しないこと

- モデルファイル名定数の追加（M2-4）
- パス解決関数の実装（M2-5）
- SttEngine::Local の match 分岐追加（済: M2-2 で対応済み）

## Investigation

### 現在の状態

- `types.rs`: `LocalAsrKind` enum 済み ✅、`SttEngine::Local` 済み ✅
- `config.rs`: `VoiputConfig` に `qwen3_asr_config` フィールドなし
- `config.rs`: `VoiputConfigBuilder` に builder メソッドなし
- `cargo check ✅`（src-tauri 経由で正常）

### RFC の定義

```rust
pub struct Qwen3AsrModelPaths {
    pub encoder: String,
    pub decoder: String,
    pub joiner: String,
    pub tokens: String,
}

pub struct Qwen3AsrConfig {
    pub model_paths: Qwen3AsrModelPaths,
    pub provider: String,
    pub num_threads: i32,
    pub debug: bool,
}
```

### 既存 VoiputConfig のパターン

既存の `openai_config: Option<OpenAiConfig>` と同様のパターンで追加する:
```rust
pub struct VoiputConfig {
    pub engine: SttEngine,
    pub openai_config: Option<OpenAiConfig>,
    // ... 既存フィールド ...
    pub model_dir: Option<String>,
}
```

### スタブ調査

- `grep -rn '\[::STUB::\]' crates/voiput/src/ | grep -v recognizer.rs` → 該当なし（recognizer.rs の 4 件は M6-1 用）

### 依存チケット

- M2-1 (#101): ✅ reviewed（LocalAsrKind 定義済み）
- M2-2 (#102): ✅ reviewed（SttEngine::Local 定義済み）
- 後続: M4-2 (Qwen3AsrBackend::new が Qwen3AsrConfig を使用)
- 後続: M6-2 (VoiputConfigBuilder.validate で qwen3_asr_config を検証)
- 並列可能: M2-4 (Constants)、M2-5 (Path resolution)

## Test Plan

### ユニットテスト計画

型定義のみのためランタイムテストは不要。コンパイル時検証で代用。

1. `Qwen3AsrModelPaths` の全フィールドが構築可能であること
2. `Qwen3AsrConfig` の全フィールドが構築可能であること
3. `VoiputConfig::builder().qwen3_asr_config(...)` が使用可能であること
4. `build()` で生成した `VoiputConfig` が `qwen3_asr_config` フィールドを持つこと

### ユニットテスト不可能な項目（例外）

型定義のみのためランタイムテスト不要。

## Boy Scout Rule — 翻訳可能性計画

- `Qwen3AsrModelPaths`: 「Qwen3-ASR モデルパス群」— 説明的で自然
- `Qwen3AsrConfig`: 「Qwen3-ASR 設定」— 説明的で自然
- `qwen3_asr_config`: 既存の `openai_config` と命名パターンが一致

既存コードの改善は行わない。

## Acceptance Criteria

- [ ] `crates/voiput/src/types.rs` に `Qwen3AsrModelPaths` / `Qwen3AsrConfig` が定義されていること
- [ ] いずれも `#[derive(Debug, Clone)]` が付与されていること
- [ ] `crates/voiput/src/config.rs` の `VoiputConfig` に `qwen3_asr_config` フィールドが追加されていること
- [ ] `VoiputConfigBuilder` に builder メソッドとフィールドが追加されていること
- [ ] `build()` が新しいフィールドを含めて設定を生成すること
- [ ] `cargo check` が成功すること

## Notes

### 実装フラグメント

`crates/voiput/src/types.rs` に追加:
```rust
/// Qwen3-ASR モデルファイルへのパス群
#[derive(Debug, Clone)]
pub struct Qwen3AsrModelPaths {
    pub encoder: String,
    pub decoder: String,
    pub joiner: String,
    pub tokens: String,
}

/// Qwen3-ASR 推論パラメータ
#[derive(Debug, Clone)]
pub struct Qwen3AsrConfig {
    pub model_paths: Qwen3AsrModelPaths,
    pub provider: String,
    pub num_threads: i32,
    pub debug: bool,
}
```

`crates/voiput/src/config.rs` の `VoiputConfig` に追加:
```rust
/// Qwen3-ASR 設定（engine == Local(Qwen3Asr) の場合のみ必要）
pub qwen3_asr_config: Option<Qwen3AsrConfig>,
```

`VoiputConfigBuilder` に追加:
```rust
qwen3_asr_config: Option<Qwen3AsrConfig>,

pub fn qwen3_asr_config(mut self, c: Qwen3AsrConfig) -> Self {
    self.qwen3_asr_config = Some(c);
    self
}
```

`build()` メソッドの `Ok(VoiputConfig { ... })` に追加:
```rust
qwen3_asr_config: self.qwen3_asr_config,
```

### 依存関係

- **先行実装必須**: M2-1 (#101) ✅ reviewed、M2-2 (#102) ✅ reviewed
- **後続**: M4-2 (Qwen3AsrBackend), M6-2 (Config validation)
- **並列可能**: M2-4 (Constants)、M2-5 (Path resolution)

### 参照設計書

`crates/voiput/docs/sherpa-onnx-qwen3-asr/Tickets.md` M2-3
`crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md` (§4)
