---
ticket_id: 130
title: "M16-3: subscribe_audio のフォーマット変換統合"
slug: m16-3-subscribe-audio
status: draft
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies:
  - "M16-1 (#118) — AudioTapHandle / AudioTapMode / subscribe_audio 骨格"
  - "M16-2 (#129) — ResamplePipeline 構造体定義"
  - "M1-1 (#59) — SampleRate / BitDepth / ChannelLayout / AudioFormat"
  - "M1-2 (#59) — AudioChunk / AudioChunkPair"
  - "M5-2 (#71) — interleave_in_out ステレオマッピング"
  - "M15-2 (#117) — AudioWorker フレーム処理ループ"
---

# M16-3: `subscribe_audio` のフォーマット変換統合

## Summary

`subscribe_audio(call_id, format, capacity, mode)` で利用者から指定された `AudioFormat` に従い、内部処理フォーマット（16kHz/i16/mono）から要求フォーマットへ自動変換した音声フレームを Tap 経由で配送する。利用者はフォーマット変換を意識する必要がない。

**参照設計書:** [docs/rust-sip-rfc.md](../docs/rust-sip-rfc.md) (§22, §22.1, §26, §41.4)

## Background

### なぜ必要か

`subscribe_audio` の現状（client.rs:444-458）は、`mpsc::channel` を作成するが `tx` を即座に `drop` しており、一切のフレームが配送されない。利用者が指定した `format` も `let _ = (call_id, format, mode)` で無視されている（スタブ状態）。M16-1 で Tap の型定義は完了したが、実際のフォーマット変換と配送パスが未実装である。

### RFC 準拠

