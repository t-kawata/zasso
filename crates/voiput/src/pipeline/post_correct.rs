//! 事後補正プロセッサ — ASR 結果のテキストをバッファリングし、条件に応じて LLM 補正を行う
//!
//! 移植元: ~/shyme/mycute/src/tools/post_correction_processor.rs
//! 変更点: PostCorrectionConfig の参照先を crate::types に変更

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;

pub use crate::types::PostCorrectionConfig;

/// 補正バックエンドの抽象インターフェース
#[async_trait]
pub trait PostCorrectionBackend: Send + Sync {
    /// テキストを受け取り、補正されたテキストを返す
    async fn post_correct(&self, text: &str) -> anyhow::Result<String>;
}

// ============================================================================
// SttModelType: エンジン特性を明示的に区分する列挙型
// ============================================================================

/// 音声認識モデルの特性を区分する列挙型
///
/// この区分により、補正プロセッサが「届いたテキストのセマンティクス」を正しく理解できる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SttModelType {
    /// オフラインモデル（OpenAI Whisper 等）
    /// 届くデータは「新しく増えた分（差分パケット）」、バッファは「追記（Append）」
    #[default]
    UseOfflineModel,

    /// オンラインモデル（Apple Tahoe, Windows OS ディクテーション等）
    /// 届くデータは「未確定区間の最新状態（Live State）」、バッファは「上書き（Overwrite）」
    UseOnlineModel,
}

/// プロセッサからの出力イベント
#[derive(Debug, Clone)]
pub enum ProcessorOutput {
    /// 途中経過（補正なし、または簡易補正）
    Partial(String),
    /// 確定結果（補正済み）
    Final(String),
}

/// 内部バッファの状態
#[derive(Debug, Default)]
struct ProcessorBuffer {
    target_text: String,
    completed_text: String,
    org_text: String,
}

impl ProcessorBuffer {
    fn clear(&mut self) {
        self.target_text.clear();
        self.completed_text.clear();
        self.org_text.clear();
    }
}

/// 最終補正レイヤープロセッサ
///
/// 入力テキストをバッファリングし、条件に応じてバックエンドによる補正を行い、
/// 確定（Final）と未確定（Partial）の出力を制御する。
pub struct PostCorrectionProcessor {
    pub backend: Arc<dyn PostCorrectionBackend>,
    config: PostCorrectionConfig,
    buffer: ProcessorBuffer,
    last_correction_time: Instant,
    model_type: SttModelType,
    pub(crate) is_speaking: Arc<AtomicBool>,
    pub(crate) is_pending_correction: bool,
    last_silence_start: Option<Instant>,
}

impl PostCorrectionProcessor {
    pub fn new(
        backend: Arc<dyn PostCorrectionBackend>,
        config: PostCorrectionConfig,
        is_speaking: Arc<AtomicBool>,
    ) -> Self {
        Self::with_model_type(backend, config, SttModelType::UseOfflineModel, is_speaking)
    }

    /// モデル種別を明示的に指定してプロセッサを作成
    pub fn with_model_type(
        backend: Arc<dyn PostCorrectionBackend>,
        config: PostCorrectionConfig,
        model_type: SttModelType,
        is_speaking: Arc<AtomicBool>,
    ) -> Self {
        Self {
            backend,
            config,
            buffer: ProcessorBuffer::default(),
            last_correction_time: Instant::now(),
            model_type,
            is_speaking,
            is_pending_correction: false,
            last_silence_start: None,
        }
    }

    /// 入力テキストを処理する
    ///
    /// UseOfflineModel: incoming_text は「差分」として扱われ、末尾に追記される。
    /// UseOnlineModel: incoming_text は「最新状態（全体）」として扱われ、target_text を上書きする。
    pub fn process_input(&mut self, incoming_text: &str) -> Option<ProcessorOutput> {
        if incoming_text.trim().is_empty() {
            return None;
        }

        match self.model_type {
            SttModelType::UseOfflineModel => {
                self.buffer.org_text.push_str(incoming_text);
                self.buffer.target_text.push_str(incoming_text);
            }
            SttModelType::UseOnlineModel => {
                self.buffer.target_text = incoming_text.to_string();
                self.buffer.org_text =
                    format!("{}{}", self.buffer.completed_text, self.buffer.target_text);
            }
        }

        if self.should_trigger_correction(None) {
            if !self.is_pending_correction {
                self.is_pending_correction = true;
            }
        }
        // NOTE: is_pending_correction は一度セットされたら commit_correction までリセットしない。
        // FinalResult 直後に Tahoe が送信する "." イベントで target_text が上書きされ、
        // 文数条件が一時的に未達になって pending が打ち消される問題を防ぐ。

        Some(ProcessorOutput::Partial(self.buffer.org_text.clone()))
    }

