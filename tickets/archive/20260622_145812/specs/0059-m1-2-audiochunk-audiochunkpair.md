---
ticket_id: 59
title: "M1-2: AudioChunk / AudioChunkPair 定義"
slug: m1-2-audiochunk-audiochunkpair
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0059-m1-2-audiochunk-audiochunkpair/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0059-m1-2-audiochunk-audiochunkpair/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0059-m1-2-audiochunk-audiochunkpair/plan.md
---
# M1-2: AudioChunk / AudioChunkPair 定義

## Summary

利用者が音声タップから受け取るデータ単位を定義する。IN（受信音声）と OUT（送信音声）を同一 `SystemTime` でペア化し、呼情報（account_id, call_id）を付与する。ファイル形式への変換は利用者側責務（RFC §2）。

以下のファイルを新規作成し、`cargo build` / `cargo test` が通る状態にする：

- `crates/siprs/src/audio/chunk.rs` — `AudioChunk` enum + `AudioChunkPair` struct 定義 + テスト
- `crates/siprs/src/audio/mod.rs` — 修正：`pub mod chunk;` 追加

## Background

### RFC 準拠

RFC §21.1（AudioChunkPair）に完全準拠する。§2 により録音データのファイルコンテナ化は利用側責務であり、本クレートは `AudioChunkPair` の提供に留める。

### M1-1 からの依存関係

- `AudioFormat`（M1-1）→ 本チケットでは直接使用しないが、`AudioChunk::I16` / `F32` が後続のフォーマット変換（M16-2 等）で参照される
- `SampleRate` / `BitDepth` / `ChannelLayout`（M1-1）→ 同上

### M0-2 からの依存関係

- `AccountId` / `CallId`（M0-2）→ `AudioChunkPair` のフィールドとして使用
- `SipError`（M0-1）→ `stereo_i16()` のエラー型として使用

### 後続チケットとの関係

| チケット | 使用箇所 |
|----------|----------|
| M5-2 | `interleave_in_out` 関数 — `AudioChunkPair` からステレオインタリーブ |
| M5-3 | `PairAligner` 構造体 — IN/OUT ペア整列（AudioChunkPair のタイムスタンプ整合） |
| M14-1 | `AsyncAudioSource::next_chunk` — 書き込み先バッファとして `&mut [i16]`（AudioChunk の中身相当） |
| M16-1 | `AudioTapHandle` — `AudioChunkPair` を mpsc で配送 |
| M16-3 | `subscribe_audio` — フォーマット変換後の `AudioChunkPair` 提供 |

## Scope

### 1. `crates/siprs/src/audio/chunk.rs`（新規）

