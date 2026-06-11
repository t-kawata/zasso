//! VoiceKitConfig — 音声認識の全設定を統括する設定構造体
//!
//! 移植元: docs/rfc-stt-portable-crate.md §4.3, §4.4
//! MYCUTE SttSettings（src/mycute_settings.rs）を多段 Config に分解。

use crate::error::VoiceKitError;
use crate::types::{
    DenoiserConfig, LocaleCode, OpenAiConfig, PostCorrectionConfig, SignalFilterConfig, SttEngine,
    VadConfig, VadModelPaths,
};

/// 音声認識の全設定
#[derive(Debug, Clone)]
pub struct VoiceKitConfig {
    /// 使用するエンジン
    pub engine: SttEngine,
    /// 言語ロケール
    pub locale: LocaleCode,
    /// OpenAI 設定（engine == OpenAI の場合のみ必要）
    pub openai_config: Option<OpenAiConfig>,
    /// VAD 設定
    pub vad: VadConfig,
    /// 事後補正設定
    pub post_correction: PostCorrectionConfig,
    /// 句読点挿入を有効にするか（デフォルト true）
    pub punctuation: bool,
    /// ノイズ除去設定
    pub denoiser: DenoiserConfig,
    /// 信号品質フィルタ設定
    pub signal_filter: SignalFilterConfig,
    /// 発話タイムアウト（秒, デフォルト 30.0）
    pub speech_timeout_sec: f64,
    /// VAD モデルファイルパス群（model_dir が設定されていれば、相対パスはそちらからの結合で解決される）
    pub vad_model_paths: VadModelPaths,
    /// モデルファイルのベースディレクトリ（省略可）
    /// 設定された場合、VadModelPaths の相対パスはこのディレクトリとの結合で解決される。
    /// 絶対パス（/ 始まり）のファイルはそのまま使用される。
    pub model_dir: Option<String>,
}

impl VoiceKitConfig {
    /// ビルダーを作成する
    pub fn builder() -> VoiceKitConfigBuilder {
        VoiceKitConfigBuilder::default()
    }
}

/// VoiceKitConfig のビルダー
///
/// # 使用例
///
/// ```rust,ignore
/// let config = VoiceKitConfig::builder()
///     .engine(SttEngine::Os)
///     .locale(LocaleCode::Ja)
///     .vad_model_paths(VadModelPaths { ... })
///     .build()?;
/// ```
#[derive(Debug, Clone, Default)]
pub struct VoiceKitConfigBuilder {
    engine: Option<SttEngine>,
    locale: Option<LocaleCode>,
    openai_config: Option<OpenAiConfig>,
    vad: Option<VadConfig>,
    post_correction: Option<PostCorrectionConfig>,
    punctuation: Option<bool>,
    denoiser: Option<DenoiserConfig>,
    signal_filter: Option<SignalFilterConfig>,
    speech_timeout_sec: Option<f64>,
    vad_model_paths: Option<VadModelPaths>,
    model_dir: Option<String>,
}

#[allow(missing_docs)]
impl VoiceKitConfigBuilder {
    pub fn engine(mut self, e: SttEngine) -> Self {
        self.engine = Some(e);
        self
    }
    pub fn locale(mut self, l: LocaleCode) -> Self {
        self.locale = Some(l);
        self
    }
    pub fn openai_config(mut self, c: OpenAiConfig) -> Self {
        self.openai_config = Some(c);
        self
    }
    pub fn vad(mut self, v: VadConfig) -> Self {
        self.vad = Some(v);
        self
    }
    pub fn post_correction(mut self, p: PostCorrectionConfig) -> Self {
        self.post_correction = Some(p);
        self
    }
    pub fn punctuation(mut self, p: bool) -> Self {
        self.punctuation = Some(p);
        self
    }
    pub fn denoiser(mut self, d: DenoiserConfig) -> Self {
        self.denoiser = Some(d);
        self
    }
    pub fn signal_filter(mut self, s: SignalFilterConfig) -> Self {
        self.signal_filter = Some(s);
        self
    }
    pub fn speech_timeout_sec(mut self, t: f64) -> Self {
        self.speech_timeout_sec = Some(t);
        self
    }
    pub fn vad_model_paths(mut self, p: VadModelPaths) -> Self {
        self.vad_model_paths = Some(p);
        self
    }
    /// モデルファイルのベースディレクトリを設定する。
    ///
    /// 設定後、`vad_model_paths` の相対パスはこのディレクトリを起点として解決される。
    /// 絶対パス（/ 始まり）はそのまま使用される。
    pub fn model_dir(mut self, dir: impl Into<String>) -> Self {
        self.model_dir = Some(dir.into());
        self
    }

