//! STT 関連の内部定数
//!
//! 移植元: ~/shyme/mycute/src/constants.rs から STT 関連10定数のみ抽出
//!
//! これらの定数は後続チケット（M2: sherpa-onnx, M3: streamer 等）で使用される。
//! 定義時点では未使用のため dead_code 警告を抑制する。

#![allow(dead_code)]

// ============================================================
// タイムアウト・間隔
// ============================================================

/// 発話タイムアウト（秒）— 無音状態がこの時間続くと認識セッションを自動終了する
pub(crate) const SPEECH_TIMEOUT_SEC: f64 = 30.0;

/// 無音句読点タイムアウト（ミリ秒）— Windows バックエンドで
/// OS からの新規テキストがこの時間届かない場合、句読点挿入を強制実行する
pub(crate) const STT_TIMEOUT_PUNCTUATION_MS: u64 = 500;

/// 事後補正の沈黙待機時間（ミリ秒）— 発話終了後、この時間沈黙が続いたら LLM 補正を実行する
pub(crate) const POST_CORRECTION_SILENCE_WAIT_MS: u64 = 850;

/// 装飾表示の更新間隔（ミリ秒）— 認識待機中の "…" アニメーションの周期
pub(crate) const STT_DECORATION_INTERVAL_MS: u64 = 180;

/// OpenAI 準備遅延（ミリ秒）— 無線ヘッドセットがスリープから復帰するのを待つ時間
pub(crate) const OPENAI_READY_DELAY_MS: u64 = 250;

// ============================================================
// モデルファイル名
// ============================================================

pub(crate) const MODEL_FILENAME_SILERO_VAD: &str = "silero_vad.onnx";
pub(crate) const MODEL_FILENAME_SILERO_VAD_INT8: &str = "silero_vad.int8.onnx";
pub(crate) const MODEL_FILENAME_TEN_VAD: &str = "ten_vad.onnx";
pub(crate) const MODEL_FILENAME_TEN_VAD_INT8: &str = "ten-vad.int8.onnx";
pub(crate) const MODEL_FILENAME_GTCRN: &str = "gtcrn.onnx";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_speech_timeout_sec() {
        assert_eq!(SPEECH_TIMEOUT_SEC, 30.0);
    }

    #[test]
    fn test_stt_timeout_punctuation_ms() {
        assert_eq!(STT_TIMEOUT_PUNCTUATION_MS, 500);
    }

    #[test]
    fn test_post_correction_silence_wait_ms() {
        assert_eq!(POST_CORRECTION_SILENCE_WAIT_MS, 850);
    }

    #[test]
    fn test_stt_decoration_interval_ms() {
        assert_eq!(STT_DECORATION_INTERVAL_MS, 180);
    }

    #[test]
    fn test_openai_ready_delay_ms() {
        assert_eq!(OPENAI_READY_DELAY_MS, 250);
    }

    #[test]
    fn test_model_filenames() {
        assert_eq!(MODEL_FILENAME_SILERO_VAD, "silero_vad.onnx");
        assert_eq!(MODEL_FILENAME_SILERO_VAD_INT8, "silero_vad.int8.onnx");
        assert_eq!(MODEL_FILENAME_TEN_VAD, "ten_vad.onnx");
        assert_eq!(MODEL_FILENAME_TEN_VAD_INT8, "ten-vad.int8.onnx");
        assert_eq!(MODEL_FILENAME_GTCRN, "gtcrn.onnx");
    }
}
