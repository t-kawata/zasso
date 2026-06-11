//! 音声データのサンプリングレートを変換するリサンプラ
//!
//! rubato クレートを使用して、高品質な Sinc 補間によるリサンプリングを提供する。
//! 移植元: ~/shyme/mycute/src/tools/resampler.rs（完全移植、変更不要）

use rubato::{
    Resampler as RubatoResampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType,
    WindowFunction,
};

/// リサンプラのエラー型
#[derive(Debug)]
pub enum ResamplerError {
    /// 作成失敗（rubato の初期化パラメータが不正）
    CreationFailed(String),
    /// 処理失敗（rubato 内部エラー）
    ProcessFailed(String),
}

impl std::fmt::Display for ResamplerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ResamplerError::CreationFailed(msg) => {
                write!(f, "Resampler creation failed: {}", msg)
            }
            ResamplerError::ProcessFailed(msg) => {
                write!(f, "Resampler process failed: {}", msg)
            }
        }
    }
}

impl std::error::Error for ResamplerError {}

/// リサンプラの共通トレイト
pub trait InternalResampler: Send {
    /// 音声サンプルをリサンプリングする。
    /// 入力データが不十分な場合、内部に残存データとして保持され、次回の呼び出しで使用される。
    fn process(&mut self, input: &[f32]) -> Result<Vec<f32>, ResamplerError>;

    /// 内部の残存データをクリアする。
    fn reset(&mut self);
}

/// Sinc 補間リサンプラ
///
/// rubato の SincFixedIn をラップし、残差データ管理を提供する。
pub struct SincResampler {
    inner: SincFixedIn<f32>,
    residual: Vec<f32>,
    input_rate: u32,
    output_rate: u32,
}

impl SincResampler {
    /// 新しい SincResampler を作成する。
    ///
    /// rubato のパラメータは MYCUTE の実装を踏襲：
    /// - sinc_len: 256（品質と性能のバランス）
    /// - f_cutoff: 0.95（ナイキスト周波数の95%まで通過）
    /// - 補間方式: Linear（十分な品質）
    /// - 窓関数: BlackmanHarris2（サイドローブ抑制）
    pub fn new(input_rate: u32, output_rate: u32) -> Result<Self, ResamplerError> {
        let resample_ratio = output_rate as f64 / input_rate as f64;
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: WindowFunction::BlackmanHarris2,
        };

        let inner = SincFixedIn::<f32>::new(
            resample_ratio,
            2.0,
            params,
            1024,
            1, // mono
        )
        .map_err(|e| ResamplerError::CreationFailed(format!("{:?}", e)))?;

        Ok(Self {
            inner,
            residual: Vec::new(),
            input_rate,
            output_rate,
        })
    }

    /// 入力サンプリングレートを返す
    pub fn input_rate(&self) -> u32 {
        self.input_rate
    }

    /// 出力サンプリングレートを返す
    pub fn output_rate(&self) -> u32 {
        self.output_rate
    }
}

impl InternalResampler for SincResampler {
    fn process(&mut self, input: &[f32]) -> Result<Vec<f32>, ResamplerError> {
        if input.is_empty() {
            return Ok(Vec::new());
        }

        // 前回の残存データと今回の入力を結合
        let mut all_samples = std::mem::take(&mut self.residual);
        all_samples.extend_from_slice(input);

        let mut output = Vec::new();
        let mut offset = 0;

        while offset < all_samples.len() {
            let frames_needed = self.inner.input_frames_next();
            if offset + frames_needed > all_samples.len() {
                break;
            }

            let chunk = &all_samples[offset..offset + frames_needed];
            let input_vecs = vec![chunk.to_vec()];

            match self.inner.process(&input_vecs, None) {
                Ok(result) => {
                    if !result.is_empty() && !result[0].is_empty() {
                        output.extend_from_slice(&result[0]);
                    }
                }
                Err(e) => return Err(ResamplerError::ProcessFailed(format!("{:?}", e))),
            }
            offset += frames_needed;
        }

        // 処理しきれなかった分を残存データとして保持
        self.residual = all_samples[offset..].to_vec();

        Ok(output)
    }

    fn reset(&mut self) {
        self.residual.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sinc_resampler_48k_to_16k() {
        let mut resampler = SincResampler::new(48000, 16000).unwrap();
        let input: Vec<f32> = (0..4800).map(|i| (i as f32 * 0.01).sin()).collect();
        let output = resampler.process(&input).unwrap();
        assert!(output.len() > input.len() / 4);
        assert!(output.len() < input.len() / 2);
    }

    #[test]
    fn test_resampler_reset() {
        let mut resampler = SincResampler::new(48000, 16000).unwrap();
        let input = vec![0.5f32; 2048];
        let _ = resampler.process(&input).unwrap();
        resampler.reset();
        let output = resampler.process(&input).unwrap();
        assert!(!output.is_empty());
    }

    #[test]
    fn test_pass_through_same_rate() {
        let mut resampler = SincResampler::new(16000, 16000).unwrap();
        let input = vec![1.0f32; 1024];
        let output = resampler.process(&input).unwrap();
        assert!(!output.is_empty());
    }

    #[test]
    fn test_empty_input() {
        let mut resampler = SincResampler::new(48000, 16000).unwrap();
        let output = resampler.process(&[]).unwrap();
        assert!(output.is_empty());
    }

    #[test]
    fn test_deterministic_output() {
        let mut r1 = SincResampler::new(48000, 16000).unwrap();
        let mut r2 = SincResampler::new(48000, 16000).unwrap();
        let input: Vec<f32> = (0..4800).map(|i| ((i * 37) as f32 * 0.01).sin()).collect();
        let out1 = r1.process(&input).unwrap();
        let out2 = r2.process(&input).unwrap();
        assert_eq!(out1, out2);
    }
}
