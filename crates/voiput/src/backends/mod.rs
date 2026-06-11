//! 音声認識バックエンド
//!
//! M4-2: OpenAI（Whisper API, 疑似ストリーミング）
//! M4-3: macOS ネイティブ（SFSpeechRecognizer / Tahoe）
//! M4-4: Windows ネイティブ（WinRT SpeechRecognizer）

pub(crate) mod openai;

// M4-3 で追加: pub(crate) mod mac;
// M4-4 で追加: pub(crate) mod win;
