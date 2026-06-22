---
ticket_id: 46
title: M2.5-2: VadProcessor の safe API 書き換え
slug: m25-2-vadprocessor-safe-api
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0046-m25-2-vadprocessor-safe-api/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0046-m25-2-vadprocessor-safe-api/review.md
---
# M2.5-2: VadProcessor の safe API 書き換え

## Summary

`pipeline/vad.rs` の `sherpa_rs_sys as sys` による低レベル FFI 呼び出しを、`sherpa_onnx` の safe Rust API に置き換える。これにより `unsafe` コード、生ポインタ、手動 Drop、`unsafe impl Send/Sync` を削除する。

## Background

M2.5-1 で `sherpa-rs` / `sherpa-rs-sys` を削除し `sherpa-onnx` に置き換えたため、`pipeline/vad.rs` はコンパイルエラーになっている。本チケットで safe API に書き換えてビルドを回復する。

**API 対応表:**

| 旧（sherpa_rs_sys as sys） | 新（sherpa_onnx） |
|---|---|
| `sys::SherpaOnnxVadModelConfig` | `VadModelConfig` |
| `sys::SileroVadModelConfig`（埋め込み） | `SileroVadModelConfig` 構造体 |
| `sys::SherpaOnnxCreateVoiceActivityDetector(&c, dur)` → `*const` | `VoiceActivityDetector::create(&config, dur)` → `Option<Self>` |
| `sys::SherpaOnnxVoiceActivityDetectorAcceptWaveform(v, p, l)` | `vad.accept_waveform(&samples)` |
| `sys::SherpaOnnxVoiceActivityDetectorDetected(v) == 1` | `vad.detected()` |
| `sys::SherpaOnnxVoiceActivityDetectorReset(v)` | `vad.reset()` |
| 生ポインタ `*const sys::SherpaOnnxVoiceActivityDetector` | `Option<VoiceActivityDetector>` |
| `unsafe impl Send for VadProcessor {}` | 不要（sherpa-onnx が保証） |
| 手動 `Drop` impl | 不要（RAII） |
| `unsafe { mem::zeroed() }` で初期化 | `VadModelConfig::default()` |

## Scope

### 1. `src/pipeline/vad.rs` の書き換え

**フィールド変更:**
```rust
// 旧
vad: *const sys::SherpaOnnxVoiceActivityDetector,
// 新
vad: Option<VoiceActivityDetector>,
```

**VadProcessor::new():**
```rust
// 旧
let mut vad_config: sys::SherpaOnnxVadModelConfig = unsafe { mem::zeroed() };
vad_config.silero_vad.model = c_model.as_ptr();
// ...
let vad = unsafe { sys::SherpaOnnxCreateVoiceActivityDetector(&vad_config, max_duration) };
if vad.is_null() { return Err(...) }

// 新
let mut silero = SileroVadModelConfig::default();
silero.model = Some(model_path);
silero.threshold = config.threshold;
// ...
let vad_config = VadModelConfig {
    silero_vad: silero,
    sample_rate: VAD_SAMPLE_RATE,
    num_threads: config.num_threads,
    ..Default::default()
};
let vad = VoiceActivityDetector::create(&vad_config, config.max_speech_duration)
    .ok_or_else(|| anyhow!("Failed to create VoiceActivityDetector"))?;
Ok(Self { vad: Some(vad), ... })
```

**メソッド変更:**
```rust
// accept_waveform: vad.accept_waveform(&samples)
pub fn accept_waveform(&self, samples: &[f32]) {
    if let Some(ref vad) = self.vad { vad.accept_waveform(samples); }
}

// detected: vad.detected()
// ※MYCUTE の is_speaking を維持（内部で detected() を呼ぶ）

// reset: vad.reset()
pub fn reset(&self) {
    if let Some(ref vad) = self.vad { vad.reset(); }
    self.is_speaking.store(false, Ordering::SeqCst);
}
```

**削除するもの:**
- `use sherpa_rs_sys as sys;`（削除、sherpa_onnx に置き換え）
- `use std::mem;`（zeroed を使わなくなるため、不要なら削除）
- `unsafe impl Send for VadProcessor {}`
- `unsafe impl Sync for VadProcessor {}`
- 手動 `Drop` impl 全体

**維持するもの:**
- `VadConfig` / `VadType` 構造体（パイプライン内部型、API 不変）
- `VAD_SAMPLE_RATE` / `SILERO_VAD_WINDOW_SIZE` / `TEN_VAD_WINDOW_SIZE` 定数
- `resolve_ascii_path()`（Windows, cfg(windows)）
- テストコード（3テスト）

### 2. Unsafe Send/Sync 削除後の安全性

