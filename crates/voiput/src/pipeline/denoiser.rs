//! SpeechDenoiser — GTCRN ノイズ除去
//!
//! Sherpa-ONNX の OfflineSpeechDenoiser をラップする。
//! 移植元: ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs（SpeechDenoiser struct を抽出）
//! API 置き換え: sherpa_rs_sys（低レベルFFI）→ sherpa_onnx（safe Rust API）

use anyhow::{anyhow, Result};
use sherpa_onnx::{
    DenoisedAudio, OfflineSpeechDenoiser, OfflineSpeechDenoiserConfig,
    OfflineSpeechDenoiserGtcrnModelConfig, OfflineSpeechDenoiserModelConfig,
};

/// GTCRN ノイズ除去プロセッサ
pub struct SpeechDenoiser {
    /// sherpa-onnx の safe Rust ラッパー（RAII、Drop 自動処理）
    inner: Option<OfflineSpeechDenoiser>,
}

impl SpeechDenoiser {
    /// 新しい Denoiser を作成する。
    ///
    /// GTCRN モデルファイル（gtcrn.onnx）へのパスとスレッド数を指定する。
    pub fn new(model_path: &str, num_threads: i32) -> Result<Self> {
        let gtcrn = OfflineSpeechDenoiserGtcrnModelConfig {
            model: Some(model_path.to_string()),
        };

        let model_config = OfflineSpeechDenoiserModelConfig {
            gtcrn,
            num_threads,
            ..Default::default()
        };

        let config = OfflineSpeechDenoiserConfig {
            model: model_config,
        };

        let denoiser = OfflineSpeechDenoiser::create(&config)
            .ok_or_else(|| anyhow!("Failed to create OfflineSpeechDenoiser"))?;

        Ok(Self {
            inner: Some(denoiser),
        })
    }

    /// 音声データをデノイズ処理する。
    pub fn run(&self, samples: &[f32], sample_rate: i32) -> Result<Vec<f32>> {
        let denoiser = self
            .inner
            .as_ref()
            .ok_or_else(|| anyhow!("SpeechDenoiser not initialized"))?;
        let audio: DenoisedAudio = denoiser.run(samples, sample_rate);
        Ok(audio.samples)
    }
}
