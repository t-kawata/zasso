---
ticket_id: 47
title: M2.5-3: SpeechDenoiser の safe API 書き換え
slug: m25-3-speechdenoiser-safe-api
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0047-m25-3-speechdenoiser-safe-api/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0047-m25-3-speechdenoiser-safe-api/review.md
---
# M2.5-3: SpeechDenoiser の safe API 書き換え

## Summary

`pipeline/denoiser.rs` の `sherpa_rs_sys as sys` による低レベル FFI 呼び出しを、`sherpa_onnx` の safe Rust API に置き換える。これにより `unsafe` コード、生ポインタ、手動 Drop、`unsafe impl Send/Sync` を削除する。本チケットで M2.5 の全置き換えが完了し、ビルドが回復する。

## Background

M2.5-1 で `sherpa-rs`/`sherpa-rs-sys` を削除したため `pipeline/denoiser.rs` がコンパイルエラーになっている（現在唯一のエラー）。本チケットで safe API に書き換えてビルドを回復する。

**確認済み API:**
- `OfflineSpeechDenoiser::create(&config)` → `Option<Self>`
- `denoiser.run(&samples, sample_rate)` → `DenoisedAudio`
- `DenoisedAudio.samples: Vec<f32>` — ノイズ除去後のサンプル

## Scope

### 1. `src/pipeline/denoiser.rs` の書き換え

**フィールド変更:**
```rust
// 旧
inner: *const sys::SherpaOnnxOfflineSpeechDenoiser,
// 新
inner: Option<OfflineSpeechDenoiser>,
```

**SpeechDenoiser::new():**
```rust
// 旧
let c_model = CString::new(model_path)?;
let gtcrn_config = sys::SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig { model: c_model.as_ptr() };
let model_config = sys::SherpaOnnxOfflineSpeechDenoiserModelConfig { gtcrn: gtcrn_config, ... };
let config = sys::SherpaOnnxOfflineSpeechDenoiserConfig { model: model_config };
let denoiser = unsafe { sys::SherpaOnnxCreateOfflineSpeechDenoiser(&config) };
if denoiser.is_null() { return Err(...) }

// 新
use sherpa_onnx::{OfflineSpeechDenoiser, OfflineSpeechDenoiserConfig, OfflineSpeechDenoiserGtcrnModelConfig, OfflineSpeechDenoiserModelConfig};

let gtcrn = OfflineSpeechDenoiserGtcrnModelConfig { model: model_path };
let model_config = OfflineSpeechDenoiserModelConfig {
    gtcrn,
    num_threads,
    ..Default::default()
};
let config = OfflineSpeechDenoiserConfig { model: model_config };
let denoiser = OfflineSpeechDenoiser::create(&config)
    .ok_or_else(|| anyhow!("Failed to create OfflineSpeechDenoiser"))?;
Ok(Self { inner: Some(denoiser) })
```

**SpeechDenoiser::run():**
```rust
// 旧
let result_ptr = unsafe { sys::SherpaOnnxOfflineSpeechDenoiserRun(self.inner, ...) };
let result = unsafe { &*result_ptr };
let output = if result.n > 0 { unsafe { std::slice::from_raw_parts(...) } } else { Vec::new() };
unsafe { sys::SherpaOnnxDestroyDenoisedAudio(result_ptr) };

// 新
let audio = self.inner.as_ref().unwrap().run(samples, sample_rate);
// audio.samples: Vec<f32> — safe Rust の所有権管理
```

**削除するもの:**
- `use sherpa_rs_sys as sys;`
- `use std::ffi::CString;`
- `unsafe impl Send for SpeechDenoiser {}`
- `unsafe impl Sync for SpeechDenoiser {}`
- 手動 `Drop` impl

**維持するもの:**
- `SpeechDenoiser` struct の公開 API（`new()`, `run()`）
- テスト（GTCRN モデルが存在しないためユニットテストはなし）

## Non-scope

- 移行後の全体確認 — M2.5-4

## Investigation

### 証拠1: DenoisedAudio のフィールド

https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.DenoisedAudio.html

```rust
pub struct DenoisedAudio {
    pub samples: Vec<f32>,
    pub sample_rate: i32,
}
```

`samples` は `Vec<f32>`（safe Rust、所有権あり）。`sample_rate` は `i32`。

### 証拠2: OfflineSpeechDenoiser API

https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.OfflineSpeechDenoiser.html

| メソッド | シグネチャ |
|---------|-----------|
| `create` | `pub fn create(config: &OfflineSpeechDenoiserConfig) -> Option<Self>` |
| `run` | `pub fn run(&self, samples: &[f32], sample_rate: i32) -> DenoisedAudio` |
| `sample_rate` | `pub fn sample_rate(&self) -> i32` |

`Send + Sync` 実装済み、`Drop` 実装済み（RAII）。

### 証拠3: 現在の唯一のコンパイルエラー

M2.5-2 完了後:
```
error[E0432]: unresolved import `sherpa_rs_sys`
 --> src/pipeline/denoiser.rs:7:5
```

本チケットでこのエラーを修正すればビルドが完全回復する。

## Test Plan

### ユニットテスト計画

denoiser.rs には現在ユニットテストがない（GTCRN モデルが必要なため）。本チケットでも追加しない。

### テスト不可能な項目

- GTCRN 実モデルを使ったノイズ除去テスト → `models/gtcrn.onnx` が必要。M3-1 [STREAMER] で確認

## Boy Scout Rule

- `unsafe impl Send/Sync` 削除によりコードの安全性が向上
- 手動 `Drop` 削除によりメモリ管理が RAII に一本化
- CString 変換と生ポインタの手動管理を完全排除

## Acceptance Criteria

- [ ] `pipeline/denoiser.rs` の全 `sherpa_rs_sys` 参照が `sherpa_onnx` に置き換わっていること
- [ ] `unsafe impl Send/Sync` が削除されていること
- [ ] 手動 `Drop` impl が削除されていること
- [ ] `cargo check` がエラーなく通ること（唯一のエラーを修正）
- [ ] `cargo test` が全テスト PASS すること

## Notes

- 本チケット完了後、約3ヶ月ぶりに `cargo test` が全件 PASS する
- 直ちに M2.5-4（移行後動作確認）に進むこと

### 成果物

- 計画: context/0047-m25-3-speechdenoiser/plan.md（未作成）
- 実装サマリ: context/0047-m25-3-speechdenoiser/implementation.md（未作成）
- レビュー報告書: context/0047-m25-3-speechdenoiser/review.md（未作成）