`VoiceActivityDetector` は `sherpa-onnx` が `Send + Sync` を実装済みのため、ラッパーである `VadProcessor` 側の `unsafe impl Send/Sync` は不要になる。`Drop` も `VoiceActivityDetector` の Drop が自動処理するため不要。

## Non-scope

- SpeechDenoiser の書き換え — M2.5-3
- 移行後の全体確認 — M2.5-4

## Investigation

### 証拠1: sherpa-onnx VoiceActivityDetector API

https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.VoiceActivityDetector.html

| メソッド | シグネチャ | 戻り値 |
|---------|-----------|--------|
| `create` | `pub fn create(config: &VadModelConfig, buffer_size_in_seconds: f32) -> Option<Self>` | `Option<VoiceActivityDetector>` |
| `accept_waveform` | `pub fn accept_waveform(&self, samples: &[f32])` | `()` |
| `detected` | `pub fn detected(&self) -> bool` | `bool` |
| `reset` | `pub fn reset(&self)` | `()` |
| `clear` | `pub fn clear(&self)` | `()` |
| `flush` | `pub fn flush(&self)` | `()` |
| `front` | `pub fn front(&self) -> Option<SpeechSegment>` | `Option<SpeechSegment>` |
| `is_empty` | `pub fn is_empty(&self) -> bool` | `bool` |
| `pop` | `pub fn pop(&self)` | `()` |

`Send + Sync` 実装済み、`Drop` 実装済み（RAII）。

### 証拠2: VadModelConfig / SileroVadModelConfig / TenVadModelConfig

| 構造体 | フィールド |
|--------|-----------|
| `VadModelConfig` | `silero_vad: SileroVadModelConfig`, `ten_vad: TenVadModelConfig`, `sample_rate: i32`, `num_threads: i32`, `provider: Option<String>`, `debug: bool` |
| `SileroVadModelConfig` | `model: Option<String>`, `threshold: f32`, `min_silence_duration: f32`, `min_speech_duration: f32`, `window_size: i32`, `max_speech_duration: f32` |
| `TenVadModelConfig` | 同上 |

いずれも `Default` 実装済み。

### 証拠3: 現在のコンパイルエラー

M2.5-1 完了後のエラー:
```
error[E0432]: unresolved import `sherpa_rs_sys`
 --> src/pipeline/vad.rs:14:5
  |
14 | use sherpa_rs_sys as sys;
```

他のエラーはこの1行に連鎖して発生している。これを `sherpa_onnx` に置き換えれば全て解決。

## Test Plan

### ユニットテスト計画（3テスト、既存維持）

既存の `pipeline::vad::tests` はそのまま維持：
1. `test_silero_window_size` — `SILERO_VAD_WINDOW_SIZE == 512`
2. `test_ten_window_size` — `TEN_VAD_WINDOW_SIZE == 256`
3. `test_vad_sample_rate` — `VAD_SAMPLE_RATE == 16000`
4. `test_short_path_*`（cfg(windows)）— Windows の resolve_ascii_path

### ユニットテスト不可能な項目

- 実モデルを使った `VoiceActivityDetector::create()` → テスト実行時にモデルファイルが必要。test-run.rs [VAD] で確認。
- Unsafe 削除の確認 → `cargo build` でコンパイルが通れば unsafe が混入していないことの証明になる。

## Boy Scout Rule

- `unsafe impl Send/Sync` 削除によりコードの安全性が向上
- 手動 `Drop` 削除によりメモリ管理が RAII に一本化
- `VoiceActivityDetector::create()` の `Option` を `anyhow!` で適切にエラー伝播

## Acceptance Criteria

- [ ] `pipeline/vad.rs` の全 `sherpa_rs_sys` 参照が `sherpa_onnx` に置き換わっていること
- [ ] `unsafe impl Send/Sync` が削除されていること
- [ ] 手動 `Drop` impl が削除されていること
- [ ] `cargo check --lib pipeline::vad` がエラーなく通ること
- [ ] `cargo test --lib pipeline::vad` が全テスト PASS すること
- [ ] test-run.rs `[VAD]` が実モデル初期化に成功すること

## Notes

- `SileroVadModelConfig` / `TenVadModelConfig` の `model` フィールドは `Option<String>` になった。CString への変換は `sherpa-onnx` 内部で行われるため、呼び出し側での CString 生成は不要になる。
- `VoiceActivityDetector::create()` の第二引数 `buffer_size_in_seconds` は MYCUTE の `max_speech_duration` と同じ意味。
- `VadModelConfig` の `sample_rate` は VAD_SAMPLE_RATE (16000) を設定する。

### 成果物

- 計画: context/0046-m25-2-vadprocessor/plan.md（未作成）
- 実装サマリ: context/0046-m25-2-vadprocessor/implementation.md（未作成）
- レビュー報告書: context/0046-m25-2-vadprocessor/review.md（未作成）
