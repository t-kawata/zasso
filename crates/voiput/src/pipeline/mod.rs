//! 音声認識パイプラインコンポーネント
//!
//! M1-1: SincResampler（rubato ラッパー）

pub(crate) mod denoiser;
pub(crate) mod post_correct;
pub(crate) mod punctuation;
pub(crate) mod resampler;
pub(crate) mod signal_filter;
pub(crate) mod vad;
// M3-1 で追加: pub(crate) mod streamer;
