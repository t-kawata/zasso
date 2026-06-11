//! 公開型定義 — crate 利用者が触れる型を集約する
//!
//! 移植元: ~/shyme/mycute/src/types.rs（SttEvent, LocaleCode）
//!        ~/shyme/mycute/src/mycute_settings.rs（SttEngine, VadType, SttSettings の分解）

// ============================================================================
// 音声認識エンジン
// ============================================================================

/// 音声認識エンジンの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SttEngine {
    /// OpenAI Whisper API（疑似ストリーミング）
    OpenAI,
    /// OS ネイティブ認識（macOS: SFSpeechRecognizer / Windows: WinRT）
    #[default]
    Os,
}

// ============================================================================
// 言語ロケール
// ============================================================================

/// 認識と言語ロケール
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LocaleCode {
    /// 日本語
    #[default]
    Ja,
    /// 英語
    En,
}

impl LocaleCode {
    /// 短縮コード（"ja", "en"）
    pub fn as_str(&self) -> &'static str {
        match self {
            LocaleCode::Ja => "ja",
            LocaleCode::En => "en",
        }
    }

    /// macOS/Windows ネイティブ API 用の BCP-47 タグ（"ja-JP", "en-US"）
    pub fn as_bcp47(&self) -> &'static str {
        match self {
            LocaleCode::Ja => "ja-JP",
            LocaleCode::En => "en-US",
        }
    }

    /// OpenAI API 用の ISO-639-1 コード（"ja", "en"）
    pub fn as_iso639_1(&self) -> &'static str {
        match self {
            LocaleCode::Ja => "ja",
            LocaleCode::En => "en",
        }
    }
}

// ============================================================================
// SttEvent — 認識イベント
// ============================================================================

/// 音声認識エンジンから利用者に送られるイベント
///
/// MYCUTE の SttEvent（src/types.rs）と完全互換。
#[derive(Debug, Clone)]
pub enum SttEvent {
    /// 部分認識結果（表示用、上書きされる可能性あり）
    PartialResult(String, u64),
    /// 確定認識結果
    FinalResult(String, u64),
    /// 認識開始
    Started,
    /// エラー発生
    Error(String),
    /// 認識停止
    Stopped,
    /// 録音準備完了（マイク/ハードウェア開放完了）
    Ready,
    /// LLM 事後補正 開始
    PostCorrectionStarted,
    /// LLM 事後補正 完了
    PostCorrectionFinished,
    /// ASR API 呼び出し中（装飾表示中）
    SttPending,
    /// ASR API 呼び出し完了
    SttCompleted,
    /// 装飾表示の強制クリア（異常検知時）
    ForceClearDecoration,
    /// 装飾フレーム（表示用アニメーション）
    DecorationPartial(String),
}

// ============================================================================
// 設定用構造体
// ============================================================================

/// OpenAI 接続設定
#[derive(Debug, Clone)]
pub struct OpenAiConfig {
    /// OpenAI API 互換のベース URL
    pub base_url: String,
    /// API キー
    pub api_key: String,
    /// 使用モデル名（例: "gpt-4o-mini-transcribe"）
    pub model: String,
}

/// VAD モデルファイルへのパス群
///
/// silero と ten は必須（同じパスでも可）。
/// gtcrn は空文字列でノイズ除去を無効化する。
#[derive(Debug, Clone)]
pub struct VadModelPaths {
    /// Silero VAD モデルのパス
    pub silero: String,
    /// TEN VAD モデルのパス（silero と同じでも可）
    pub ten: String,
    /// GTCRN ノイズ除去モデルのパス（空文字で無効）
    pub gtcrn: String,
}

/// VAD アルゴリズムの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VadType {
    #[default]
    Silero,
    Ten,
}

/// VAD 設定
#[derive(Debug, Clone)]
pub struct VadConfig {
    /// VAD アルゴリズム（Silero / Ten）
    pub vad_type: VadType,
    /// 発話検知閾値 (0.0〜1.0, デフォルト 0.5)
    pub threshold: f32,
    /// 発話終了とみなす無音時間（秒, デフォルト 0.2）
    pub min_silence_duration: f32,
    /// 発話開始とみなす最小音声時間（秒, デフォルト 0.25）
    pub min_speech_duration: f32,
    /// 最大発話時間（秒, デフォルト 25.0）
    pub max_speech_duration: f32,
    /// 発話開始前に遡って保持する時間（ミリ秒, デフォルト 100）
    pub pre_padding_ms: u64,
    /// 認識対象とする最小発話長（ミリ秒, デフォルト 300）
    pub utterance_min_ms: u64,
    /// Sherpa-ONNX のスレッド数（デフォルト 4）
    pub num_threads: i32,
}

impl Default for VadConfig {
    fn default() -> Self {
        Self {
            vad_type: VadType::default(),
            threshold: 0.5,
            min_silence_duration: 0.2,
            min_speech_duration: 0.25,
            max_speech_duration: 25.0,
            pre_padding_ms: 100,
            utterance_min_ms: 300,
            num_threads: 4,
        }
    }
}

/// 事後補正設定（LLM によるテキスト補正の条件）
#[derive(Debug, Clone)]
pub struct PostCorrectionConfig {
    /// 補正を起動する文数閾値（デフォルト 3）
    pub sentence_count_threshold: usize,
    /// 補正を起動する最小文字数（デフォルト 10）
    pub min_text_length: usize,
    /// 補正実行の最小間隔（ミリ秒, デフォルト 2000）
    pub interval_ms: u64,
}

