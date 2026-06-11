//! PseudoAsrStreamer — 疑似ストリーミング ASR オーケストレーター
//!
//! 移植元: ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs
//! 変更点: SpeechDenoiser 分離済み、インポートパス変更

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use tokio::runtime::Handle;
use tokio::sync::mpsc;
use tokio::task::block_in_place;

use crate::pipeline::denoiser::SpeechDenoiser;
use crate::pipeline::post_correct::{
    PostCorrectionBackend, PostCorrectionProcessor, ProcessorOutput,
};
use crate::pipeline::resampler::{InternalResampler, SincResampler};
use crate::pipeline::signal_filter::is_worthy_to_run_asr;
use crate::pipeline::vad::{VadConfig, VadProcessor, VadType as CommonVadType};
use crate::types::PostCorrectionConfig;

// ============================================================================
// 内部定数
// ============================================================================

/// 内部処理用サンプリングレート (16kHz)
pub const INTERNAL_TARGET_RATE: u32 = 16000;
const MS_PER_SEC: usize = 1000;
const SILERO_VAD_WINDOW_SIZE: usize = 512;
const TEN_VAD_WINDOW_SIZE: usize = 256;
const DEFAULT_SIGNAL_OCCUPANCY_RATIO: f32 = 0.15;
const DEFAULT_SIGNAL_RMS_THRESHOLD: f32 = 0.005;

// ============================================================================
// 外部依存を排除するためのローカル定義
// ============================================================================

/// 認識器の言語ロケール
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamerLocale {
    Ja,
    En,
}

/// ストリーマーから出力されるイベント
#[derive(Debug, Clone)]
pub enum StreamerEvent {
    SpeechStart(String),
    SpeechEnd(String),
    PartialResult(String),
    FinalResult(String),
    PostCorrectionStarted,
    PostCorrectionFinished,
}

// ============================================================================
// AsrBackend: バックエンドが実装すべきトレイト
// ============================================================================

pub trait AsrBackend: Send {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;
    fn post_correct(&mut self, text: &str) -> Result<String>;
    fn model_name(&self) -> String;
    fn record_asr_usage(&mut self, duration_ms: u64);
    fn insert_punctuation(&mut self, text: &str, _locale: &StreamerLocale) -> Result<String> {
        Ok(text.to_string())
    }
}

/// バックエンドを PostCorrectionProcessor から呼び出せるようにするためのラッパー
pub struct BackendWrapper<B>(pub Arc<Mutex<B>>);

#[async_trait]
impl<B: AsrBackend + Send + 'static> PostCorrectionBackend for BackendWrapper<B> {
    async fn post_correct(&self, text: &str) -> Result<String> {
        let mut guard = self.0.lock().unwrap();
        guard.post_correct(text)
    }
}

// ============================================================================
// 設定
// ============================================================================

/// VAD (発話検知) のアルゴリズムタイプ
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VadType {
    #[default]
    Silero,
    Ten,
}

impl From<VadType> for CommonVadType {
    fn from(vt: VadType) -> Self {
        match vt {
            VadType::Silero => CommonVadType::Silero,
            VadType::Ten => CommonVadType::Ten,
        }
    }
}

/// 擬似ストリーミングの動作を制御する設定項目
#[derive(Debug, Clone)]
pub struct StreamerConfig {
    pub vad_model_path: String,
    pub vad_type: VadType,
    pub vad_threshold: f32,
    pub vad_min_silence_duration: f32,
    pub vad_min_speech_duration: f32,
    pub vad_max_speech_duration: f32,
    pub vad_pre_padding_ms: u32,
    pub utterance_min_ms: u32,
    pub num_threads: i32,
    pub locale: StreamerLocale,
    pub signal_check_enabled: bool,
    pub signal_rms_threshold: f32,
    pub signal_occupancy_ratio: f32,
    pub use_denoiser: bool,
    pub denoiser_model_path: String,
    pub post_correction_sentence_count_threshold: usize,
    pub post_correction_min_text_length: usize,
    pub post_correction_interval_ms: u64,
}

