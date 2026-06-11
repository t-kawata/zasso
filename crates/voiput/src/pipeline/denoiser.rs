//! SpeechDenoiser — GTCRN ノイズ除去
//!
//! Sherpa-ONNX の OfflineSpeechDenoiser をラップする。
//! 移植元: ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs（SpeechDenoiser struct を抽出）

use anyhow::{anyhow, Result};
use sherpa_rs_sys as sys;
use std::ffi::CString;

/// GTCRN ノイズ除去プロセッサ
pub struct SpeechDenoiser {
    inner: *const sys::SherpaOnnxOfflineSpeechDenoiser,
}

unsafe impl Send for SpeechDenoiser {}
unsafe impl Sync for SpeechDenoiser {}

impl SpeechDenoiser {
    /// 新しい Denoiser を作成する。
    ///
    /// GTCRN モデルファイル（gtcrn.onnx）へのパスとスレッド数を指定する。
    pub fn new(model_path: &str, num_threads: i32) -> Result<Self> {
        let c_model = CString::new(model_path)?;

        let gtcrn_config = sys::SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig {
            model: c_model.as_ptr(),
        };

        let model_config = sys::SherpaOnnxOfflineSpeechDenoiserModelConfig {
            gtcrn: gtcrn_config,
            num_threads,
            debug: 0,
            provider: std::ptr::null(),
        };

        let config = sys::SherpaOnnxOfflineSpeechDenoiserConfig {
            model: model_config,
        };

        let denoiser = unsafe { sys::SherpaOnnxCreateOfflineSpeechDenoiser(&config) };
        if denoiser.is_null() {
            return Err(anyhow!("Failed to create SherpaOnnxOfflineSpeechDenoiser"));
        }

        Ok(Self { inner: denoiser })
    }

    /// 音声データをデノイズ処理する。
    pub fn run(&self, samples: &[f32], sample_rate: i32) -> Result<Vec<f32>> {
        let n_samples = samples.len() as i32;

        let result_ptr = unsafe {
            sys::SherpaOnnxOfflineSpeechDenoiserRun(
                self.inner,
                samples.as_ptr(),
                n_samples,
                sample_rate,
            )
        };

        if result_ptr.is_null() {
            return Err(anyhow!("Denoiser returned null result."));
        }

        let result = unsafe { &*result_ptr };
        let output_samples = if result.n > 0 && !result.samples.is_null() {
            unsafe { std::slice::from_raw_parts(result.samples, result.n as usize).to_vec() }
        } else {
            Vec::new()
        };

        unsafe { sys::SherpaOnnxDestroyDenoisedAudio(result_ptr) };

        Ok(output_samples)
    }
}

impl Drop for SpeechDenoiser {
    fn drop(&mut self) {
        if !self.inner.is_null() {
            unsafe { sys::SherpaOnnxDestroyOfflineSpeechDenoiser(self.inner) };
        }
    }
}