impl Default for PostCorrectionConfig {
    fn default() -> Self {
        Self {
            sentence_count_threshold: 3,
            min_text_length: 10,
            interval_ms: 2000,
        }
    }
}

/// ノイズ除去設定
#[derive(Debug, Clone)]
pub struct DenoiserConfig {
    /// ノイズ除去を有効にするか
    pub enabled: bool,
}

impl Default for DenoiserConfig {
    fn default() -> Self {
        Self { enabled: true }
    }
}

/// 信号品質フィルタ設定
#[derive(Debug, Clone)]
pub struct SignalFilterConfig {
    /// 信号品質チェックを有効にするか
    pub enabled: bool,
    /// RMS 閾値 (0.0〜1.0, デフォルト 0.005)
    pub rms_threshold: f32,
    /// 有意音声占有率閾値 (0.0〜1.0, デフォルト 0.15)
    pub occupancy_ratio: f32,
}

impl Default for SignalFilterConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            rms_threshold: 0.005,
            occupancy_ratio: 0.15,
        }
    }
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ---- SttEngine ----

    #[test]
    fn test_stt_engine_default_is_os() {
        assert_eq!(SttEngine::default(), SttEngine::Os);
    }

    #[test]
    fn test_stt_engine_variants() {
        let openai = SttEngine::OpenAI;
        let os = SttEngine::Os;
        assert_ne!(openai, os);
    }

    // ---- LocaleCode ----

    #[test]
    fn test_locale_code_default_is_ja() {
        assert_eq!(LocaleCode::default(), LocaleCode::Ja);
    }

    #[test]
    fn test_locale_code_as_str() {
        assert_eq!(LocaleCode::Ja.as_str(), "ja");
        assert_eq!(LocaleCode::En.as_str(), "en");
    }

    #[test]
    fn test_locale_code_as_bcp47() {
        assert_eq!(LocaleCode::Ja.as_bcp47(), "ja-JP");
        assert_eq!(LocaleCode::En.as_bcp47(), "en-US");
    }

    #[test]
    fn test_locale_code_as_iso639_1() {
        assert_eq!(LocaleCode::Ja.as_iso639_1(), "ja");
        assert_eq!(LocaleCode::En.as_iso639_1(), "en");
    }

    // ---- SttEvent ----

    #[test]
    fn test_stt_event_variants() {
        let _ = SttEvent::PartialResult("hello".into(), 0);
        let _ = SttEvent::FinalResult("hello".into(), 1);
        let _ = SttEvent::Started;
        let _ = SttEvent::Error("err".into());
        let _ = SttEvent::Stopped;
        let _ = SttEvent::Ready;
        let _ = SttEvent::PostCorrectionStarted;
        let _ = SttEvent::PostCorrectionFinished;
        let _ = SttEvent::SttPending;
        let _ = SttEvent::SttCompleted;
        let _ = SttEvent::ForceClearDecoration;
        let _ = SttEvent::DecorationPartial("…".into());
    }

    // ---- OpenAiConfig ----

    #[test]
    fn test_openai_config_fields() {
        let cfg = OpenAiConfig {
            base_url: "http://127.0.0.1:3912".into(),
            api_key: "sk-test".into(),
            model: "gpt-4o-mini-transcribe".into(),
        };
        assert_eq!(cfg.base_url, "http://127.0.0.1:3912");
        assert_eq!(cfg.api_key, "sk-test");
        assert_eq!(cfg.model, "gpt-4o-mini-transcribe");
    }

    // ---- VadModelPaths ----

    #[test]
    fn test_vad_model_paths_fields() {
        let paths = VadModelPaths {
            silero: "/m/silero.onnx".into(),
            ten: "/m/ten.onnx".into(),
            gtcrn: "/m/gtcrn.onnx".into(),
        };
        assert_eq!(paths.silero, "/m/silero.onnx");
        assert_eq!(paths.ten, "/m/ten.onnx");
        assert_eq!(paths.gtcrn, "/m/gtcrn.onnx");
    }

    // ---- VadType ----

    #[test]
    fn test_vad_type_default() {
        assert_eq!(VadType::default(), VadType::Silero);
    }

    // ---- VadConfig ----

    #[test]
    fn test_vad_config_default_values() {
        let cfg = VadConfig::default();
        assert_eq!(cfg.vad_type, VadType::Silero);
        assert_eq!(cfg.threshold, 0.5);
        assert_eq!(cfg.min_silence_duration, 0.2);
        assert_eq!(cfg.min_speech_duration, 0.25);
        assert_eq!(cfg.max_speech_duration, 25.0);
        assert_eq!(cfg.pre_padding_ms, 100);
        assert_eq!(cfg.utterance_min_ms, 300);
        assert_eq!(cfg.num_threads, 4);
    }

    // ---- PostCorrectionConfig ----

    #[test]
    fn test_post_correction_config_default_values() {
        let cfg = PostCorrectionConfig::default();
        assert_eq!(cfg.sentence_count_threshold, 3);
        assert_eq!(cfg.min_text_length, 10);
        assert_eq!(cfg.interval_ms, 2000);
    }

    // ---- DenoiserConfig ----

    #[test]
    fn test_denoiser_config_default() {
        let cfg = DenoiserConfig::default();
        assert!(cfg.enabled);
    }

    // ---- SignalFilterConfig ----

    #[test]
    fn test_signal_filter_config_default_values() {
        let cfg = SignalFilterConfig::default();
        assert!(cfg.enabled);
        assert_eq!(cfg.rms_threshold, 0.005);
        assert_eq!(cfg.occupancy_ratio, 0.15);
    }
}