```rust
use crate::error::SipError;
use crate::util::id::{AccountId, CallId};
use std::fmt;
use std::time::SystemTime;

// ---------------------------------------------------------------------------
// AudioChunk
// ---------------------------------------------------------------------------

/// 音声データの生サンプルバッファ。
///
/// I16 または F32 のいずれかの形式で音声サンプルを保持する。
/// ステレオの場合は L=IN, R=OUT のインタリーブ形式で格納される。
#[derive(Debug, Clone)]
pub enum AudioChunk {
    /// 16-bit 符号付き整数サンプル
    I16(Vec<i16>),
    /// 32-bit 浮動小数点数サンプル
    F32(Vec<f32>),
}

impl AudioChunk {
    /// サンプル数を返す。
    pub fn len(&self) -> usize {
        match self {
            Self::I16(samples) => samples.len(),
            Self::F32(samples) => samples.len(),
        }
    }

    /// サンプル数が 0 かどうかを返す。
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// I16 スライスとして参照する。
    ///
    /// `F32` バリアントの場合は `None` を返す。
    pub fn as_i16(&self) -> Option<&[i16]> {
        match self {
            Self::I16(samples) => Some(samples.as_slice()),
            Self::F32(_) => None,
        }
    }

    /// F32 スライスとして参照する。
    ///
    /// `I16` バリアントの場合は `None` を返す。
    pub fn as_f32(&self) -> Option<&[f32]> {
        match self {
            Self::I16(_) => None,
            Self::F32(samples) => Some(samples.as_slice()),
        }
    }
}

// ---------------------------------------------------------------------------
// AudioChunkPair
// ---------------------------------------------------------------------------

/// 同一タイムスタンプでペア化された IN（受信）/ OUT（送信）音声チャンク。
///
/// IN と OUT は同一時刻のスナップショットであり、PairAligner（M5-3）により
/// 時間的ズレが吸収された後の状態で配送される。
/// ファイルコンテナ化（WAV 等）は利用者側責務（RFC §2）。
#[derive(Debug, Clone)]
pub struct AudioChunkPair {
    /// このペアが属する通話の ID
    pub call_id: CallId,
    /// このペアが属するアカウントの ID
    pub account_id: AccountId,
    /// このペアが取得されたシステム時刻
    pub timestamp: SystemTime,
    /// 受信音声チャンク（遠端→ローカル）
    pub in_chunk: AudioChunk,
    /// 送信音声チャンク（ローカル→遠端）
    pub out_chunk: AudioChunk,
}

impl AudioChunkPair {
    /// 新しいペアを生成する。
    ///
    /// `timestamp` は内部で `SystemTime::now()` を使用する。
    pub fn new(
        call_id: CallId,
        account_id: AccountId,
        in_chunk: AudioChunk,
        out_chunk: AudioChunk,
    ) -> Self {
        Self {
            call_id,
            account_id,
            timestamp: SystemTime::now(),
            in_chunk,
            out_chunk,
        }
    }

    /// IN（L）と OUT（R）をステレオインタリーブした I16 ベクタを生成する。
    ///
    /// 両チャンクが `I16` バリアントである必要がある。
    /// 長さが異なる場合、短い方に合わせて切り詰める。
    /// 後続 M5-2 の `interleave_in_out` に委譲する。
    pub fn stereo_i16(&self) -> Result<Vec<i16>, SipError> {
        let in_samples = self.in_chunk.as_i16()
            .ok_or_else(|| SipError::invalid_state("IN chunk is not I16"))?;
        let out_samples = self.out_chunk.as_i16()
            .ok_or_else(|| SipError::invalid_state("OUT chunk is not I16"))?;
        let len = in_samples.len().min(out_samples.len());
        let mut stereo = Vec::with_capacity(len * 2);
        for i in 0..len {
            stereo.push(in_samples[i]);
            stereo.push(out_samples[i]);
        }
        Ok(stereo)
    }
}
```

**設計判断**:
- `AudioChunk` の内部ベクタ長が `AudioFormat::frame_samples()` と一致することは呼び出し側の責任で保証する。本型は任意長のバッファを許容する汎用コンテナとして設計する
- `AudioChunkPair::stereo_i16()` は `Result<Vec<i16>, SipError>` を返す。型不一致（I16/F32 混在）は `SipErrorKind::InvalidState` とする
- `AudioChunkPair::timestamp` は現時点では `SystemTime::now()` で自動生成する。M5-3（`PairAligner`）でより精密なタイムスタンプ管理が導入される
- `AudioChunk` に `Send + Sync` の自動導出が必要（`Vec<i16>` / `Vec<f32>` は既に Send + Sync）。後続の `AudioTapHandle` が mpsc 経由でスレッド間配送するため

### 2. `crates/siprs/src/audio/mod.rs`（修正）

現行:
```rust
pub mod format;
```

修正後:
```rust
pub mod chunk;
pub mod format;
```

（`pub mod chunk;` を `pub mod format;` の前に追加）

## Non-scope

- `AudioTapMode` / `AudioTapHandle` — M16-1（音声購読 API）
- `AsyncAudioSource` / `SyncAudioSource` trait — M14-1
- `PairAligner` — M5-3（IN/OUT ペア整列アルゴリズム）
- `interleave_in_out` 関数 — M5-2（本チケットでは `stereo_i16()` にインライン実装）
- `AudioFormat` や `SampleRate` との関連付け — M16-3（フォーマット変換統合）
- `serde` の `Serialize` / `Deserialize` 導出 — 後続チケットの検討事項

## Test Plan

