//! VadProcessor — Sherpa-ONNX ベースの共通 VAD プロセッサ
//!
//! OpenAI モードおよび OS モード (Mac/Win) で共通して使用可能な
//! 高精度な音声区間検出 (VAD) 機能を提供する。
//!
//! 移植元: ~/shyme/mycute/src/tools/vad_processor.rs（完全移植）

use std::ffi::CString;
use std::mem;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use sherpa_rs_sys as sys;

/// 内部処理用サンプリングレート (16kHz)
pub const VAD_SAMPLE_RATE: i32 = 16000;
/// Silero VAD 推奨ウィンドウサイズ (16kHz 時、32ms 相当)
pub const SILERO_VAD_WINDOW_SIZE: usize = 512;
/// TEN VAD 推奨ウィンドウサイズ (16kHz 時、16ms 相当)
pub const TEN_VAD_WINDOW_SIZE: usize = 256;

/// VAD モデルの種類
#[derive(Debug, Clone, Copy)]
pub enum VadType {
    /// Silero VAD（高精度、やや重い）
    Silero,
    /// TEN VAD（軽量）
    Ten,
}

/// VAD プロセッサの設定
#[derive(Debug, Clone)]
pub struct VadConfig {
    pub vad_type: VadType,
    pub model_path: String,
    pub threshold: f32,
    pub min_silence_duration: f32,
    pub min_speech_duration: f32,
    pub max_speech_duration: f32,
    pub num_threads: i32,
}

/// Sherpa-ONNX VAD を用いて発話状態を管理するプロセッサ
pub struct VadProcessor {
    vad: *const sys::SherpaOnnxVoiceActivityDetector,
    is_speaking: Arc<AtomicBool>,
    window_size: usize,
}

unsafe impl Send for VadProcessor {}
unsafe impl Sync for VadProcessor {}

impl VadProcessor {
    /// 新しい VadProcessor を作成する。
    pub fn new(config: VadConfig, is_speaking: Arc<AtomicBool>) -> Result<Self> {
        let model_path = resolve_ascii_path(&config.model_path);
        let c_model = CString::new(model_path)?;
        let c_provider = CString::new("cpu")?;

        let mut vad_config: sys::SherpaOnnxVadModelConfig = unsafe { mem::zeroed() };
        let window_size = match config.vad_type {
            VadType::Ten => {
                vad_config.ten_vad.model = c_model.as_ptr();
                vad_config.ten_vad.threshold = config.threshold;
                vad_config.ten_vad.min_silence_duration = config.min_silence_duration;
                vad_config.ten_vad.min_speech_duration = config.min_speech_duration;
                vad_config.ten_vad.window_size = TEN_VAD_WINDOW_SIZE as i32;
                TEN_VAD_WINDOW_SIZE
            }
            VadType::Silero => {
                vad_config.silero_vad.model = c_model.as_ptr();
                vad_config.silero_vad.threshold = config.threshold;
                vad_config.silero_vad.min_silence_duration = config.min_silence_duration;
                vad_config.silero_vad.min_speech_duration = config.min_speech_duration;
                vad_config.silero_vad.window_size = SILERO_VAD_WINDOW_SIZE as i32;
                SILERO_VAD_WINDOW_SIZE
            }
        };

        vad_config.sample_rate = VAD_SAMPLE_RATE;
        vad_config.num_threads = config.num_threads;
        vad_config.provider = c_provider.as_ptr();
        vad_config.debug = 0;

        let vad = unsafe {
            sys::SherpaOnnxCreateVoiceActivityDetector(&vad_config, config.max_speech_duration)
        };

        if vad.is_null() {
            return Err(anyhow!("Failed to create SherpaOnnxVoiceActivityDetector"));
        }

        Ok(Self {
            vad,
            is_speaking,
            window_size,
        })
    }

    /// 音声サンプルを入力し、VAD 状態を更新する。
    /// 渡されるデータは 16kHz モノラル f32 である必要がある。
    pub fn accept_waveform(&self, samples: &[f32]) {
        if self.vad.is_null() || samples.is_empty() {
            return;
        }

        unsafe {
            sys::SherpaOnnxVoiceActivityDetectorAcceptWaveform(
                self.vad,
                samples.as_ptr(),
                samples.len() as i32,
            );

            let detected = sys::SherpaOnnxVoiceActivityDetectorDetected(self.vad) == 1;
            self.is_speaking.store(detected, Ordering::SeqCst);
        }
    }

