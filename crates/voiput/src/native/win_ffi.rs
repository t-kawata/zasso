//! Windows C# SpeechHelper への C FFI バインディング + ヘルスチェック状態管理
//!
//! 移植元: ~/shyme/mycute/src/stt/win.rs（26〜42行目: extern "C" ブロック、57〜87行目: ヘルスチェック状態）

use std::ffi::{c_char, c_int};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

/// C# SpeechHelper ライブラリへの静的リンク指定
#[link(name = "SpeechHelper", kind = "static")]
extern "C" {
    /// 音声認識エンジンを初期化する
    pub fn speech_helper_init(speech_timeout_sec: f64) -> c_int;
    /// 認識結果を受け取るコールバックを設定する
    pub fn speech_helper_set_result_callback(callback: extern "C" fn(*const c_char, c_int));
    /// エラーを受け取るコールバックを設定する
    pub fn speech_helper_set_error_callback(callback: extern "C" fn(*const c_char));
    /// 準備完了通知のコールバックを設定する
    pub fn speech_helper_set_ready_callback(callback: extern "C" fn());
    /// 音声データを受け取るコールバックを設定する（OpenAI モード用）
    pub fn speech_helper_set_audio_data_callback(
        callback: Option<extern "C" fn(*const f32, u32, u32)>,
    );
    /// 音声キャプチャを開始する（OpenAI モード用）
    pub fn speech_helper_start_capture() -> c_int;
    /// 音声キャプチャを停止する
    pub fn speech_helper_stop_capture();
    /// 音声認識セッションを開始する
    pub fn speech_helper_start(locale: *const c_char) -> c_int;
    /// 音声認識セッションを停止する
    pub fn speech_helper_stop();
    /// リソースをクリーンアップする
    pub fn speech_helper_cleanup();
    /// メッセージポンプを駆動する
    pub fn speech_helper_tick();
    /// IME を無効化する（音声入力開始時）
    pub fn speech_helper_disable_ime();
    /// IME を復元する（音声入力終了時）
    pub fn speech_helper_restore_ime();
    /// 音声入力設定のヘルスチェックを実行する（戻り値: ビットマスク）
    pub fn speech_helper_check_health() -> c_int;
}

// ============================================================================
// ヘルスチェック状態管理
// ============================================================================

/// 音声入力設定のヘルスチェック結果（ビットマスク, 0 = 正常）
/// bit 0: 音声認識モデル未インストール
/// bit 1: 音声認識プライバシー OFF
/// bit 2: マイク権限なし
static WIN_HEALTH_CHECK: AtomicU32 = AtomicU32::new(0);

/// ヘルスチェック結果の確認済みフラグ（ダイアログ閉じたら frontend から設定）
static WIN_HEALTH_CHECKED: AtomicBool = AtomicBool::new(false);

/// ヘルスチェック結果を取得する
pub fn health_check_result() -> u32 {
    WIN_HEALTH_CHECK.load(Ordering::Relaxed)
}

/// ヘルスチェック結果を保存する
pub fn store_health_check_result(result: u32) {
    WIN_HEALTH_CHECK.store(result, Ordering::Relaxed);
}

/// ヘルスチェックの確認状態を取得する
pub fn is_health_check_acknowledged() -> bool {
    WIN_HEALTH_CHECKED.load(Ordering::Relaxed)
}

/// ヘルスチェック結果を確認済みとしてマークする
pub fn acknowledge_health_check() {
    WIN_HEALTH_CHECKED.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_health_check_default() {
        assert_eq!(health_check_result(), 0);
        assert!(!is_health_check_acknowledged());
    }

    #[test]
    fn test_health_check_store_and_read() {
        store_health_check_result(5); // bit 0 + bit 2
        assert_eq!(health_check_result(), 5);
        store_health_check_result(0); // reset
    }

    #[test]
    fn test_health_check_acknowledge() {
        assert!(!is_health_check_acknowledged());
        acknowledge_health_check();
        assert!(is_health_check_acknowledged());
        // reset
        std::sync::atomic::compiler_fence(Ordering::SeqCst);
    }
}
