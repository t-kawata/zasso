---
ticket_id: 54
title: "M1-1: SampleRate / BitDepth / ChannelLayout / AudioFormat 定義"
slug: m1-1-samplerate-bitdepth-channellayout-audioformat
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0054-m1-1-samplerate-bitdepth-channellayout-audioformat/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0054-m1-1-samplerate-bitdepth-channellayout-audioformat/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0054-m1-1-samplerate-bitdepth-channellayout-audioformat/plan.md
---
# M1-1: SampleRate / BitDepth / ChannelLayout / AudioFormat 定義

## Summary

音声パイプライン全体で使用されるフォーマット表現型を定義する。利用者が要求するフォーマットと内部処理フォーマットの変換仕様を型で規定し、全音声処理モジュールの共通語彙とする。

以下のファイルを新規作成・修正し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/src/audio/format.rs` — 新規：4 フォーマット型の定義
- `crates/siprs/src/audio/mod.rs` — 新規：audio モジュール宣言
- `crates/siprs/src/lib.rs` — 修正：`pub mod audio;` 追加

## Background

### RFC 準拠

RFC §21（音声フォーマットモデル）に完全準拠する。§42（validation）で sample rate は 8/16/24/48k のみ許可され、§48（デフォルトポリシー）で既定 audio delivery は `16kHz / i16 / stereo(L=IN, R=OUT)` と規定される。

### M0-1/M0-2 からの依存関係

- `SipError`（M0-1）→ validation エラーで使用（ただし M1-1 では未使用、後続 M3-1 で使用）
- `AccountId` / `CallId` / `AudioSourceId`（M0-2）→ 未使用（M1-1 は pure type definitions）

### 後続チケットとの関係

このチケットで定義する型は以下の全音声関連モジュールから参照される：

| チケット | 使用箇所 |
|----------|----------|
| M1-2 | AudioChunk / AudioChunkPair のフォーマット記述 |
| M5-1 | mix_i16_frame の入出力フォーマット |
| M5-2 | interleave_in_out のステレオ前提処理 |
| M14-1 | AsyncAudioSource trait のフォーマットパラメータ |
| M15-1 | AudioMixer のフォーマット設定 |
| M16-2 | ResamplePipeline の入出力フォーマット変換 |

## Scope

### 1. `crates/siprs/src/audio/format.rs`（新規）

```rust
use std::fmt;

// ---------------------------------------------------------------------------
// SampleRate
// ---------------------------------------------------------------------------

/// サンプルレート（Hz）。
///
/// RFC §42 により 8/16/24/48kHz のみ許可される。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SampleRate {
    /// 8 kHz（PSTN 品質）
    Hz8000,
    /// 16 kHz（広帯域、既定）
    Hz16000,
    /// 24 kHz（超広帯域）
    Hz24000,
    /// 48 kHz（フルスペック）
    Hz48000,
}

impl SampleRate {
    /// サンプルレートを Hz の数値として返す。
    pub fn as_hz(self) -> u32 {
        match self {
            Self::Hz8000 => 8000,
            Self::Hz16000 => 16000,
            Self::Hz24000 => 24000,
            Self::Hz48000 => 48000,
        }
    }
}

impl fmt::Display for SampleRate {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}Hz", self.as_hz())
    }
}

// ---------------------------------------------------------------------------
// BitDepth
// ---------------------------------------------------------------------------

/// ビット深度（1 サンプルあたりのビット数表現）。
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BitDepth {
    /// 16-bit 符号付き整数
    I16,
    /// 32-bit 浮動小数点数
    F32,
}

impl BitDepth {
    /// 1 サンプルあたりのバイト数を返す。
    pub fn bytes_per_sample(self) -> usize {
        match self {
            Self::I16 => 2,
            Self::F32 => 4,
        }
    }
}

impl fmt::Display for BitDepth {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::I16 => write!(f, "I16"),
            Self::F32 => write!(f, "F32"),
        }
    }
}

// ---------------------------------------------------------------------------
// ChannelLayout
// ---------------------------------------------------------------------------