impl Default for StreamerConfig {
    fn default() -> Self {
        Self {
            vad_model_path: String::new(),
            vad_type: VadType::Silero,
            vad_threshold: 0.5,
            vad_min_silence_duration: 0.2,
            vad_min_speech_duration: 0.25,
            vad_max_speech_duration: 25.0,
            vad_pre_padding_ms: 100,
            utterance_min_ms: 300,
            num_threads: 4,
            locale: StreamerLocale::Ja,
            signal_check_enabled: true,
            signal_rms_threshold: DEFAULT_SIGNAL_RMS_THRESHOLD,
            signal_occupancy_ratio: DEFAULT_SIGNAL_OCCUPANCY_RATIO,
            use_denoiser: false,
            denoiser_model_path: String::new(),
            post_correction_sentence_count_threshold: 3,
            post_correction_min_text_length: 10,
            post_correction_interval_ms: 2000,
        }
    }
}

// ============================================================================
// Chunk: VAD で切り出された発話区間
// ============================================================================

#[derive(Debug, Clone)]
struct Chunk {
    samples: Vec<f32>,
    #[allow(dead_code)]
    id: u64,
}

impl Chunk {
    fn new(samples: Vec<f32>, id: u64) -> Self {
        Self { samples, id }
    }
}

// ============================================================================
// UtteranceQueue: 発話区間の一時キュー
// ============================================================================

#[derive(Debug, Default)]
struct UtteranceQueue {
    utterance: VecDeque<Chunk>,
}

impl UtteranceQueue {
    fn new() -> Self {
        Self::default()
    }
    fn push(&mut self, chunk: Chunk) {
        self.utterance.push_back(chunk);
    }
    fn clear(&mut self) {
        self.utterance.clear();
    }
    fn pop_front(&mut self) -> Option<Chunk> {
        self.utterance.pop_front()
    }
}

// ============================================================================
// PseudoAsrStreamer: メインオーケストレーター
// ============================================================================

pub struct PseudoAsrStreamer<B: AsrBackend + Send + Sync + 'static> {
    config: StreamerConfig,
    backend: Arc<Mutex<B>>,
    post_correction_processor: PostCorrectionProcessor,
    tx: mpsc::Sender<StreamerEvent>,
    is_running: Arc<AtomicBool>,
    is_speaking: Arc<AtomicBool>,
    audio_buf: Vec<f32>,
    input_sample_rate: u32,
    resampler: Option<Box<dyn InternalResampler + Send>>,
    vad_processor: Option<VadProcessor>,
    vad_buf: Vec<f32>,
    vad_window_size: usize,
    was_speech: bool,
    current_speech_start: Option<Instant>,
    last_asr_text_change: Instant,
    last_asr_text: String,
    utterance_queue: UtteranceQueue,
    utterance_buf: Vec<f32>,
    utterance_id_counter: u64,
    pre_padding_buf: VecDeque<f32>,
    pre_padding_samples_cnt: usize,
    denoiser: Option<SpeechDenoiser>,
}

