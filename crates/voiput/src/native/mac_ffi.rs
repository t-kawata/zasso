//! macOS Swift SpeechHelper への C FFI バインディング
//!
//! 移植元: ~/shyme/mycute/src/stt/mac.rs（28〜53行目: extern "C" ブロック）
//!
//! このファイルの extern 関数は M4-3（MacSpeechBackend）で使用されるまで
//! 未使用となる。dead_code 警告を抑制する。

#![allow(dead_code)]

use std::ffi::c_char;

// Swift SpeechHelper ライブラリへのリンク指定
#[link(name = "SpeechHelper")]
extern "C" {
    /// 音声認識エンジンを初期化する
    pub fn speech_helper_init(speech_timeout_sec: f64) -> i32;
    /// マイク・音声認識の権限をリクエストする
    pub fn speech_helper_request_authorization() -> i32;
    /// 認識結果を受け取るコールバックを設定する
    pub fn speech_helper_set_result_callback(callback: extern "C" fn(*const c_char, i32));
    /// エラーを受け取るコールバックを設定する
    pub fn speech_helper_set_error_callback(callback: extern "C" fn(*const c_char));
    /// 準備完了通知のコールバックを設定する
    pub fn speech_helper_set_ready_callback(callback: extern "C" fn());
    /// 音声データを受け取るコールバックを設定する（OpenAI モード用）
    pub fn speech_helper_set_audio_data_callback(
        callback: Option<extern "C" fn(*const f32, i32, i32)>,
    );
    /// 音声キャプチャを開始する（OpenAI モード用）
    pub fn speech_helper_start_capture() -> i32;
    /// 音声キャプチャを停止する
    pub fn speech_helper_stop_capture();
    /// 音声認識セッションを開始する（Classic / Tahoe）
    pub fn speech_helper_start(locale: *const c_char) -> i32;
    /// 音声認識セッションを停止する
    pub fn speech_helper_stop();
    /// リソースをクリーンアップする
    pub fn speech_helper_cleanup();
    /// メッセージポンプを駆動する
    pub fn speech_helper_tick();
    /// Tahoe エンジンを初期化する（macOS 15+）
    pub fn tahoe_helper_init(locale: *const c_char, speech_timeout_sec: f64) -> i32;
    /// Tahoe 認識セッションを開始する
    pub fn tahoe_helper_start(locale: *const c_char) -> i32;
    /// Tahoe 認識セッションを停止する
    pub fn tahoe_helper_stop();
}