    /// 沈黙タイマーのチェック
    pub fn check_and_start_silence_timer(&mut self) -> bool {
        if !self.is_pending_correction {
            return false;
        }

        let currently_speaking = self.is_speaking.load(Ordering::SeqCst);
        if currently_speaking {
            if self.last_silence_start.is_some() {
                self.last_silence_start = None;
            }
            return false;
        }

        if self.last_silence_start.is_none() {
            self.last_silence_start = Some(Instant::now());
        }

        if let Some(silence_start) = self.last_silence_start {
            if silence_start.elapsed().as_millis() as u64
                >= crate::constants::POST_CORRECTION_SILENCE_WAIT_MS
            {
                return true;
            }
        }

        false
    }

    pub fn get_text_to_correct(&self) -> String {
        self.buffer.target_text.clone()
    }

    /// 補正結果を反映する（同期）
    pub fn commit_correction(&mut self, corrected_text: &str) -> ProcessorOutput {
        self.is_pending_correction = false;
        self.last_silence_start = None;
        self.last_correction_time = Instant::now();

        self.buffer.completed_text.push_str(corrected_text);
        self.buffer.completed_text.push(' ');
        self.buffer.target_text.clear();
        self.buffer.org_text = self.buffer.completed_text.clone();

        let final_output = self.buffer.org_text.clone();

        // CRITICAL: 重複防止のためのバッファクリア
        self.buffer.clear();

        ProcessorOutput::Final(final_output)
    }

    pub fn will_execute_now(&self) -> bool {
        if !self.is_pending_correction {
            return false;
        }

        let currently_speaking = self.is_speaking.load(Ordering::SeqCst);
        if currently_speaking {
            return false;
        }

        if let Some(silence_start) = self.last_silence_start {
            return silence_start.elapsed().as_millis() as u64
                >= crate::constants::POST_CORRECTION_SILENCE_WAIT_MS;
        }

        false
    }

    /// 補正を実行すべきかどうかを判定
    pub fn should_trigger_correction(&self, incoming: Option<&str>) -> bool {
        let (text_len, sentence_count) = if let Some(text) = incoming {
            match self.model_type {
                SttModelType::UseOfflineModel => (
                    self.buffer.target_text.chars().count() + text.chars().count(),
                    self.count_sentences() + Self::count_sentences_in_text(text),
                ),
                SttModelType::UseOnlineModel => {
                    (text.chars().count(), Self::count_sentences_in_text(text))
                }
            }
        } else {
            (
                self.buffer.target_text.chars().count(),
                self.count_sentences(),
            )
        };

        let len_ok = text_len >= self.config.min_text_length;
        let elapsed_ms = self.last_correction_time.elapsed().as_millis() as u64;
        let time_ok = elapsed_ms >= self.config.interval_ms;
        let sentence_ok = sentence_count >= self.config.sentence_count_threshold;

        len_ok && time_ok && sentence_ok
    }

    fn count_sentences_in_text(text: &str) -> usize {
        text.matches('。').count()
            + text.matches('？').count()
            + text.matches('！').count()
            + text.matches('!').count()
            + text.matches('?').count()
            + text.matches('.').count()
    }

    fn count_sentences(&self) -> usize {
        Self::count_sentences_in_text(&self.buffer.target_text)
    }

    pub fn reset(&mut self) {
        self.buffer.clear();
        self.last_correction_time = Instant::now();
        self.is_pending_correction = false;
        self.last_silence_start = None;
    }

    pub fn get_display_text(&self) -> String {
        self.buffer.org_text.clone()
    }