impl<B: AsrBackend + Send + Sync + 'static> PseudoAsrStreamer<B> {
    pub fn new(
        backend: B,
        tx: mpsc::Sender<StreamerEvent>,
        config: StreamerConfig,
    ) -> Result<Self> {
        let sample_rate = INTERNAL_TARGET_RATE as usize;
        let pre_padding_samples_cnt =
            (config.vad_pre_padding_ms as usize * sample_rate) / MS_PER_SEC;
        let vad_window_size = match config.vad_type {
            VadType::Silero => SILERO_VAD_WINDOW_SIZE,
            VadType::Ten => TEN_VAD_WINDOW_SIZE,
        };

        let shared_backend = Arc::new(Mutex::new(backend));
        let backend_wrapper = Arc::new(BackendWrapper(shared_backend.clone()));
        let is_speaking = Arc::new(AtomicBool::new(false));

        let pc_config = PostCorrectionConfig {
            sentence_count_threshold: config.post_correction_sentence_count_threshold,
            min_text_length: config.post_correction_min_text_length,
            interval_ms: config.post_correction_interval_ms,
        };

        let post_correction_processor =
            PostCorrectionProcessor::new(backend_wrapper, pc_config, is_speaking.clone());

        Ok(Self {
            config,
            backend: shared_backend,
            post_correction_processor,
            tx,
            is_running: Arc::new(AtomicBool::new(false)),
            is_speaking,
            audio_buf: Vec::with_capacity(INTERNAL_TARGET_RATE as usize),
            input_sample_rate: 0,
            resampler: None,
            vad_processor: None,
            vad_buf: Vec::with_capacity(vad_window_size),
            vad_window_size,
            was_speech: false,
            current_speech_start: None,
            last_asr_text_change: Instant::now(),
            last_asr_text: String::new(),
            utterance_queue: UtteranceQueue::new(),
            utterance_buf: Vec::new(),
            utterance_id_counter: 0,
            pre_padding_buf: VecDeque::with_capacity(pre_padding_samples_cnt),
            pre_padding_samples_cnt,
            denoiser: None,
        })
    }

    pub fn push_samples(&mut self, samples: &[f32], sample_rate: u32) {
        if samples.is_empty() {
            return;
        }
        if sample_rate != self.input_sample_rate {
            self.input_sample_rate = sample_rate;
            if let Err(e) = self.init_resampler() {
                log::error!("[PseudoAsrStreamer] Failed to init resampler: {}", e);
                return;
            }
        }
        let resampled = if let Some(ref mut resampler) = self.resampler {
            match resampler.process(samples) {
                Ok(s) => s,
                Err(e) => {
                    log::error!("[PseudoAsrStreamer] Resampling error: {:?}", e);
                    return;
                }
            }
        } else {
            samples.to_vec()
        };
        self.audio_buf.extend(resampled);
    }

    fn init_resampler(&mut self) -> Result<()> {
        if self.input_sample_rate == INTERNAL_TARGET_RATE || self.input_sample_rate == 0 {
            self.resampler = None;
            return Ok(());
        }
        let resampler = SincResampler::new(self.input_sample_rate, INTERNAL_TARGET_RATE)
            .map_err(|e| anyhow!("Failed to create resampler: {:?}", e))?;
        self.resampler = Some(Box::new(resampler));
        Ok(())
    }

    pub fn start(&mut self) -> Result<()> {
        self.is_running.store(true, Ordering::SeqCst);
        if let Err(e) = self.init_vad() {
            return Err(anyhow!("Failed to init VAD: {}", e));
        }
        if self.config.use_denoiser && !self.config.denoiser_model_path.is_empty() {
            match SpeechDenoiser::new(&self.config.denoiser_model_path, self.config.num_threads) {
                Ok(d) => {
                    self.denoiser = Some(d);
                }
                Err(e) => {
                    log::error!("Failed to init denoiser: {}", e);
                }
            }
        }
        Ok(())
    }

    pub fn stop(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        self.post_correction_processor.reset();
        self.audio_buf.clear();
        self.pre_padding_buf.clear();
        self.vad_buf.clear();
        self.utterance_queue.clear();
        self.utterance_buf.clear();
        if let Some(ref mut resampler) = self.resampler {
            resampler.reset();
        }
        self.was_speech = false;
        self.utterance_id_counter = 0;
        self.input_sample_rate = 0;
        self.denoiser = None;
    }

    fn init_vad(&mut self) -> Result<()> {
        let vad_config = VadConfig {
            vad_type: self.config.vad_type.into(),
            model_path: self.config.vad_model_path.clone(),
            threshold: self.config.vad_threshold,
            min_silence_duration: self.config.vad_min_silence_duration,
            min_speech_duration: self.config.vad_min_speech_duration,
            max_speech_duration: self.config.vad_max_speech_duration,
            num_threads: self.config.num_threads,
        };
        let vp = VadProcessor::new(vad_config, self.is_speaking.clone())?;
        self.vad_window_size = vp.window_size();
        self.vad_processor = Some(vp);
        Ok(())
    }

    pub fn tick(&mut self) {
        if !self.is_running.load(Ordering::SeqCst) {
            return;
        }
        let samples = self.process_audio();
        if !samples.is_empty() {
            self.vad_buf.extend(samples);
        }
        let vad_window_size = self.vad_window_size;
        while self.vad_buf.len() >= vad_window_size {
            let vad_window: Vec<f32> = self.vad_buf.drain(0..vad_window_size).collect();
            self.handle_vad(&vad_window);
            for &s in &vad_window {
                if self.pre_padding_buf.len() >= self.pre_padding_samples_cnt {
                    self.pre_padding_buf.pop_front();
                }
                self.pre_padding_buf.push_back(s);
            }
        }
        self.process_utterance_queue();
        let (ready, text_to_correct, backend) = {
            if self
                .post_correction_processor
                .check_and_start_silence_timer()
            {
                (
                    true,
                    self.post_correction_processor.get_text_to_correct(),
                    Some(self.post_correction_processor.backend.clone()),
                )
            } else {
                (false, String::new(), None)
            }
        };
        if ready {
            if let Some(be) = backend {
                let _ = self.tx.try_send(StreamerEvent::PostCorrectionStarted);
                let res = block_in_place(|| {
                    Handle::current().block_on(async {
                        match be.post_correct(&text_to_correct).await {
                            Ok(corrected) => {
                                let _ = self.tx.try_send(StreamerEvent::PostCorrectionFinished);
                                Some(self.post_correction_processor.commit_correction(&corrected))
                            }
                            Err(e) => {
                                log::error!("[PseudoAsrStreamer] Post correction failed: {}", e);
                                let _ = self.tx.try_send(StreamerEvent::PostCorrectionFinished);
                                None
                            }
                        }
                    })
                });
                if let Some(output) = res {
                    match output {
                        ProcessorOutput::Final(text) => {
                            let _ = self.tx.try_send(StreamerEvent::FinalResult(text));
                        }
                        ProcessorOutput::Partial(text) => {
                            let _ = self.tx.try_send(StreamerEvent::PartialResult(text));
                        }
                    }
                }
            }
        }
    }

    fn process_audio(&mut self) -> Vec<f32> {
        if self.audio_buf.is_empty() {
            return Vec::new();
        }
        std::mem::take(&mut self.audio_buf)
    }

    fn handle_vad(&mut self, vad_window: &[f32]) {
        let Some(vad_processor) = &self.vad_processor else {
            return;
        };
        vad_processor.accept_waveform(vad_window);
        let is_speech_vad = self.is_speaking.load(Ordering::SeqCst);
        let is_intelligent_timeout = if let Some(start_time) = self.current_speech_start {
            let elapsed_since_start = start_time.elapsed().as_secs_f32();
            let elapsed_since_text_change = self.last_asr_text_change.elapsed().as_secs_f32();
            let time_exceeded = elapsed_since_start >= self.config.vad_max_speech_duration;
            const ASR_STAGNATION_THRESHOLD_SECS: f32 = 5.0;
            let asr_stagnant = elapsed_since_text_change >= ASR_STAGNATION_THRESHOLD_SECS;
            let rms = self.calculate_rms(vad_window);
            let is_low_signal = rms < self.config.signal_rms_threshold;
            time_exceeded && asr_stagnant && is_low_signal
        } else {
            false
        };

        if is_speech_vad && !is_intelligent_timeout {
            if !self.was_speech {
                let current_display_text = self.post_correction_processor.get_display_text();
                let _ = self
                    .tx
                    .try_send(StreamerEvent::SpeechStart(current_display_text));
                self.utterance_buf.extend(self.pre_padding_buf.iter());
                self.current_speech_start = Some(Instant::now());
                self.last_asr_text_change = Instant::now();
                self.last_asr_text.clear();
            }
            self.utterance_buf.extend_from_slice(vad_window);
            self.was_speech = true;
        } else if self.was_speech {
            let current_display_text = self.post_correction_processor.get_display_text();
            let _ = self
                .tx
                .try_send(StreamerEvent::SpeechEnd(current_display_text));
            self.process_one_utterance();
            self.was_speech = false;
            self.current_speech_start = None;
        }
    }

    fn calculate_rms(&self, samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
        (sum_sq / samples.len() as f32).sqrt()
    }

    fn process_one_utterance(&mut self) {
        if self.utterance_buf.is_empty() {
            return;
        }
        let tmp = Chunk::new(self.utterance_buf.clone(), self.utterance_id_counter);
        let duration_ms = tmp.samples.len() as u64 * 1000 / INTERNAL_TARGET_RATE as u64;
        let max_duration_ms = (self.config.vad_max_speech_duration * 1000.0_f32) as u64;
        if duration_ms > max_duration_ms {
            let samples_per_segment =
                (self.config.vad_max_speech_duration * INTERNAL_TARGET_RATE as f32) as usize;
            for chunk_samples in tmp.samples.chunks(samples_per_segment) {
                self.utterance_queue.push(Chunk::new(
                    chunk_samples.to_vec(),
                    self.utterance_id_counter,
                ));
                self.utterance_id_counter += 1;
            }
        } else {
            self.utterance_queue.push(tmp);
            self.utterance_id_counter += 1;
        }
        self.utterance_buf.clear();
        self.pre_padding_buf.clear();
    }

    fn process_utterance_queue(&mut self) {
        while let Some(utterance) = self.utterance_queue.pop_front() {
            let samples_to_recognize = if let Some(denoiser) = &self.denoiser {
                match denoiser.run(&utterance.samples, INTERNAL_TARGET_RATE as i32) {
                    Ok(d) => d,
                    Err(e) => {
                        log::error!("Denoiser error: {}", e);
                        utterance.samples.clone()
                    }
                }
            } else {
                utterance.samples.clone()
            };

            if !is_worthy_to_run_asr(
                &samples_to_recognize,
                &crate::types::SignalFilterConfig {
                    enabled: self.config.signal_check_enabled,
                    rms_threshold: self.config.signal_rms_threshold,
                    occupancy_ratio: self.config.signal_occupancy_ratio,
                },
                self.config.utterance_min_ms as u64,
                INTERNAL_TARGET_RATE,
            ) {
                continue;
            }

            let window_text = {
                let mut guard = self.backend.lock().unwrap();
                match guard.transcribe(&samples_to_recognize) {
                    Ok(text) => {
                        guard.record_asr_usage(
                            samples_to_recognize.len() as u64 * 1000 / INTERNAL_TARGET_RATE as u64,
                        );
                        text
                    }
                    Err(e) => {
                        log::error!("Transcription failed: {}", e);
                        continue;
                    }
                }
            };
            if window_text.is_empty() {
                continue;
            }

            let punctuated_text = {
                let mut guard = self.backend.lock().unwrap();
                match guard.insert_punctuation(&window_text, &self.config.locale) {
                    Ok(text) => text,
                    Err(e) => {
                        log::error!("Punctuation failed: {}", e);
                        window_text.clone()
                    }
                }
            };

            let output_option = self
                .post_correction_processor
                .process_input(&punctuated_text);
            if let Some(output) = output_option {
                match output {
                    ProcessorOutput::Partial(text) => {
                        if text != self.last_asr_text {
                            self.last_asr_text = text.clone();
                            self.last_asr_text_change = Instant::now();
                        }
                        let _ = self.tx.try_send(StreamerEvent::PartialResult(text));
                    }
                    ProcessorOutput::Final(text) => {
                        self.last_asr_text = text.clone();
                        self.last_asr_text_change = Instant::now();
                        let _ = self.tx.try_send(StreamerEvent::FinalResult(text));
                    }
                }
            }
        }
    }

    pub fn set_locale(&mut self, locale: StreamerLocale) {
        self.config.locale = locale;
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }
}