- §22: 音声タップは指定されたフォーマットで出力すること
- §22.1: Realtime（oldest-drop）と Lossless（backpressure）の2モード
- §26: 内部 native format は 16kHz/i16/mono。出力時変換
- §41.4: WAV 書き出しの使用例は subscribe_audio のフォーマット指定を前提

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M16-1 (#118) | `AudioTapHandle` / `AudioTapMode` / `subscribe_audio` 骨格 |
| M16-2 (#129) | `ResamplePipeline` 構造体（同一レートパススルーのみ） |
| M1-1 (#59) | `AudioFormat` / `SampleRate` / `BitDepth` / `ChannelLayout` |
| M1-2 (#59) | `AudioChunk` / `AudioChunkPair` |
| M5-2 (#71) | `interleave_in_out` — StereoInOut のインターリーブ processing |
| M15-2 (#117) | `AudioWorker` フレーム処理ループ / `PairAligner` |

### 設計判断

1. **rubato 統合の前倒し**: M16-2（#129）で「M17-2 で rubato 統合」としていたが、rubato 3.0.0 は既に Cargo.toml に追加済みであり、かつ M16-3 のテスト計画に異レート変換（8kHz, 48kHz）が含まれているため、本チケットで rubato を用いたサンプルレート変換まで実装する。これにより、M17-2 の STUB マーカーを本チケットに振り替える。

2. **`process_pair()` の追加**: 現在の `ResamplePipeline` は `process_in()` / `process_out()` で mono i16 の入出力しか想定していない。本チケットでは `AudioChunkPair` を直接受け取り、指定された `AudioFormat` に変換する `process_pair()` を追加する。

3. **変換責務の明確化**: `ResamplePipeline` が「サンプルレート」変換（rubato）、「ビット深度」変換（i16↔f32）、「チャネルレイアウト」変換（mono↔StereoInOut）の3軸すべてを担当する。変換不要時はバイパス。

4. **内部フォーマットの定義**: 内部処理フォーマットは `AudioFormat { sample_rate: Hz16000, bit_depth: I16, channel_layout: Mono, frame_ms: 20 }` とする（RFC §26）。この定義は `ResamplePipeline::INTERNAL_FORMAT` 定数として resampler.rs に定義する。

## Investigation

### 証拠 1: subscribe_audio がスタブである

**ファイル:** `crates/siprs/src/client.rs:444-458`

```rust
pub fn subscribe_audio(
    &self,
    call_id: CallId,
    format: AudioFormat,
    capacity: usize,
    mode: AudioTapMode,
) -> Result<AudioTapHandle, SipError> {
    self.ensure_not_shutdown()?;
    let (tx, rx) = tokio::sync::mpsc::channel(capacity);
    let _ = (call_id, format, mode);        // ← format と mode が無視されている
    let handle = AudioTapHandle::new(rx);
    // [::STUB::] M16-3（チケット #120）で AudioWorker に tx を登録する。
    drop(tx);                                // ← tx が即座に破棄される
    Ok(handle)
}
```

- `tx` が即座に drop されるため、`rx.recv()` は常に `None` を返す
- `format` パラメータが全く使われていない
- reactor 経由で AudioWorker に `tx` を登録するパスが必要

### 証拠 2: AudioWorker.process_frame() の Tap 配送が未実装

**ファイル:** `crates/siprs/src/audio/worker.rs:86-90`

```rust
// 4. ペアリング試行（結果は Tap に配送される）
while let Some(_pair) = self.pair_aligner.try_pair() {
    // [::STUB::] M16-1（チケット #118）で Tap 配送を実装
}
```

- `self._tap_txs` は存在するが `_` プレフィックス付きで未使用
- ペアリング結果 (`_pair`) がどの Tap にも配送されていない
- フォーマット変換の適用箇所が確定していない

### 証拠 3: ResamplePipeline が同一レートのパススルーのみ

**ファイル:** `crates/siprs/src/audio/resampler.rs:7, 28-33`

```rust
//! 異なるレート間の変換は [::STUB::] M17-2（チケット #120）で rubato 統合。

pub fn new(in_rate: u32, out_rate: u32) -> Result<Self, SipError> {
    if in_rate != out_rate {
        return Err(SipError::invalid_config(
            "ResamplePipeline: sample rate conversion requires rubato (see M17-2)",
        ));
    }
    Ok(Self { in_rate, out_rate })
}
```

- 異レート時にエラーを返すのみ
- rubato 3.0.0 は Cargo.toml に既に追加済み（crates/siprs/Cargo.toml）
- ビット深度変換（i16↔f32）、チャネルレイアウト変換（mono↔stereo）のメソッドも未実装

### 証拠 4: AudioChunk にフォーマット変換メソッドがない

**ファイル:** `crates/siprs/src/audio/chunk.rs`

- `AudioChunk::I16(Vec<i16>)` / `AudioChunk::F32(Vec<f32>)` の2バリアント
- アクセサ: `as_i16()`, `as_f32()`, `len()`
- i16↔f32 変換メソッドなし（新規実装必要）
- チャネル数を認識する API なし
- format.rs に From/TryFrom 実装なし

### 証拠 5: M16-2 のレビューで rubato 統合の延期を確認

**ファイル:** `tickets/context/0129-m16-2-resample-pipeline/review.md`

> - 同一レートパススルーのみ。異レート変換は rubato v3 の公開API確認後に実装予定
> - STUB: resampler.rs — M17-2 で rubato 統合

- rubato 3.0.0 は既に Cargo.toml にあるため、本チケットで前倒し可能
- M17-2 の STUB マーカーを本チケットに振り替える

## Scope

### 新規ファイル

なし（既存ファイルへの追加実装）

### 既存ファイル変更

#### 1. `crates/siprs/src/audio/resampler.rs` — ResamplePipeline の拡張

```rust
pub(crate) struct ResamplePipeline {
    in_format: AudioFormat,
    out_format: AudioFormat,
    // rubato リサンプラ（rate 変換時のみ Some）
    resampler_in: Option<FftFixedIn<f32>>,
    resampler_out: Option<FftFixedIn<f32>>,
    // i16↔f32 変換用バッファ
    i16_buffer: Vec<i16>,
    f32_buffer: Vec<f32>,
}
```

**追加する公開メソッド:**

```rust
impl ResamplePipeline {
    /// 内部フォーマット定数: 16kHz/i16/mono/20ms
    const INTERNAL_FORMAT: AudioFormat = AudioFormat { ... };

    /// 新しいパイプライン（内部フォーマット → 要求フォーマット）
    /// in_format は常に INTERNAL_FORMAT
    pub fn new_with_format(out_format: AudioFormat) -> Result<Self, SipError>;

    /// AudioChunkPair を要求フォーマットに変換する
    /// 変換不要（バイパス）の場合はクローンを返す
    pub fn process_pair(&mut self, pair: &AudioChunkPair) -> Result<AudioChunkPair, SipError>;

    /// リセット
    pub fn reset(&mut self);
}
```

**変換処理の流れ（process_pair 内部）:**

```
AudioChunkPair
  ├─ in_chunk (mono i16) ──→ i16↔f32変換 ──→ rubato変換 ──→ チャネル変換(StereoInOut) ──→ AudioChunk
  └─ out_chunk (mono i16) ──→ i16↔f32変換 ──→ rubato変換 ──→ チャネル変換(StereoInOut) ──→ AudioChunk
```

各変換ステップは条件付き（不要ならスキップ）:
- ビット深度変換: `out_format.bit_depth != BitDepth::I16` の場合のみ
- サンプルレート変換: `out_format.sample_rate != SampleRate::Hz16000` の場合のみ
- チャネルレイアウト変換: `out_format.channel_layout != ChannelLayout::Mono` の場合のみ
- 全軸が同一 → `pair.clone()` を返す（バイパス最適化）

#### 2. `crates/siprs/src/audio/worker.rs` — AudioWorker の Tap 配送実装

変更点:
- `_tap_txs` → `tap_txs`（アンダースコア除去）
- 各 Tap に `ResamplePipeline` を保持させる（`Vec<(mpsc::Sender<AudioChunkPair>, ResamplePipeline)>`）
- `process_frame()` の try_pair ループ内でペアをフォーマット変換して配送

```rust
pub(crate) struct AudioWorker {
    mixer: Arc<AudioMixer>,
    _call_id: CallId,
    _format: AudioFormat,
    // 各 Tap: (Sender, フォーマット変換パイプライン)
    tap_txs: Vec<(mpsc::Sender<AudioChunkPair>, ResamplePipeline)>,
    pair_aligner: PairAligner,
    _shutdown: watch::Receiver<bool>,
}
```

#### 3. `crates/siprs/src/client.rs` — subscribe_audio の実装

- `let _ = (call_id, format, mode)` の削除
- format のバリデーション: 未サポートの SampleRate は `AudioFormatUnsupported` エラー
  - サポート範囲: 8kHz〜48kHz（M1-1 で定義済みの全レート）
  - エラーケース: `AudioFormatUnsupported`（Tickets.md テスト4）
- reactor 経由で AudioWorker に `(tx, ResamplePipeline)` を登録するコマンドを送信
- `mode` の反映:
  - `Realtime`（既定）: `mpsc::Sender::try_send()` — 容量超過で drop
  - `Lossless`: `mpsc::Sender::send().await` — バックプレッシャー

#### 4. `crates/siprs/src/audio/chunk.rs` — AudioChunk 変換メソッド追加

```rust
impl AudioChunk {
    /// I16 → F32 変換
    pub fn to_f32(&self) -> Self;
    /// F32 → I16 変換
    pub fn to_i16(&self) -> Self;
    /// モノラル → StereoInOut（指定チャンクを両チャネルに配置）
    pub fn to_stereo_in_out(in_chunk: &AudioChunk, out_chunk: &AudioChunk) -> (AudioChunk, AudioChunk);
    /// フォーマット指定変換（内部実装用）
    pub(crate) fn convert(&self, target_fmt: &AudioFormat, internal_rate: u32) -> Result<Self, SipError>;
}
```

#### 5. `crates/siprs/src/audio/mod.rs` — 変更なし（既に pub mod resampler あり）

### rubato 統合（M17-2 から前倒し）

**`ResamplePipeline::new_with_format`** 内で rubato の `FftFixedIn<f32>` を初期化する：

```rust
use rubato::FftFixedIn;

fn create_resampler(in_rate: usize, out_rate: usize, chunk_size: usize) -> Option<FftFixedIn<f32>> {
    if in_rate == out_rate { return None; }
    Some(FftFixedIn::new(in_rate, out_rate, chunk_size, 1, rubato::WindowFunction::BlackmanHarris2)?)
}
```

- `?` または適切なエラーハンドリングで `InvalidConfig` エラーに変換
- チャンクサイズは `AudioFormat::frame_samples()` から計算
- 変換前後で i16↔f32 変換を挟む（ResamplePipeline 内で完結）

### STUB 更新

| ファイル | 行 | 現在の STUB | 変更後 |
|----------|-----|-------------|--------|
| resampler.rs | 7 | `M17-2（チケット #120）で rubato 統合` | `本チケット M16-3（#130）で rubato 統合済み` |
| client.rs | 455 | `M16-3（チケット #120）で AudioWorker に tx を登録` | `M16-3（#130）で実装済み` |
| worker.rs | 89 | `M16-1（チケット #118）で Tap 配送を実装` | `M16-3（#130）で Tap 配送 + フォーマット変換を実装` |

## Non-scope

- **複数フレームのバッファリング・ジッタバッファ**: AudioWorker は 1 フレーム単位で処理する。バッファリングはスコープ外。
- **WAV ファイル書き出し**: §41.4 の使用例は subscribe_audio の利用例として参照するにとどめ、実装はスコープ外。
- **AudioMixer の process_frame**: M15-2 のスコープ。本チケットはミキサー出力後の Tap 配送パスのみ。
- **PJSIP FFI 結合**: 本チケットは純粋ロジック（Layer 1-2）。FFI 結合はフェーズ8（M17-4）。

## Test Plan

### ユニットテスト計画

#### ResamplePipeline 拡張のテスト（resampler.rs）

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 1 | `test_new_with_format_same` | 正常系 | 内部フォーマットと同じ指定 → パイプライン生成成功、バイパスモード |
| 2 | `test_new_with_format_invalid` | 異常系 | 未サポートの SampleRate → `AudioFormatUnsupported` エラー |
| 3 | `test_process_pair_identity` | 正常系 | 同一フォーマットの process_pair → 入力と内容が一致 |
| 4 | `test_process_pair_bit_depth` | 正常系 | I16→F32 変換、F32→I16 変換 |
| 5 | `test_process_pair_channel_layout` | 正常系 | Mono→StereoInOut 変換（L=IN, R=OUT が正しいこと） |
| 6 | `test_process_pair_sample_rate` | 正常系 | 16kHz→8kHz 変換（サンプル数が半分になる） |
| 7 | `test_process_pair_upsample` | 正常系 | 8kHz→48kHz 変換（サンプル数が6倍になる） |
| 8 | `test_process_pair_full_transform` | 正常系 | 16kHz/I16/Mono → 48kHz/F32/StereoInOut の複合変換 |
| 9 | `test_reset_after_convert` | 境界値 | 変換後に reset → 再度変換可能 |
| 10 | `test_empty_pair` | 境界値 | 空のチャンク → 空の出力 |

#### AudioWorker Tap 配送のテスト（worker.rs）

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 11 | `test_tap_delivery_with_format` | 正常系 | Tap 付き worker で process_frame → 指定フォーマットで配送される |
| 12 | `test_tap_realtime_drop` | 正常系 | Realtime mode で capacity 超過 → oldest-drop 発生 |
| 13 | `test_tap_lossless` | 正常系 | Lossless mode で capacity 超過 → ブロック（task で検証） |
| 14 | `test_tap_identity_format_bypass` | 正常系 | 同一フォーマット時はクローン配送（バイパス最適化の確認） |
| 15 | `test_multiple_taps_different_formats` | 正常系 | 3つの Tap が異なる format で独立して変換される |
| 16 | `test_tap_no_pair_no_send` | 境界値 | ペアリング不能時 → 何も配送されない |

#### subscribe_audio 結合テスト（client.rs）

| # | テスト | 種別 | 内容 |
|---|--------|------|------|
| 17 | `test_subscribe_same_format` | 正常系 | 内部フォーマットと同じ形式で購読 → データ受信可能 |
| 18 | `test_subscribe_different_samplerate` | 正常系 | 8kHz 指定 → 8kHz データが届く |
| 19 | `test_subscribe_f32_stereo` | 正常系 | 48kHz/F32/StereoInOut 指定 → F32 ステレオデータ |
| 20 | `test_subscribe_unsupported_format` | 異常系 | 未サポート形式 → `AudioFormatUnsupported` エラー |
| 21 | `test_subscribe_after_shutdown` | 異常系 | shutdown 後 → shutdown エラー |
| 22 | `test_subscribe_handle_recv_close` | 正常系 | 通話終了後 → None が返る |

### ユニットテスト不可能な項目（例外）

1. **実 PJSIP/ASTERISK との結合**: モックバックエンドで代替するため、実 PBX との結合テストは M20-1 のスコープ。
2. **rubato の内部品質（ポップノイズの有無など）**: rubato ライブラリ自体の検証はスコープ外。本チケットでは変換後のサンプル数と format の正当性のみ確認。

## Boy Scout Rule — 翻訳可能性計画

### 改善対象

1. **worker.rs の `_tap_txs` → `tap_txs`**: 未使用フィールドの `_` プレフィックスを除去し、実際に使用することをコードに反映する。ただし、`_call_id`, `_format` は現状未使用のまま維持（将来使用予定）。

2. **client.rs subscribe_audio の `let _ = (call_id, format, mode)`**: パラメータを無視する横着なスタブ。本実装で各パラメータの意味を関数シグネチャ通りに処理する。

3. **resampler.rs の `new(in_rate: u32, out_rate: u32)`**: 生の `u32` ではなく `(SampleRate, SampleRate)` または `(AudioFormat, AudioFormat)` で型安全性を高める。`new_with_format` で実現。

4. **ハードコード値の定数化**: 内部フォーマット（16kHz/i16/mono）を `ResamplePipeline::INTERNAL_FORMAT` 定数として定義する。これにより、内部フォーマット変更時に一箇所の修正で全モジュールに反映される。

5. **AudioWorker の `tap_txs` の型**: `Vec<(mpsc::Sender<AudioChunkPair>, ResamplePipeline)>` はタプル構造体や名前付きフィールドに抽出することを検討する（`TapSubscriber` 構造体）。

## Acceptance Criteria

- [ ] `make check-be` 成功（0 error, 0 warning）
- [ ] `make test` 全 PASS（既存358テスト + 新規22テスト以上）
- [ ] 同一フォーマット指定時にバイパス最適化が機能する（同一フォーマットの場合はクローン、異なる場合のみ変換）
- [ ] ビット深度変換（I16↔F32）が正しく動作する
- [ ] チャネルレイアウト変換（Mono→StereoInOut）が正しく動作する
- [ ] サンプルレート変換（rubato）が正しいサンプル数変換を行う
- [ ] 未サポートフォーマット指定時に `AudioFormatUnsupported` エラーが返る
- [ ] 複数 Tap が異なるフォーマットで独立して変換・配送される
- [ ] Realtime mode で oldest-drop が発生する（capacity 超過時）
- [ ] 全 STUB マーカーが解決または適切に更新されている
- [ ] 翻訳可能性: 各関数/メソッドが一文の責務を持ち、コードが日本語訳可能である
- [ ] `cargo clippy -- -D warnings` 通過

## Notes

### 依存関係メモ

| チケット | 状態 | 関係 |
|----------|------|------|
| M16-1 (#118) | ✅ reviewed | AudioTapHandle, AudioTapMode、subscribe_audio 骨格 |
| M16-2 (#129) | ✅ reviewed | ResamplePipeline 構造体（本チケットで拡張） |
| M15-2 (#117) | ✅ reviewed | AudioWorker フレーム処理ループ |
| M17-2 | ⏸️ deferred | rubato 統合 → **本チケットに前倒し** |

### STUB 更新計画（実装時に一括更新）

```bash
# 実装後に以下の STUB を更新すること
# resampler.rs:7    M17-2 → M16-3（#130）で rubato 統合済み
# client.rs:455     [::STUB::] → M16-3（#130）で実装済み
# worker.rs:89      [::STUB::] → M16-3（#130）で Tap 配送 + フォーマット変換を実装
```