    /// 設定を確定して VoiceKitConfig を生成する。
    ///
    /// # バリデーション
    /// - `locale` は必須
    /// - `vad_model_paths` は必須
    /// - `engine == SttEngine::OpenAi` の場合は `openai_config` が必須
    pub fn build(self) -> Result<VoiceKitConfig, VoiceKitError> {
        let engine = self.engine.unwrap_or_default();
        let locale = self
            .locale
            .ok_or_else(|| VoiceKitError::InvalidConfig("locale is required".into()))?;
        let vad_model_paths = self
            .vad_model_paths
            .ok_or_else(|| VoiceKitError::InvalidConfig("vad_model_paths is required".into()))?;

        if engine == SttEngine::OpenAI && self.openai_config.is_none() {
            return Err(VoiceKitError::InvalidConfig(
                "openai_config is required when engine is OpenAI".into(),
            ));
        }

        Ok(VoiceKitConfig {
            engine,
            locale,
            openai_config: self.openai_config,
            vad: self.vad.unwrap_or_default(),
            post_correction: self.post_correction.unwrap_or_default(),
            punctuation: self.punctuation.unwrap_or(true),
            denoiser: self.denoiser.unwrap_or_default(),
            signal_filter: self.signal_filter.unwrap_or_default(),
            speech_timeout_sec: self.speech_timeout_sec.unwrap_or(30.0),
            vad_model_paths,
            model_dir: self.model_dir,
        })
    }
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn minimal_paths() -> VadModelPaths {
        VadModelPaths {
            silero: "/tmp/silero.onnx".into(),
            ten: "/tmp/ten.onnx".into(),
            gtcrn: String::new(),
        }
    }

    // ---- 正常系 ----

    #[test]
    fn test_build_minimal() {
        let config = VoiceKitConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .vad_model_paths(minimal_paths())
            .build()
            .unwrap();

        assert_eq!(config.engine, SttEngine::Os);
        assert_eq!(config.locale, LocaleCode::Ja);
        assert_eq!(config.speech_timeout_sec, 30.0);
        assert!(config.punctuation);
        assert!(config.model_dir.is_none());
    }

    #[test]
    fn test_build_with_openai() {
        let config = VoiceKitConfig::builder()
            .engine(SttEngine::OpenAI)
            .locale(LocaleCode::En)
            .openai_config(OpenAiConfig {
                base_url: "http://127.0.0.1:3912".into(),
                api_key: "sk-test".into(),
                model: "gpt-4o-mini-transcribe".into(),
            })
            .vad_model_paths(minimal_paths())
            .build()
            .unwrap();

        assert_eq!(config.engine, SttEngine::OpenAI);
        assert_eq!(config.locale, LocaleCode::En);
        assert!(config.openai_config.is_some());
    }

    #[test]
    fn test_build_all_custom() {
        let config = VoiceKitConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::En)
            .vad(VadConfig {
                vad_type: crate::types::VadType::Ten,
                threshold: 0.3,
                ..Default::default()
            })
            .post_correction(PostCorrectionConfig {
                sentence_count_threshold: 5,
                ..Default::default()
            })
            .punctuation(false)
            .denoiser(DenoiserConfig { enabled: false })
            .signal_filter(SignalFilterConfig {
                enabled: false,
                rms_threshold: 0.01,
                occupancy_ratio: 0.3,
            })
            .speech_timeout_sec(60.0)
            .vad_model_paths(VadModelPaths {
                silero: "/custom/silero.onnx".into(),
                ten: "/custom/ten.onnx".into(),
                gtcrn: "/custom/gtcrn.onnx".into(),
            })
            .build()
            .unwrap();

        assert_eq!(config.vad.vad_type, crate::types::VadType::Ten);
        assert_eq!(config.vad.threshold, 0.3);
        assert!(!config.punctuation);
        assert!(!config.denoiser.enabled);
        assert!(!config.signal_filter.enabled);
        assert_eq!(config.speech_timeout_sec, 60.0);
        assert_eq!(config.vad_model_paths.gtcrn, "/custom/gtcrn.onnx");
    }

    // ---- model_dir ----

    #[test]
    fn test_build_with_model_dir() {
        let config = VoiceKitConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .model_dir("/opt/models")
            .vad_model_paths(VadModelPaths {
                silero: "silero_vad.onnx".into(),
                ten: "ten_vad.onnx".into(),
                gtcrn: String::new(),
            })
            .build()
            .unwrap();

        assert_eq!(config.model_dir.as_deref(), Some("/opt/models"));
    }

    // ---- 異常系（バリデーション） ----

    #[test]
    fn test_build_rejects_missing_locale() {
        let result = VoiceKitConfig::builder()
            .engine(SttEngine::Os)
            .vad_model_paths(minimal_paths())
            .build();

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("locale"));
    }

    #[test]
    fn test_build_rejects_missing_vad_model_paths() {
        let result = VoiceKitConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .build();

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("vad_model_paths"));
    }

    #[test]
    fn test_build_rejects_openai_without_config() {
        let result = VoiceKitConfig::builder()
            .engine(SttEngine::OpenAI)
            .locale(LocaleCode::Ja)
            .vad_model_paths(minimal_paths())
            .build();

        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("openai_config"));
    }

    // ---- Default 値伝播 ----

    #[test]
    fn test_unset_fields_get_defaults() {
        let config = VoiceKitConfig::builder()
            .locale(LocaleCode::Ja)
            .vad_model_paths(minimal_paths())
            .build()
            .unwrap();

        assert_eq!(config.engine, SttEngine::Os);
        assert!(config.punctuation);
        assert!(config.denoiser.enabled);
        assert!(config.signal_filter.enabled);
        assert_eq!(config.speech_timeout_sec, 30.0);
        assert!(config.model_dir.is_none());
    }

    // ---- Builder のチェーン ----

    #[test]
    fn test_builder_chainability() {
        let builder = VoiceKitConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .vad_model_paths(minimal_paths());
        let _config = builder.build().unwrap();
    }
}