/// チャネルレイアウト。
///
/// 既定の `StereoInOut` は L = IN（入力音声）、R = OUT（出力音声）を表す。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ChannelLayout {
    /// モノラル
    Mono,
    /// ステレオ（L=IN, R=OUT）
    StereoInOut,
}

impl ChannelLayout {
    /// チャネル数を返す。
    pub fn num_channels(self) -> u16 {
        match self {
            Self::Mono => 1,
            Self::StereoInOut => 2,
        }
    }
}

impl fmt::Display for ChannelLayout {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Mono => write!(f, "Mono"),
            Self::StereoInOut => write!(f, "Stereo(L=IN,R=OUT)"),
        }
    }
}

// ---------------------------------------------------------------------------
// AudioFormat
// ---------------------------------------------------------------------------

/// 音声フォーマットの完全指定。
///
/// サンプルレート・ビット深度・チャネルレイアウト・フレーム長（ms）の
/// 4 要素で音声ストリームのフォーマットを一意に特定する。
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct AudioFormat {
    /// サンプルレート
    pub sample_rate: SampleRate,
    /// ビット深度
    pub bit_depth: BitDepth,
    /// チャネルレイアウト
    pub channel_layout: ChannelLayout,
    /// 1 フレームの時間長（ミリ秒）
    pub frame_ms: u16,
}

impl AudioFormat {
    /// 1 フレームあたりの総サンプル数を計算する。
    ///
    /// フレーム長（ms）とサンプルレートから算出する。
    /// `StereoInOut` の場合、チャネル数（2）を乗じる。
    ///
    /// # 例
    ///
    /// ```rust
    /// use siprs::audio::format::{AudioFormat, SampleRate, BitDepth, ChannelLayout};
    ///
    /// let fmt = AudioFormat {
    ///     sample_rate: SampleRate::Hz16000,
    ///     bit_depth: BitDepth::I16,
    ///     channel_layout: ChannelLayout::Mono,
    ///     frame_ms: 20,
    /// };
    /// assert_eq!(fmt.frame_samples(), 320);
    /// ```
    pub fn frame_samples(&self) -> usize {
        let ms = self.frame_ms as u32;
        let hz = self.sample_rate.as_hz();
        let ch = self.channel_layout.num_channels() as u32;
        // ms × hz / 1000 × ch
        (ms * hz / 1000) as usize * ch as usize
    }

    /// 1 フレームあたりの総バイト数を計算する。
    ///
    /// `frame_samples()` に 1 サンプルあたりのバイト数を乗じる。
    ///
    /// # 例
    ///
    /// ```rust
    /// use siprs::audio::format::{AudioFormat, SampleRate, BitDepth, ChannelLayout};
    ///
    /// let fmt = AudioFormat {
    ///     sample_rate: SampleRate::Hz16000,
    ///     bit_depth: BitDepth::I16,
    ///     channel_layout: ChannelLayout::Mono,
    ///     frame_ms: 20,
    /// };
    /// assert_eq!(fmt.frame_bytes(), 640);
    /// ```
    pub fn frame_bytes(&self) -> usize {
        self.frame_samples() * self.bit_depth.bytes_per_sample()
    }
}

impl Default for AudioFormat {
    /// 既定の音声フォーマット（RFC §48）。
    ///
    /// - サンプルレート: 16 kHz
    /// - ビット深度: I16
    /// - チャネルレイアウト: StereoInOut（L=IN, R=OUT）
    /// - フレーム長: 20 ms
    fn default() -> Self {
        Self {
            sample_rate: SampleRate::Hz16000,
            bit_depth: BitDepth::I16,
            channel_layout: ChannelLayout::StereoInOut,
            frame_ms: 20,
        }
    }
}

