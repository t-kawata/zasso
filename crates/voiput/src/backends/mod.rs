//! 音声認識バックエンド
//!
//! M4-2: OpenAI（Whisper API, 疑似ストリーミング）
//! M4-3: macOS ネイティブ（SFSpeechRecognizer / Tahoe）
//! M4-4: Windows ネイティブ（WinRT SpeechRecognizer）

pub(crate) mod openai;

#[cfg(target_os = "macos")]
pub(crate) mod mac;

#[cfg(target_os = "windows")]
pub(crate) mod win;