unsafe impl<B: AsrBackend + Send + Sync> Send for PseudoAsrStreamer<B> {}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockBackend {
        call_count: Arc<Mutex<usize>>,
    }

    impl AsrBackend for MockBackend {
        fn transcribe(&mut self, _samples: &[f32]) -> Result<String> {
            let mut count = self.call_count.lock().unwrap();
            *count += 1;
            Ok("test transcription".to_string())
        }
        fn post_correct(&mut self, text: &str) -> Result<String> {
            Ok(format!("[corrected] {}", text))
        }
        fn model_name(&self) -> String {
            "mock".to_string()
        }
        fn record_asr_usage(&mut self, _duration_ms: u64) {}
    }

    fn make_config() -> StreamerConfig {
        StreamerConfig {
            vad_model_path: "nonexistent.onnx".into(),
            vad_max_speech_duration: 10.0,
            signal_check_enabled: false,
            use_denoiser: false,
            utterance_min_ms: 100,
            ..Default::default()
        }
    }

    #[test]
    fn test_empty_audio() {
        let (tx, _rx) = mpsc::channel(10);
        let backend = MockBackend {
            call_count: Arc::new(Mutex::new(0)),
        };
        let mut streamer = PseudoAsrStreamer::new(backend, tx, make_config()).unwrap();
        // start/stop without any data should not panic
        let _ = streamer.start();
        streamer.stop();
    }

    #[test]
    fn test_restart() {
        let (tx, _rx) = mpsc::channel(10);
        let backend = MockBackend {
            call_count: Arc::new(Mutex::new(0)),
        };
        let mut streamer = PseudoAsrStreamer::new(backend, tx, make_config()).unwrap();
        let _ = streamer.start();
        streamer.stop();
        let _ = streamer.start();
        streamer.stop();
    }
}
