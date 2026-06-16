//! テストフィクスチャ — 音声認識テスト用のサンプル音声ファイルを提供する。
//!
//! # サンプル音声
//!
//! - `sample-voice.wav`: 日本語音声（「こんにちは。今日はいい天気ですね。
//!   こんな日はお散歩に行きたくなりますね。」）
//!   - 16kHz / モノラル / PCM s16le / 7.08 秒
//!   - 話者: 開発者（Toshimi Kawata）
//!
//! # 使用方法（M8-1 結合テスト）
//!
//! ```rust,ignore
//! use crate::fixtures::load_sample_wav;
//! let samples = load_sample_wav();
//! ```

use std::path::PathBuf;

/// フィクスチャディレクトリのパスを返す。
fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures")
}

/// sample-voice.wav を読み込み、モノラル f32 PCM として返す。
///
/// # Panics
///
/// - WAV ファイルが存在しない場合
/// - WAV ファイルが 16kHz / モノラル / 16bit でない場合
pub fn load_sample_wav() -> Vec<f32> {
    let path = fixtures_dir().join("sample-voice.wav");
    let mut reader = hound::WavReader::open(&path)
        .expect(&format!("テスト用 WAV ファイルが見つかりません: {}", path.display()));

    let spec = reader.spec();
    assert_eq!(spec.channels, 1, "sample-voice.wav はモノラルである必要があります");
    assert_eq!(spec.sample_rate, 16000, "sample-voice.wav は 16000Hz である必要があります");
    assert_eq!(spec.bits_per_sample, 16, "sample-voice.wav は 16bit である必要があります");

    reader.samples::<i16>()
        .filter_map(Result::ok)
        .map(|s| s as f32 / i16::MAX as f32)
        .collect()
}
