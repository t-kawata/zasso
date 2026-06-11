//! VadProcessor — Sherpa-ONNX ベースの共通 VAD プロセッサ
//!
//! OpenAI モードおよび OS モード (Mac/Win) で共通して使用可能な
//! 高精度な音声区間検出 (VAD) 機能を提供する。
//!
//! 移植元: ~/shyme/mycute/src/tools/vad_processor.rs
//! API 置き換え: sherpa_rs_sys（低レベルFFI）→ sherpa_onnx（safe Rust API）

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use sherpa_onnx::{SileroVadModelConfig, TenVadModelConfig, VadModelConfig, VoiceActivityDetector};

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
    /// sherpa-onnx の safe Rust ラッパー（RAII、Drop 自動処理）
    vad: Option<VoiceActivityDetector>,
    /// 発話状態（外部からも参照可能）
    is_speaking: Arc<AtomicBool>,
    /// VAD モデルのウィンドウサイズ
    window_size: usize,
}

impl VadProcessor {
    /// 新しい VadProcessor を作成する。
    pub fn new(config: VadConfig, is_speaking: Arc<AtomicBool>) -> Result<Self> {
        let model_path = resolve_ascii_path(&config.model_path);

        let (vad_config, window_size) = match config.vad_type {
            VadType::Ten => {
                let mut ten = TenVadModelConfig::default();
                ten.model = Some(model_path);
                ten.threshold = config.threshold;
                ten.min_silence_duration = config.min_silence_duration;
                ten.min_speech_duration = config.min_speech_duration;
                ten.window_size = TEN_VAD_WINDOW_SIZE as i32;
                ten.max_speech_duration = config.max_speech_duration;
                let cfg = VadModelConfig {
                    ten_vad: ten,
                    sample_rate: VAD_SAMPLE_RATE,
                    num_threads: config.num_threads,
                    ..Default::default()
                };
                (cfg, TEN_VAD_WINDOW_SIZE)
            }
            VadType::Silero => {
                let mut silero = SileroVadModelConfig::default();
                silero.model = Some(model_path);
                silero.threshold = config.threshold;
                silero.min_silence_duration = config.min_silence_duration;
                silero.min_speech_duration = config.min_speech_duration;
                silero.window_size = SILERO_VAD_WINDOW_SIZE as i32;
                silero.max_speech_duration = config.max_speech_duration;
                let cfg = VadModelConfig {
                    silero_vad: silero,
                    sample_rate: VAD_SAMPLE_RATE,
                    num_threads: config.num_threads,
                    ..Default::default()
                };
                (cfg, SILERO_VAD_WINDOW_SIZE)
            }
        };

        let vad = VoiceActivityDetector::create(&vad_config, config.max_speech_duration)
            .ok_or_else(|| anyhow!("Failed to create VoiceActivityDetector"))?;

        Ok(Self {
            vad: Some(vad),
            is_speaking,
            window_size,
        })
    }

    /// 音声サンプルを入力し、VAD 状態を更新する。
    /// 渡されるデータは 16kHz モノラル f32 である必要がある。
    pub fn accept_waveform(&self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        if let Some(ref vad) = self.vad {
            vad.accept_waveform(samples);
            let detected = vad.detected();
            self.is_speaking.store(detected, Ordering::SeqCst);
        }
    }

    /// 現在の状態をリセットする。
    pub fn reset(&self) {
        if let Some(ref vad) = self.vad {
            vad.reset();
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

        assert_eq!(short.len(), api_len);
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
