//! # ResamplePipeline — サンプルレート変換
//!
//! 内部処理フォーマットと出力フォーマットの変換パイプライン。
//! RFC §26 に準拠。
//!
//! 現状は同一レートのバイパスモードのみ対応。
//! 異なるレート間の変換は [::STUB::] M16-2（チケット #129）で rubato 統合。

use crate::error::SipError;

/// リサンプルパイプライン。
///
/// 現状は同一レートのパススルーのみ。
#[allow(dead_code)]
pub(crate) struct ResamplePipeline {
    /// 入力サンプルレート。
    in_rate: u32,
    /// 出力サンプルレート。
    out_rate: u32,
}

#[allow(dead_code)]
impl ResamplePipeline {
    /// 新しい `ResamplePipeline` を生成する。
    ///
    /// 現状は `in_rate == out_rate` のみサポート。
    /// 異なるレートの場合は `InvalidConfig` を返す。
    pub fn new(in_rate: u32, out_rate: u32) -> Result<Self, SipError> {
        if in_rate != out_rate {
            return Err(SipError::invalid_config(
                "ResamplePipeline: sample rate conversion requires rubato (see M17-2)",
            ));
        }
        Ok(Self { in_rate, out_rate })
    }

    /// IN チャネルのリサンプル処理（パススルー）。
    pub fn process_in(&mut self, in_mono_i16: &[i16]) -> Result<Vec<i16>, SipError> {
        Ok(in_mono_i16.to_vec())
    }

    /// OUT チャネルのリサンプル処理（パススルー）。
    pub fn process_out(&mut self, out_mono_i16: &[i16]) -> Result<Vec<i16>, SipError> {
        Ok(out_mono_i16.to_vec())
    }

    /// 内部状態をリセットする（バイパスモードでは no-op）。
    pub fn reset(&mut self) {
        // no-op
    }
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_identity_rate() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 16000)?;
        let input = vec![0i16, 1000, -1000];
        assert_eq!(pipeline.process_in(&input)?, input);
        assert_eq!(pipeline.process_out(&input)?, input);
        Ok(())
    }

    #[test]
    fn test_different_rate_returns_error() {
        let result = ResamplePipeline::new(16000, 8000);
        assert!(result.is_err());
    }

    #[test]
    fn test_reset_noop() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 16000)?;
        pipeline.reset();
        let input = vec![100i16; 256];
        assert_eq!(pipeline.process_in(&input)?, input);
        Ok(())
    }

    #[test]
    fn test_empty_input() -> Result<(), SipError> {
        let mut pipeline = ResamplePipeline::new(16000, 16000)?;
        assert!(pipeline.process_in(&[])?.is_empty());
        Ok(())
    }
}
