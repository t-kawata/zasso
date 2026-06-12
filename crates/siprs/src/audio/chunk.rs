//! # 音声チャンク型
//!
//! 音声タップから利用者が受け取るデータ単位を定義する。
//! RFC §21.1（AudioChunkPair）に完全準拠する。

use std::time::SystemTime;

use crate::error::SipError;
use crate::util::id::{AccountId, CallId};

// ---------------------------------------------------------------------------
// AudioChunk
// ---------------------------------------------------------------------------

/// 音声データの生サンプルバッファ。
///
/// I16 または F32 のいずれかの形式で音声サンプルを保持する。
/// ステレオの場合は L = IN（受信）, R = OUT（送信）のインタリーブ形式で格納される。
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
    /// 受信音声チャンク（遠端 → ローカル）
    pub in_chunk: AudioChunk,
    /// 送信音声チャンク（ローカル → 遠端）
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
        let in_samples = self
            .in_chunk
            .as_i16()
            .ok_or_else(|| SipError::invalid_state("IN chunk is not I16"))?;
        let out_samples = self
            .out_chunk
            .as_i16()
            .ok_or_else(|| SipError::invalid_state("OUT chunk is not I16"))?;
        let min_len = in_samples.len().min(out_samples.len());
        let mut stereo = Vec::with_capacity(min_len * 2);
        for i in 0..min_len {
            stereo.push(in_samples[i]);
            stereo.push(out_samples[i]);
        }
        Ok(stereo)
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // -----------------------------------------------------------------------
    // AudioChunk — len
    // -----------------------------------------------------------------------

    /// I16 バリアントの len() が内部ベクタの長さを正しく返すことを確認する。
    #[test]
    fn test_audio_chunk_i16_len() {
        let chunk = AudioChunk::I16(vec![1, 2, 3]);
        assert_eq!(chunk.len(), 3);
    }

    /// F32 バリアントの len() が内部ベクタの長さを正しく返すことを確認する。
    #[test]
    fn test_audio_chunk_f32_len() {
        let chunk = AudioChunk::F32(vec![1.0, 2.0]);
        assert_eq!(chunk.len(), 2);
    }

    // -----------------------------------------------------------------------
    // AudioChunk — is_empty
    // -----------------------------------------------------------------------

    /// 空ベクタの I16 バリアントで is_empty() が true を返すことを確認する。
    #[test]
    fn test_audio_chunk_is_empty_true() {
        let chunk = AudioChunk::I16(Vec::new());
        assert!(chunk.is_empty());
    }

    /// 非空ベクタの F32 バリアントで is_empty() が false を返すことを確認する。
    #[test]
    fn test_audio_chunk_is_empty_false() {
        let chunk = AudioChunk::F32(vec![0.5]);
        assert!(!chunk.is_empty());
    }

    // -----------------------------------------------------------------------
    // AudioChunk — as_i16
    // -----------------------------------------------------------------------

    /// I16 バリアントに対して as_i16() が Some スライスを返すことを確認する。
    #[test]
    fn test_audio_chunk_as_i16_ok() {
        let chunk = AudioChunk::I16(vec![1, 2, 3]);
        assert_eq!(chunk.as_i16(), Some(&[1, 2, 3][..]));
    }

    /// F32 バリアントに対して as_i16() が None を返すことを確認する。
    #[test]
    fn test_audio_chunk_as_i16_none() {
        let chunk = AudioChunk::F32(vec![1.0]);
        assert_eq!(chunk.as_i16(), None);
    }

    // -----------------------------------------------------------------------
    // AudioChunk — as_f32
    // -----------------------------------------------------------------------

    /// F32 バリアントに対して as_f32() が Some スライスを返すことを確認する。
    #[test]
    fn test_audio_chunk_as_f32_ok() {
        let chunk = AudioChunk::F32(vec![1.0]);
        assert_eq!(chunk.as_f32(), Some(&[1.0][..]));
    }

    /// I16 バリアントに対して as_f32() が None を返すことを確認する。
    #[test]
    fn test_audio_chunk_as_f32_none() {
        let chunk = AudioChunk::I16(vec![1]);
        assert_eq!(chunk.as_f32(), None);
    }

    // -----------------------------------------------------------------------
    // AudioChunkPair — new とフィールド
    // -----------------------------------------------------------------------

    /// AudioChunkPair::new() の全フィールドが正しく設定されることを確認する。
    #[test]
    fn test_audio_chunk_pair_new_fields() {
        let call_id = CallId::generate();
        let account_id = AccountId::generate();
        let in_chunk = AudioChunk::I16(vec![10, 20]);
        let out_chunk = AudioChunk::F32(vec![0.1, 0.2]);

        let pair = AudioChunkPair::new(call_id, account_id, in_chunk.clone(), out_chunk.clone());

        assert_eq!(pair.call_id, call_id);
        assert_eq!(pair.account_id, account_id);
        // in_chunk / out_chunk のラウンドトリップ
        assert_eq!(pair.in_chunk.len(), in_chunk.len());
        assert_eq!(pair.out_chunk.len(), out_chunk.len());
        assert_eq!(pair.in_chunk.as_i16(), Some(&[10, 20][..]));
        assert_eq!(pair.out_chunk.as_f32(), Some(&[0.1, 0.2][..]));
    }

    /// AudioChunkPair::new() の timestamp が SystemTime::now() の 5 秒以内であることを確認する。
    #[test]
    fn test_audio_chunk_pair_new_timestamp() -> Result<(), Box<dyn std::error::Error>> {
        let before = SystemTime::now();
        let pair = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::I16(Vec::new()),
            AudioChunk::I16(Vec::new()),
        );
        let after = SystemTime::now();

        let before_dur = pair.timestamp.duration_since(before)?;
        let after_dur = after.duration_since(pair.timestamp)?;

        // 5 秒以内に収まっていること
        assert!(before_dur < Duration::from_secs(5));
        assert!(after_dur < Duration::from_secs(5));
        Ok(())
    }

    // -----------------------------------------------------------------------
    // AudioChunkPair — stereo_i16
    // -----------------------------------------------------------------------

    /// 同長の I16 IN/OUT から L=IN, R=OUT のステレオインタリーブが生成されることを確認する。
    #[test]
    fn test_audio_chunk_pair_stereo_i16_ok() -> Result<(), SipError> {
        let pair = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::I16(vec![1, 2, 3]),
            AudioChunk::I16(vec![10, 20, 30]),
        );
        let stereo = pair.stereo_i16()?;
        // L=IN, R=OUT のインタリーブ
        assert_eq!(stereo, vec![1, 10, 2, 20, 3, 30]);
        Ok(())
    }

    /// 異長の I16 IN/OUT で short な方に切り詰められることを確認する。
    #[test]
    fn test_audio_chunk_pair_stereo_i16_truncate() -> Result<(), SipError> {
        let pair = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::I16(vec![1, 2, 3, 4]), // 4 samples
            AudioChunk::I16(vec![10, 20]),      // 2 samples
        );
        let stereo = pair.stereo_i16()?;
        // OUT が短いので 2 サンプル分に切り詰める
        assert_eq!(stereo, vec![1, 10, 2, 20]);
        Ok(())
    }

    /// IN が F32 の場合、stereo_i16() が InvalidState エラーを返すことを確認する。
    #[test]
    fn test_audio_chunk_pair_stereo_i16_f32_in() {
        let pair = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::F32(vec![1.0]),
            AudioChunk::I16(vec![10]),
        );
        let result = pair.stereo_i16();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("IN chunk is not I16"));
    }

    /// OUT が F32 の場合、stereo_i16() が InvalidState エラーを返すことを確認する。
    #[test]
    fn test_audio_chunk_pair_stereo_i16_f32_out() {
        let pair = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::I16(vec![1]),
            AudioChunk::F32(vec![1.0]),
        );
        let result = pair.stereo_i16();
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("OUT chunk is not I16"));
    }

    // -----------------------------------------------------------------------
    // Clone — 独立したコピー
    // -----------------------------------------------------------------------

    /// AudioChunk の Clone が独立したコピーを生成することを確認する。
    #[test]
    fn test_audio_chunk_clone() {
        let original = AudioChunk::I16(vec![1, 2, 3]);
        let mut cloned = original.clone();
        assert_eq!(cloned.len(), 3);

        // 元の変更が clone に影響しない
        if let AudioChunk::I16(ref mut samples) = cloned {
            samples.push(4);
        }
        assert_eq!(original.len(), 3);
        assert_eq!(cloned.len(), 4);
    }

    /// AudioChunkPair の Clone が独立したコピーを生成することを確認する。
    #[test]
    fn test_audio_chunk_pair_clone() {
        let original = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::I16(vec![1]),
            AudioChunk::I16(vec![2]),
        );
        let mut cloned = original.clone();
        //  clone の out_chunk を変更
        cloned.out_chunk = AudioChunk::I16(vec![99]);
        assert_eq!(
            original.out_chunk.as_i16(),
            Some(&[2][..])
        );
        assert_eq!(cloned.out_chunk.as_i16(), Some(&[99][..]));
    }

    // -----------------------------------------------------------------------
    // Debug
    // -----------------------------------------------------------------------

    /// AudioChunk の Debug 出力がパニックしないことを確認する。
    #[test]
    fn test_audio_chunk_debug() {
        let chunk = AudioChunk::I16(vec![1, 2]);
        let debug_str = format!("{:?}", chunk);
        assert!(!debug_str.is_empty());
    }

    /// AudioChunkPair の Debug 出力がパニックしないことを確認する。
    #[test]
    fn test_audio_chunk_pair_debug() {
        let pair = AudioChunkPair::new(
            CallId::generate(),
            AccountId::generate(),
            AudioChunk::I16(vec![1]),
            AudioChunk::I16(vec![2]),
        );
        let debug_str = format!("{:?}", pair);
        assert!(!debug_str.is_empty());
    }

    // -----------------------------------------------------------------------
    // コンパイル時検証
    // -----------------------------------------------------------------------

    /// AudioChunk が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_audio_chunk_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}

        assert_send::<AudioChunk>();
        assert_sync::<AudioChunk>();
    }

    /// AudioChunkPair が Send + Sync であることをコンパイル時に確認する。
    #[test]
    fn test_audio_chunk_pair_send_sync() {
        fn assert_send<T: Send>() {}
        fn assert_sync<T: Sync>() {}

        assert_send::<AudioChunkPair>();
        assert_sync::<AudioChunkPair>();
    }
}
