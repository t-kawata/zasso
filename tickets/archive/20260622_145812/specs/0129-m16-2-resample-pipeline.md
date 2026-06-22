---
ticket_id: 129
title: "M16-2: ResamplePipeline — rubato 統合"
slug: m16-2-resample-pipeline
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
plan_path: /Users/shyme/shyme/zasso/tickets/context/0129-m16-2-resample-pipeline/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0129-m16-2-resample-pipeline/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0129-m16-2-resample-pipeline/review.md
---

# M16-2: `ResamplePipeline` — rubato 統合

## Summary

内部処理フォーマット（16kHz/i16/mono）と利用者要求フォーマットの変換パイプライン。rubato による高品質サンプルレート変換を提供する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§26)

## Background

### RFC 準拠

§26「rubato を用いる。内部 native format は monaural i16 PCM とし、利用者要求フォーマットへ出力時変換する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M1-1 (#59) | `SampleRate` / `BitDepth` / `ChannelLayout` / `AudioFormat` |
| M5-2 (#71) | `interleave_in_out` ステレオマッピング |

### 設計判断

- 内部は `rubato::FftFixedIn<f32>` を使用
- i16 ↔ f32 変換を含む
- レート変換不要時は rubato をバイパス
- 新規依存: `rubato`

## Scope

### 新規: `crates/siprs/src/audio/resampler.rs`

```rust
pub(crate) struct ResamplePipeline { ... }

impl ResamplePipeline {
    pub fn new(in_rate: SampleRate, out_rate: SampleRate) -> Result<Self, SipError>;
    pub fn process_in(&mut self, in_mono_i16: &[i16]) -> Result<Vec<i16>, SipError>;
    pub fn process_out(&mut self, out_mono_i16: &[i16]) -> Result<Vec<i16>, SipError>;
    pub fn reset(&mut self);
}
```

### 既存ファイル変更

- `crates/siprs/src/audio/mod.rs`: `pub mod resampler;` 追加
- `crates/siprs/Cargo.toml`: `rubato` 依存追加

### テストコード

| # | テスト | 内容 |
|---|--------|------|
| 1 | `test_identity_rate` | 同一レート → 入出力一致 |
| 2 | `test_downsample` | 16kHz→8kHz 半数 |
| 3 | `test_upsample` | 8kHz→48kHz 6倍 |
| 4 | `test_reset` | reset 後も動作継続 |
| 5 | `test_empty_input` | 空入力 → 空出力 |

## Acceptance Criteria

- [ ] `cargo build` 成功（0 error, 0 warning）
- [ ] `cargo test` 全 PASS
- [ ] リサンプル処理が正しいサンプル数変換を行うこと

## Notes

### M16 マイルストーン

```text
M16-1 (#118) ✅ | M16-2 (#119) ← 本チケット | M16-3 (#120)
```