    /// 現在の状態をリセットする。
    pub fn reset(&self) {
        if !self.vad.is_null() {
            unsafe {
                sys::SherpaOnnxVoiceActivityDetectorReset(self.vad);
            }
        }
        self.is_speaking.store(false, Ordering::SeqCst);
    }

    /// 期待されるウィンドウサイズを返す。
    pub fn window_size(&self) -> usize {
        self.window_size
    }

    /// 現在の発話状態を返す。
    pub fn is_speaking(&self) -> bool {
        self.is_speaking.load(Ordering::SeqCst)
    }
}

impl Drop for VadProcessor {
    fn drop(&mut self) {
        if !self.vad.is_null() {
            unsafe {
                sys::SherpaOnnxDestroyVoiceActivityDetector(self.vad);
            }
        }
    }
}

/// Windows 環境で、パスに非 ASCII 文字が含まれる場合に 8.3 短縮名を取得する。
#[cfg(windows)]
fn resolve_ascii_path(path: &str) -> String {
    if let Some(short) = try_get_short_path(path) {
        if short.is_ascii() {
            return short;
        }
    }
    copy_to_ascii_cache(path)
}

#[cfg(windows)]
fn try_get_short_path(path: &str) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::fileapi::GetShortPathNameW;

    let wide: Vec<u16> = OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let mut buf = vec![0u16; 260];
    let len =
        unsafe { GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) } as usize;

    if len > 0 && len <= buf.len() {
        Some(String::from_utf16_lossy(&buf[..len]))
    } else {
        None
    }
}

#[cfg(windows)]
fn copy_to_ascii_cache(original_path: &str) -> String {
    let program_data = match std::env::var("PROGRAMDATA") {
        Ok(p) => p,
        Err(_) => return original_path.to_string(),
    };

    let cache_dir = std::path::Path::new(&program_data)
        .join("mycute")
        .join("vad-models");
    if !cache_dir.exists() {
        if std::fs::create_dir_all(&cache_dir).is_err() {
            return original_path.to_string();
        }
    }

    let original = std::path::Path::new(original_path);
    let filename = match original.file_name() {
        Some(f) => f,
        None => return original_path.to_string(),
    };
    let cache_path = cache_dir.join(filename);

    if !cache_path.exists() {
        let _ = std::fs::copy(original_path, &cache_path);
    }

    cache_path.to_string_lossy().to_string()
}

#[cfg(not(windows))]
fn resolve_ascii_path(path: &str) -> String {
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_silero_window_size() {
        assert_eq!(SILERO_VAD_WINDOW_SIZE, 512);
    }

    #[test]
    fn test_ten_window_size() {
        assert_eq!(TEN_VAD_WINDOW_SIZE, 256);
    }

    #[test]
    fn test_vad_sample_rate() {
        assert_eq!(VAD_SAMPLE_RATE, 16000);
    }

    #[cfg(windows)]
    #[test]
    fn test_short_path_length_matches_windows_api() {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use winapi::um::fileapi::GetShortPathNameW;

        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let file_path = dir.path().join("verylongmodelnameforvad.int8.onnx");
        std::fs::write(&file_path, &[0u8; 1024]).expect("failed to create test file");
        let long_path = file_path.to_string_lossy();

        let short =
            try_get_short_path(long_path.as_ref()).expect("try_get_short_path returned None");

        let wide: Vec<u16> = OsStr::new(long_path.as_ref() as &str)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut buf = vec![0u16; 260];
        let api_len =
            unsafe { GetShortPathNameW(wide.as_ptr(), buf.as_mut_ptr(), buf.len() as u32) }
                as usize;

        assert_eq!(
            short.len(),
            api_len,
            "short path length differs from GetShortPathNameW return value"
        );
    }

    #[cfg(windows)]
    #[test]
    fn test_short_path_file_is_readable() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let file_path = dir.path().join("verylongmodelnameforvad.int8.onnx");
        std::fs::write(&file_path, &[0u8; 1024]).expect("failed to create test file");
        let long_path = file_path.to_string_lossy();

        let short = try_get_short_path(&long_path).expect("try_get_short_path returned None");
        let data = std::fs::read(&short).expect("failed to read file via short path");
        assert_eq!(data.len(), 1024);
    }
}
