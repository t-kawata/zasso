//! # ResamplePipeline — サンプルレート変換
//!
//! 内部処理フォーマットと出力フォーマットの変換パイプライン。
//! RFC §26 に準拠。
//!
//! 同一レートはパススルー、異なるレートは rubato の FFT リサンプラーで変換する。

use rubato::{audioadapter_buffers::owned::InterleavedOwned, Fft, FixedSync, Resampler};

use crate::error::SipError;

/// リサンプルパイプライン。
/// AudioWorker 統合まではテストのみで使用される。
#[allow(dead_code)]
pub(crate) struct ResamplePipeline {
    /// 入力サンプルレート。
    in_rate: u32,
    /// 出力サンプルレート。
    out_rate: u32,
    /// rubato リサンプラー（in_rate == out_rate の場合は None）。
    resampler: Option<Fft<f64>>,
}

#[allow(dead_code)]
impl ResamplePipeline {
    /// 新しい `ResamplePipeline` を生成する。
    ///
    /// `in_rate == out_rate` の場合はパススルー、
    /// 異なる場合は rubato の FFT リサンプラーを作成する。
    pub fn new(in_rate: u32, out_rate: u32) -> Result<Self, SipError> {
        if in_rate == out_rate {
            return Ok(Self {
                in_rate,
                out_rate,
                resampler: None,
            });
        }
        let chunk_size = 512; // 1 処理あたりの入力フレーム数
        let resampler = Fft::<f64>::new(
            in_rate as usize,
            out_rate as usize,
            chunk_size,
            1, // sub_chunks
            1, // mono
            FixedSync::Input,
        )
        .map_err(|e| SipError::invalid_config(format!("rubato init failed: {e}")))?;
        Ok(Self {
            in_rate,
            out_rate,
            resampler: Some(resampler),
        })
    }

    /// IN チャネルのリサンプル処理。
    ///
    /// 同一レート時はパススルー、異なるレート時は rubato で変換する。
    pub fn process_in(&mut self, in_mono_i16: &[i16]) -> Result<Vec<i16>, SipError> {
        self.process(in_mono_i16)
    }

    /// OUT チャネルのリサンプル処理（IN と同一処理）。
    pub fn process_out(&mut self, out_mono_i16: &[i16]) -> Result<Vec<i16>, SipError> {
        self.process(out_mono_i16)
    }

    /// 内部の共通リサンプル処理。
    fn process(&mut self, input: &[i16]) -> Result<Vec<i16>, SipError> {
        let Some(ref mut resampler) = self.resampler else {
            // 同一レート: パススルー
            return Ok(input.to_vec());
        };

        if input.is_empty() {
            return Ok(Vec::new());
        }

        // i16 → f64 変換（正規化）
        let in_f64: Vec<f64> = input.iter().map(|&s| s as f64 / i16::MAX as f64).collect();

        // rubato の入力アダプターを作成
        let in_adapter = InterleavedOwned::<f64>::new_from(in_f64, 1, input.len())
            .map_err(|e| SipError::invalid_config(format!("buffer init failed: {e}")))?;

        // rubato 処理
        let result = resampler
            .process(&in_adapter, 0, None)
            .map_err(|e| SipError::invalid_config(format!("rubato process failed: {e}")))?;

        // f64 → i16 変換（非正規化）
        let out_data = result.take_data();
        let out_i16: Vec<i16> = out_data
            .iter()
            .map(|&s| (s * i16::MAX as f64) as i16)
            .collect();

        Ok(out_i16)
    }

    /// 内部状態をリセットする。
    pub fn reset(&mut self) {
        if let Some(ref mut resampler) = self.resampler {
            resampler.reset();
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// 同一レートでは入出力が一致することを確認する。
    #[test]
    fn test_identity_rate() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 16000)?;
        let input = vec![0i16, 1000, -1000];
        assert_eq!(pipeline.process_in(&input)?, input);
        assert_eq!(pipeline.process_out(&input)?, input);
        Ok(())
    }

    /// 16kHz→8kHz 変換で rubato のチャンク処理が正しく動作することを確認する。
    #[test]
    fn test_downsample_16k_to_8k() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 8000)?;
        let input = vec![1000i16; 512];
        let output = pipeline.process_in(&input)?;
        // output_frames_next() はチャンク処理の出力フレーム数を返す
        assert!(!output.is_empty(), "output should not be empty");
        Ok(())
    }

    /// 8kHz→48kHz 変換でアップサンプリングが動作することを確認する。
    #[test]
    fn test_upsample_8k_to_48k() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(8000, 48000)?;
        let input = vec![500i16; 512];
        let output = pipeline.process_in(&input)?;
        assert!(!output.is_empty(), "output should not be empty");
        Ok(())
    }

    /// 空入力は空出力になることを確認する。
    #[test]
    fn test_empty_input() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 8000)?;
        let output = pipeline.process_in(&[])?;
        assert!(output.is_empty());
        Ok(())
    }

    /// reset() 呼び出し後も正しく動作することを確認する。
    #[test]
    fn test_reset_continues() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 8000)?;
        let input = vec![1000i16; 512];
        let first = pipeline.process_in(&input)?;
        pipeline.reset();
        let second = pipeline.process_in(&input)?;
        assert!(!first.is_empty());
        assert!(!second.is_empty());
        Ok(())
    }

    /// 同一レート + reset が no-op であることを確認する。
    #[test]
    fn test_reset_identity() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 16000)?;
        pipeline.reset();
        let input = vec![100i16; 256];
        assert_eq!(pipeline.process_in(&input)?, input);
        Ok(())
    }
}