impl fmt::Display for AudioFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}/{}/{} {}ms",
            self.sample_rate, self.bit_depth, self.channel_layout, self.frame_ms
        )
    }
}
```

**設計判断**:
- `AudioFormat::frame_bytes()` は簡易計算であり、PCM ライナーのみ対応（圧縮フォーマットは扱わない）。圧縮フォーマットが必要な場合は別途拡張する
- `frame_ms` は `u16` とし、最大 65535ms まで許容。実際の SIP 運用では 10〜50ms が想定範囲
- `BitDepth` が `PartialEq` only（`Eq` なし）なのは `f32` の `Eq` 制約のため

### 2. `crates/siprs/src/audio/mod.rs`（新規）

```rust
//! 音声処理モジュール。
//!
//! フォーマット型・ミキシング・ソース管理・FFI メディアブリッジを提供する。

pub mod format;
```

### 3. `crates/siprs/src/lib.rs`（修正）

```rust
pub mod audio;
pub mod error;
pub mod util;
```

（`pub mod error;` と `pub mod util;` の間に `pub mod audio;` を追加）

## Non-scope

- `AudioChunk` / `AudioChunkPair` — M1-2
- `AudioTapMode` — M16-1
- `AsyncAudioSource` trait — M14-1
- `SampleRate` や `AudioFormat` の validation（§42）— M3-1
- リサンプラー（rubato）関連 — M16-2

## Test Plan

### ユニットテスト計画（format.rs）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | test_sample_rate_as_hz_all_variants | 全4 variant の as_hz() 戻り値（8000/16000/24000/48000） |
| 2 | test_sample_rate_display | Display が "8000Hz" 等の形式 |
| 3 | test_bit_depth_bytes_per_sample | I16=2, F32=4 |
| 4 | test_bit_depth_display | Display が "I16"/"F32" |
| 5 | test_channel_layout_num_channels | Mono=1, StereoInOut=2 |
| 6 | test_channel_layout_display | Display 形式 |
| 7 | test_audio_format_frame_samples | 16kHz/I16/Mono/20ms → 320 |
| 8 | test_audio_format_frame_samples_stereo | StereoInOut で mono の2倍 |
| 9 | test_audio_format_frame_samples_all_rates | 全 rate での計算確認 |
| 10 | test_audio_format_frame_bytes_i16 | I16: frame_samples × 2 |
| 11 | test_audio_format_frame_bytes_f32 | F32: frame_samples × 4 |
| 12 | test_audio_format_default | Default が §48 既定値と一致 |
| 13 | test_audio_format_display | Display 形式 |
| 14 | test_copy_semantics | 全型が Copy であることのコンパイル時確認 |
| 15 | test_send_sync | 全型が Send + Sync であることのコンパイル時確認 |

### ユニットテスト不可能な項目（例外）

- なし（全テストがメモリ内完結）

## Boy Scout Rule — 翻訳可能性計画

- `as_hz()` / `bytes_per_sample()` / `num_channels()` / `frame_samples()` / `frame_bytes()` — 全て「何を返すか」が関数名から自明な動詞句／名詞句
- `StereoInOut` の doc comment には「L=IN, R=OUT」の明確な定義を記述し、チャネルの意味を誤解しないようにする
- `Display` 実装はデバッグ時の識別性を重視（例: `16000Hz/I16/Stereo(L=IN,R=OUT) 20ms`）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること
- [ ] RFC §21 の全4型（SampleRate, BitDepth, ChannelLayout, AudioFormat）が実装済み
- [ ] `AudioFormat::default()` が §48 既定（16kHz/I16/StereoInOut/20ms）を返すこと
- [ ] `frame_samples()` の計算が全 rate で正しいこと
- [ ] `frame_bytes()` が bit_depth に応じた正しいバイト数を返すこと
- [ ] 全型が `Copy` であること
- [ ] `lib.rs` に `pub mod audio;` が追加されていること

## Notes

### 後続チケットとの連携

| チケット | 連携内容 |
|----------|----------|
| M1-2 | AudioChunk で format を使用 |
| M5-1 | mix_i16_frame のフレームサイズ計算に frame_samples() を使用 |
| M15-1 | AudioMixer のフォーマットパラメータ設定 |
| M16-2 | リサンプラの入出力フォーマット指定 |
