//! voiput crate 統合テスト
//!
//! crate を外部クレートとして利用した場合の公開API検証。
//! 全テストは `use voiput::*;` のみで完結する。

use voiput::*;

// ============================================================================
// ヘルパー
// ============================================================================

/// VadModelPaths の最小構成（実在しないパス、構築テスト用）
fn minimal_paths() -> VadModelPaths {
    VadModelPaths {
        silero: "/tmp/silero_vad.onnx".into(),
        ten: "/tmp/ten_vad.onnx".into(),
        gtcrn: String::new(),
    }
}

// ============================================================================
// VoiputConfig 構築テスト
// ============================================================================

#[test]
fn test_config_build_minimal() {
    let config = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .vad_model_paths(minimal_paths())
        .build()
        .unwrap();

    assert_eq!(config.engine, SttEngine::Os);
    assert_eq!(config.locale, LocaleCode::Ja);
    assert_eq!(config.speech_timeout_sec, 30.0);
    assert!(config.punctuation);
}

#[test]
fn test_config_build_with_openai() {
    let config = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::En)
        .openai_config(OpenAiConfig {
            base_url: "https://api.openai.com/v1".into(),
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
fn test_config_rejects_missing_locale() {
    let result = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .vad_model_paths(minimal_paths())
        .build();

    assert!(result.is_err());
    let msg = result.unwrap_err().to_string();
    assert!(msg.contains("locale"));
}

#[test]
fn test_config_rejects_missing_vad_paths() {
    let result = VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .build();

    assert!(result.is_err());
    let msg = result.unwrap_err().to_string();
    assert!(msg.contains("vad_model_paths"));
}

#[test]
fn test_config_rejects_openai_without_config() {
    let result = VoiputConfig::builder()
        .engine(SttEngine::OpenAI)
        .locale(LocaleCode::Ja)
        .vad_model_paths(minimal_paths())
        .build();

    assert!(result.is_err());
    let msg = result.unwrap_err().to_string();
    assert!(msg.contains("openai_config"));
}

// ============================================================================
// Voiput ライフサイクルテスト
// ============================================================================

fn minimal_config() -> VoiputConfig {
    VoiputConfig::builder()
        .engine(SttEngine::Os)
        .locale(LocaleCode::Ja)
        .vad_model_paths(minimal_paths())
        .build()
        .unwrap()
}

#[test]
fn test_voiput_new_minimal() {
    let voiput = Voiput::new(minimal_config());
    assert!(voiput.is_ok());
}

#[test]
fn test_voiput_start_stop() {
    let mut voiput = Voiput::new(minimal_config()).unwrap();
    // start()/stop() は API 呼び出しとして成功することだけ確認
    assert!(voiput.start().is_ok());
    assert!(voiput.stop().is_ok());
    // 冪等性
    assert!(voiput.stop().is_ok());
}

#[test]
fn test_voiput_set_engine() {
    let mut voiput = Voiput::new(minimal_config()).unwrap();
    assert_eq!(voiput.engine(), SttEngine::Os);
    assert!(voiput.set_engine(SttEngine::OpenAI).is_ok());
    assert_eq!(voiput.engine(), SttEngine::OpenAI);
    assert!(voiput.set_engine(SttEngine::Os).is_ok());
    assert_eq!(voiput.engine(), SttEngine::Os);
}

#[test]
fn test_voiput_engine_getter() {
    let voiput = Voiput::new(minimal_config()).unwrap();
    assert_eq!(voiput.engine(), SttEngine::Os);
}

#[test]
fn test_voiput_health_check() {
    let voiput = Voiput::new(minimal_config()).unwrap();
    assert_eq!(voiput.health_check(), 0);
}

// ============================================================================
// 型テスト
// ============================================================================

#[test]
fn test_stt_event_variants() {
    // 全 variant が構築可能であること
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

#[test]
fn test_locale_code_methods() {
    assert_eq!(LocaleCode::Ja.as_str(), "ja");
    assert_eq!(LocaleCode::En.as_str(), "en");
    assert_eq!(LocaleCode::Ja.as_bcp47(), "ja-JP");
    assert_eq!(LocaleCode::En.as_bcp47(), "en-US");
    assert_eq!(LocaleCode::Ja.as_iso639_1(), "ja");
    assert_eq!(LocaleCode::En.as_iso639_1(), "en");
}

#[test]
fn test_stt_engine_default() {
    assert_eq!(SttEngine::default(), SttEngine::Os);
}

#[test]
fn test_voiput_error_display() {
    let err = VoiputError::InvalidConfig("test error".into());
    let msg = err.to_string();
    assert!(msg.contains("test error"));

    let err = VoiputError::InitError("init failed".into());
    let msg = err.to_string();
    assert!(msg.contains("init failed"));

    let err = VoiputError::RuntimeError("runtime".into());
    let msg = err.to_string();
    assert!(msg.contains("runtime"));
}