### ユニットテスト計画（chunk.rs）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_audio_chunk_i16_len` | `I16(vec![1,2,3]).len() == 3` |
| 2 | `test_audio_chunk_f32_len` | `F32(vec![1.0, 2.0]).len() == 2` |
| 3 | `test_audio_chunk_is_empty_true` | 空ベクタの `I16(Vec::new()).is_empty() == true` |
| 4 | `test_audio_chunk_is_empty_false` | 非空ベクタの `is_empty() == false` |
| 5 | `test_audio_chunk_as_i16_ok` | `I16` に対して `as_i16() == Some(&[1,2,3])` |
| 6 | `test_audio_chunk_as_i16_none` | `F32` に対して `as_i16() == None` |
| 7 | `test_audio_chunk_as_f32_ok` | `F32` に対して `as_f32() == Some(&[1.0])` |
| 8 | `test_audio_chunk_as_f32_none` | `I16` に対して `as_f32() == None` |
| 9 | `test_audio_chunk_pair_new_fields` | `AudioChunkPair::new()` の全フィールドが正しくラウンドトリップすること |
| 10 | `test_audio_chunk_pair_new_timestamp` | `timestamp` が `SystemTime::now()` 付近であること（誤差 5 秒以内） |
| 11 | `test_audio_chunk_pair_stereo_i16_ok` | 同長 I16 IN/OUT → L=IN, R=OUT のステレオインタリーブ |
| 12 | `test_audio_chunk_pair_stereo_i16_truncate` | 異長 I16 → 短い方に切り詰められること |
| 13 | `test_audio_chunk_pair_stereo_i16_f32_in` | IN が F32 → `InvalidState` エラー |
| 14 | `test_audio_chunk_pair_stereo_i16_f32_out` | OUT が F32 → `InvalidState` エラー |
| 15 | `test_audio_chunk_clone` | Clone が独立したコピーを生成すること（変更が元に影響しない） |
| 16 | `test_audio_chunk_pair_clone` | `AudioChunkPair` の Clone が独立したコピーを生成すること |
| 17 | `test_audio_chunk_debug` | Debug 出力がパニックしないこと |
| 18 | `test_audio_chunk_pair_debug` | `AudioChunkPair` の Debug 出力がパニックしないこと |
| 19 | `test_audio_chunk_send_sync` | `AudioChunk` が `Send + Sync` であることのコンパイル時確認 |
| 20 | `test_audio_chunk_pair_send_sync` | `AudioChunkPair` が `Send + Sync` であることのコンパイル時確認 |

### ユニットテスト不可能な項目（例外）

- `SystemTime::now()` の正確性検証（テスト #10 では「5 秒以内」の緩い許容範囲で確認）
- AudioChunkPair の mpsc 経由のスレッド間配送 — M16-1（`AudioTapHandle`）で結合テストとして検証

## Boy Scout Rule — 翻訳可能性計画

- `as_i16()` / `as_f32()` / `is_empty()` / `len()` — 標準的な命名で動作が自明
- `stereo_i16()` — 「IN(L), OUT(R) のステレオインタリーブを I16 で生成する」という動作が関数名から一意に特定できる
- `AudioChunkPair::new()` の timestamp 自動生成動作を doc comment で明示
- 全公開メソッドに doc comment を記述し、「なぜ」この API が存在するかも併記する（例: `stereo_i16` の L=IN, R=OUT 順序規定）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存テスト含む）
- [ ] RFC §21.1 の `AudioChunk` enum（I16/F32）が定義済み
- [ ] RFC §21.1 の `AudioChunkPair` struct（call_id / account_id / timestamp / in_chunk / out_chunk）が定義済み
- [ ] `AudioChunk::len()` / `is_empty()` / `as_i16()` / `as_f32()` が期待通り動作すること
- [ ] `AudioChunkPair::new()` が全フィールドを正しく設定すること
- [ ] `AudioChunkPair::stereo_i16()` が L=IN, R=OUT のステレオインタリーブを生成すること
- [ ] 型不一致（I16/F32 混在）時に `SipError::invalid_state` が返ること
- [ ] 両型が `Clone + Debug + Send + Sync` であること
- [ ] `audio/mod.rs` に `pub mod chunk;` が追加されていること

## Notes

### 後続チケットとの連携

| チケット | 連携内容 |
|----------|----------|
| M5-2 | `interleave_in_out` 関数に `stereo_i16()` のロジックを移譲（将来的な統合） |
| M5-3 | `PairAligner` が `AudioChunkPair` のタイムスタンプを精密管理 |
| M16-1 | `AudioTapHandle` から `AudioChunkPair` を購読者に配送 |
| M16-2 | `ResamplePipeline` が `AudioChunk` のフォーマット変換を実施 |

### `stereo_i16()` の将来設計

M1-2 では `stereo_i16()` を `AudioChunkPair` のメソッドとしてインライン実装する。M5-2 ではこのロジックを汎用関数 `interleave_in_out` として分離し、`AudioChunkPair::stereo_i16()` からは `AudioChunkPair` 全体ではなく生スライスを受け取る形式にリファクタリングする可能性がある。本チケットでは将来の切り出しを意識してシンプルな実装に留める。
