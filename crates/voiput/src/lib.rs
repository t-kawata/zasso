//! # voiput — ポータブル音声入力完全 crate
//!
//! 任意の Rust プロジェクトで音声認識（STT）機能を利用するための crate。
//! OpenAI バックエンド、macOS ネイティブ、Windows ネイティブの3バックエンドを統一的に扱う。
//!
//! ## 使用方法
//!
//! ```rust,no_run
//! use voiput::{VoiputConfig, SttEngine, LocaleCode, SttEvent, VadModelPaths};
//!
//! let config = VoiputConfig::builder()
//!     .engine(SttEngine::Os)
//!     .locale(LocaleCode::Ja)
//!     .vad_model_paths(VadModelPaths {
//!         silero: "/path/to/silero.onnx".into(),
//!         ten: "/path/to/ten.onnx".into(),
//!         gtcrn: String::new(),
//!     })
//!     .build().unwrap();
//! println!("{:?}", config.engine);
//! ```

// M0-1: 実装済み
mod constants;
mod error;

mod config;
mod types;

// M1-1 以降で実装
pub(crate) mod pipeline;

// M2-3: 句読点挿入（Lindera IPADIC）
mod lindera_util;

// M2-4: 効果音再生（rodio Actor）
mod audio;

// M1-4: 置換辞書（M5-1 でインターセプタースレッドに統合）
mod recognizer;

mod voiput;

// Phase 4 で実装
mod backends;
mod native;

// M8-1: ホットキー監視
pub mod hotkey;

pub use config::{VoiputConfig, VoiputConfigBuilder};
pub use error::VoiputError;
pub use types::*;

// 内部パイプライン（test-run.rs からアクセス可能にするため pub で re-export）
pub use audio::{init, play_commit_sound, play_ready_sound};
pub use recognizer::SpeechRecognizer;
pub use voiput::Voiput;
pub use lindera_util::get_tokenizer;
pub use pipeline::denoiser::SpeechDenoiser;
pub use pipeline::post_correct::{
    PostCorrectionBackend, PostCorrectionProcessor, ProcessorOutput, SttModelType,
};
pub use pipeline::punctuation::PunctuationMachine;
pub use pipeline::resampler::{InternalResampler, SincResampler};
pub use pipeline::signal_filter::is_worthy_to_run_asr;
pub use backends::openai::{OpenAIBackend, OpenAIRecognizer};
#[cfg(target_os = "macos")]
pub use backends::mac::MacSpeechBackend;
#[cfg(target_os = "windows")]
pub use backends::win::WinSpeechBackend;
pub use pipeline::streamer::{
    AsrBackend, BackendWrapper, PseudoAsrStreamer, StreamerConfig, StreamerEvent, StreamerLocale,
};
pub use pipeline::vad::VadConfig as VadProcessorConfig;
pub use pipeline::vad::VadProcessor;
pub use pipeline::vad::VadType as VadProcessorType;
pub use pipeline::vad::{SILERO_VAD_WINDOW_SIZE, TEN_VAD_WINDOW_SIZE, VAD_SAMPLE_RATE};
pub use recognizer::apply_replaces;
