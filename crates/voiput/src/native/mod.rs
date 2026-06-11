//! ネイティブ音声認識ライブラリへの FFI バインディング
//!
//! macOS: Swift SpeechHelper（SFSpeechRecognizer / DictationTranscriber）
//! Windows: C# SpeechHelper（WinRT SpeechRecognizer, Native AOT）

#[cfg(target_os = "macos")]
pub(crate) mod mac_ffi;

#[cfg(target_os = "windows")]
pub(crate) mod win_ffi;
