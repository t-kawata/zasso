//! # voiput — ポータブル音声入力完全 crate
//!
//! 任意の Rust プロジェクトで音声認識（STT）機能を利用するための crate。
//! OpenAI バックエンド、macOS ネイティブ、Windows ネイティブの3バックエンドを統一的に扱う。
//!
//! ## 使用方法
//!
//! ```rust,no_run
//! use voiput::{VoiceKitConfig, SttEngine, LocaleCode, SttEvent, VadModelPaths};
//!
//! let config = VoiceKitConfig::builder()
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

// M2-3 で実装
// mod lindera_util;

// M2-4 で実装
// mod audio;

// M1-4: 置換辞書（M5-1 でインターセプタースレッドに統合）
mod recognizer;

// M5-2 で実装
// mod voice_kit;

// Phase 4 で実装
// mod backends;
// mod native;

pub use config::{VoiceKitConfig, VoiceKitConfigBuilder};
pub use error::VoiceKitError;
pub use types::*;

// 内部パイプライン（test-run.rs からアクセス可能にするため pub で re-export）
pub use pipeline::post_correct::{
    PostCorrectionBackend, PostCorrectionProcessor, ProcessorOutput, SttModelType,
};
pub use pipeline::resampler::{InternalResampler, SincResampler};
pub use pipeline::signal_filter::is_worthy_to_run_asr;
pub use recognizer::apply_replaces;