    pub fn get_confirmed_len(&self) -> usize {
        self.buffer.completed_text.chars().count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    struct MockBackend;

    #[async_trait]
    impl PostCorrectionBackend for MockBackend {
        async fn post_correct(&self, text: &str) -> anyhow::Result<String> {
            Ok(format!("[OK] {}", text))
        }
    }

    fn default_config() -> PostCorrectionConfig {
        PostCorrectionConfig {
            sentence_count_threshold: 3,
            min_text_length: 10,
            interval_ms: 2000,
        }
    }

    fn make_processor(model_type: SttModelType) -> PostCorrectionProcessor {
        PostCorrectionProcessor::with_model_type(
            Arc::new(MockBackend),
            default_config(),
            model_type,
            Arc::new(AtomicBool::new(false)),
        )
    }

    #[test]
    fn test_offline_model_appends() {
        let mut proc = make_processor(SttModelType::UseOfflineModel);
        let out1 = proc.process_input("hello").unwrap();
        assert!(matches!(out1, ProcessorOutput::Partial(ref s) if s == "hello"));
        let out2 = proc.process_input("world").unwrap();
        assert!(matches!(out2, ProcessorOutput::Partial(ref s) if s == "helloworld"));
    }

    #[test]
    fn test_online_model_overwrites() {
        let mut proc = make_processor(SttModelType::UseOnlineModel);
        let out1 = proc.process_input("hello").unwrap();
        assert!(matches!(out1, ProcessorOutput::Partial(ref s) if s == "hello"));
        let out2 = proc.process_input("hello world").unwrap();
        assert!(matches!(out2, ProcessorOutput::Partial(ref s) if s == "hello world"));
    }

    #[test]
    fn test_commit_correction_clears_buffer() {
        let mut proc = make_processor(SttModelType::UseOfflineModel);
        let _ = proc.process_input("hello world");
        let out = proc.commit_correction("corrected text");
        assert!(matches!(out, ProcessorOutput::Final(ref s) if s == "corrected text "));
        let next = proc.process_input("next").unwrap();
        assert!(matches!(next, ProcessorOutput::Partial(ref s) if s == "next"));
    }

    #[test]
    fn test_empty_input_returns_none() {
        let mut proc = make_processor(SttModelType::UseOfflineModel);
        assert!(proc.process_input("").is_none());
        assert!(proc.process_input("   ").is_none());
    }

    #[test]
    fn test_reset_clears_everything() {
        let mut proc = make_processor(SttModelType::UseOfflineModel);
        let _ = proc.process_input("hello world");
        proc.reset();
        assert!(proc.get_display_text().is_empty());
        assert_eq!(proc.get_confirmed_len(), 0);
    }

    #[test]
    fn test_should_trigger_correction_initial_false() {
        let proc = make_processor(SttModelType::UseOfflineModel);
        assert!(!proc.should_trigger_correction(None));
    }

    #[test]
    fn test_commit_prevents_duplicate_on_next_input() {
        let mut proc = make_processor(SttModelType::UseOfflineModel);
        let _ = proc.process_input("first sentence");
        let _ = proc.commit_correction("[corrected first]");
        let out = proc.process_input("second sentence").unwrap();
        assert!(matches!(out, ProcessorOutput::Partial(ref s) if s == "second sentence"));
    }

    #[test]
    fn test_deterministic_count_sentences() {
        assert_eq!(PostCorrectionProcessor::count_sentences_in_text(""), 0);
        assert_eq!(PostCorrectionProcessor::count_sentences_in_text("hello"), 0);
        assert_eq!(
            PostCorrectionProcessor::count_sentences_in_text("a.b!c?"),
            3
        );
        assert_eq!(
            PostCorrectionProcessor::count_sentences_in_text("あ。い？う！"),
            3
        );
    }

    #[test]
    fn test_commit_output_format() {
        let mut proc = make_processor(SttModelType::UseOfflineModel);
        let out = proc.commit_correction("corrected final text");
        match out {
            ProcessorOutput::Final(ref s) => {
                assert!(s.contains("corrected final text"));
            }
            _ => panic!("Expected Final output"),
        }
    }
}
