//! 音声認識パイプラインコンポーネント
//!
//! M1-1: SincResampler（rubato ラッパー）

pub(crate) mod resampler;

// M1-2 で追加: pub(crate) mod post_correct;
// M1-3 で追加: pub(crate) mod signal_filter;
// M2-1 で追加: pub(crate) mod vad;
// M2-2 で追加: pub(crate) mod denoiser;
// M2-3 で追加: pub(crate) mod punctuation;
// M3-1 で追加: pub(crate) mod streamer;
