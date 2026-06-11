//! OpenAI バックエンド — Whisper API を用いた疑似ストリーミング音声認識
//!
//! 移植元: ~/shyme/mycute/src/stt/openai.rs
//! 変更点: LmgwClient → OpenAiConfig + async-openai::Client の直接構築
//!         tauri::async_runtime → tokio
//!         SttSettings → VoiceKitConfig

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Result};
use async_openai::types::audio::{AudioInput, CreateTranscriptionRequestArgs};
use async_openai::Client as OpenAIClient;
use hound::{WavSpec, WavWriter};
use parking_lot::Mutex;
use tokio::runtime::Handle;
use tokio::sync::mpsc;
use tokio::task::block_in_place;

use crate::pipeline::streamer::AsrBackend;
use crate::pipeline::vad::VAD_SAMPLE_RATE;
use crate::types::{LocaleCode, OpenAiConfig, SttEvent};
use crate::VoiceKitConfig;

// ============================================================================
// OpenAIBackend: AsrBackend 実装
// ============================================================================

/// OpenAI Whisper API を使用する認識バックエンド
pub struct OpenAIBackend {
    openai_config: OpenAiConfig,
    language: Arc<Mutex<LocaleCode>>,
}

impl OpenAIBackend {
    pub fn new(openai_config: &OpenAiConfig, shared_locale: Arc<Mutex<LocaleCode>>) -> Self {
        Self {
            openai_config: openai_config.clone(),
            language: shared_locale,
        }
    }

    /// f32 PCM → WAV → async-openai → テキスト
    fn call_transcribe(&self, samples: &[f32]) -> Result<String> {
        let mut buffer = Cursor::new(Vec::new());
        let spec = WavSpec {
            channels: 1,
            sample_rate: VAD_SAMPLE_RATE as u32,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        {
            let mut writer = WavWriter::new(&mut buffer, spec)?;
            for &sample in samples {
                writer.write_sample(sample)?;
            }
            writer.finalize()?;
        }

        let oa_config = async_openai::config::OpenAIConfig::new()
            .with_api_base(&self.openai_config.base_url)
            .with_api_key(&self.openai_config.api_key);
        let client = OpenAIClient::with_config(oa_config);

        let audio = AudioInput::from_vec_u8("input.wav".into(), buffer.into_inner());
        let locale = self.language.lock().as_iso639_1().to_string();
        let request = CreateTranscriptionRequestArgs::default()
            .file(audio)
            .model(&self.openai_config.model)
            .language(locale)
            .build()
            .map_err(|e| anyhow!("Failed to build request: {}", e))?;

        let result = block_in_place(|| {
            Handle::current().block_on(async {
                client.audio().transcription().create(request).await
            })
        })?;
        Ok(result.text)
    }

    /// LLM でテキストを補正する
    fn call_post_correct(&self, text: &str) -> Result<String> {
        let oa_config = async_openai::config::OpenAIConfig::new()
            .with_api_base(&self.openai_config.base_url)
            .with_api_key(&self.openai_config.api_key);
        let client = OpenAIClient::with_config(oa_config);

        use async_openai::types::chat::{
            ChatCompletionRequestDeveloperMessage, ChatCompletionRequestDeveloperMessageContent,
            ChatCompletionRequestMessage, ChatCompletionRequestUserMessage,
            ChatCompletionRequestUserMessageContent, CreateChatCompletionRequestArgs,
        };

        let request = CreateChatCompletionRequestArgs::default()
            .model("gpt-4o-mini")
            .messages(vec![
                ChatCompletionRequestMessage::Developer(ChatCompletionRequestDeveloperMessage {
                    content: ChatCompletionRequestDeveloperMessageContent::Text(
                        "音声認識結果を補正してください。誤認識を修正し、句読点を適切に追加。"
                            .to_string(),
                    ),
                    ..Default::default()
                }),
                ChatCompletionRequestMessage::User(ChatCompletionRequestUserMessage {
                    content: ChatCompletionRequestUserMessageContent::Text(text.to_string()),
                    ..Default::default()
                }),
            ])
            .build()
            .map_err(|e| anyhow!("Failed to build request: {}", e))?;

        let result = block_in_place(|| {
            Handle::current().block_on(async {
                client.chat().create(request).await
            })
        })?;
        Ok(result
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_else(|| text.to_string()))
    }
}

impl AsrBackend for OpenAIBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        self.call_transcribe(samples)
    }

    fn post_correct(&mut self, text: &str) -> Result<String> {
        self.call_post_correct(text)
    }

    fn model_name(&self) -> String {
        self.openai_config.model.clone()
    }

    fn record_asr_usage(&mut self, _duration_ms: u64) {
        // MYCUTE では UsageStats に記録。voiput では no-op
    }
}

// ============================================================================
// OpenAIRecognizer — ticker + イベント管理の簡略版
// ============================================================================

/// OpenAI バックエンドを統括する認識器
#[allow(dead_code)]
pub struct OpenAIRecognizer {
    tx: mpsc::Sender<SttEvent>,
    is_running: Arc<AtomicBool>,
    language: Arc<Mutex<LocaleCode>>,
    #[allow(dead_code)]
    sequence_counter: Arc<AtomicU64>,
}

impl OpenAIRecognizer {
    pub fn new(
        tx: mpsc::Sender<SttEvent>,
        _config: &VoiceKitConfig,
        shared_locale: Arc<Mutex<LocaleCode>>,
    ) -> Self {
        Self {
            tx,
            is_running: Arc::new(AtomicBool::new(false)),
            language: shared_locale,
            sequence_counter: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn init_audio(&mut self) -> Result<()> {
        // 音声キャプチャの初期化（後続実装で拡張）
        Ok(())
    }

    pub fn start(&mut self) {
        self.is_running.store(true, Ordering::SeqCst);
        let _ = self.tx.try_send(SttEvent::Started);
    }

    pub fn stop(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        let _ = self.tx.try_send(SttEvent::Stopped);
    }

    pub fn tick(&mut self) {}

    pub fn set_locale(&mut self, locale: LocaleCode) {
        *self.language.lock() = locale;
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openai_config_creation() {
        let config = OpenAiConfig {
            base_url: "http://127.0.0.1:3912".into(),
            api_key: "sk-test".into(),
            model: "gpt-4o-mini-transcribe".into(),
        };
        assert_eq!(config.model, "gpt-4o-mini-transcribe");
    }
}
