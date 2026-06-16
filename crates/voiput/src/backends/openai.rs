//! OpenAI バックエンド — Whisper API を用いた疑似ストリーミング音声認識
//!
//! 移植元: ~/shyme/mycute/src/stt/openai.rs
//! 変更点: LmgwClient → OpenAiConfig + async-openai::Client の直接構築
//!         tauri::async_runtime → tokio
//!         SttSettings → VoiputConfig
//!         83: スタブから本実装に置き換え（PseudoAsrStreamer + デコレーション + 3タスク）

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{anyhow, Result};
use async_openai::types::audio::{AudioInput, CreateTranscriptionRequestArgs};
use async_openai::Client as OpenAIClient;
use hound::{WavSpec, WavWriter};
use parking_lot::Mutex;
use tokio::runtime::Handle;
use tokio::sync::mpsc;
use tokio::task::{block_in_place, JoinHandle};
use tokio::time::{sleep, Duration};

use crate::constants::{OPENAI_READY_DELAY_MS, STT_DECORATION_INTERVAL_MS};
use crate::pipeline::streamer::{
    AsrBackend, PseudoAsrStreamer, StreamerConfig, StreamerEvent,
};
use crate::pipeline::vad::VAD_SAMPLE_RATE;
use crate::types::{LocaleCode, OpenAiConfig, SttEvent};
use crate::VoiputConfig;
// ============================================================================
// デコレーションアーティファクト除去
// ============================================================================

/// デコレーションアーティファクト（" ... ?", " ... "）をテキストから除去する。
///
/// デコレーションタスクが付与したアーティファクトが FinalResult に残っている
/// 可能性があるため、最終防衛線として除去する。
pub fn strip_decoration_artifacts(text: &str) -> String {
    text.replace(" ... ?", "").replace(" ... ", "")
}

// ============================================================================
// OpenAIRecognizer — 完全実装（PseudoAsrStreamer + デコレーション + 3タスク）
// ============================================================================

/// OpenAI バックエンドを統括する認識器
///
/// PseudoAsrStreamer を用いて音声キャプチャ → VAD → Whisper API → PostCorrection
/// のパイプラインを駆動する。発話中はデコレーションアニメーションを提供する。
pub struct OpenAIRecognizer {
    tx: mpsc::Sender<SttEvent>,
    is_running: Arc<AtomicBool>,
    language: Arc<Mutex<LocaleCode>>,
    sequence_counter: Arc<AtomicU64>,

    // ---- 設定（init_audio で使用） ----
    openai_config: Option<OpenAiConfig>,
    voiput_config: Option<VoiputConfig>,

    // ---- PseudoAsrStreamer（init_audio で構築、Arc<Mutex> でタスク間共有） ----
    streamer: Arc<Mutex<Option<PseudoAsrStreamer<OpenAIBackend>>>>,
    streamer_rx: Option<mpsc::Receiver<StreamerEvent>>,

    // ---- デコレーション機構 ----
    is_decorating: Arc<AtomicBool>,
    session_counter: Arc<AtomicU64>,
    partial_result_buffer: Arc<Mutex<Option<String>>>,
    decoration_task: Arc<Mutex<Option<JoinHandle<()>>>>,
    last_speech_end_time: Arc<Mutex<Option<Instant>>>,

    // ---- 音声キャプチャ ----
    audio_buf: Arc<Mutex<Vec<f32>>>,
    #[allow(dead_code)]
    sample_rate: Arc<AtomicU32>,
    capture_rx: Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>>,

    // ---- 非同期タスク ----
    ticker_task: Option<JoinHandle<()>>,
    capture_task: Option<JoinHandle<()>>,
    listener_task: Option<JoinHandle<()>>,
}

impl OpenAIRecognizer {
    pub fn new(
        tx: mpsc::Sender<SttEvent>,
        config: &VoiputConfig,
        shared_locale: Arc<Mutex<LocaleCode>>,
    ) -> Self {
        Self {
            tx,
            is_running: Arc::new(AtomicBool::new(false)),
            language: shared_locale,
            sequence_counter: Arc::new(AtomicU64::new(0)),
            openai_config: config.openai_config.clone(),
            voiput_config: Some(config.clone()),
            streamer: Arc::new(Mutex::new(None)),
            streamer_rx: None,
            is_decorating: Arc::new(AtomicBool::new(false)),
            session_counter: Arc::new(AtomicU64::new(0)),
            partial_result_buffer: Arc::new(Mutex::new(None)),
            decoration_task: Arc::new(Mutex::new(None)),
            last_speech_end_time: Arc::new(Mutex::new(None)),
            audio_buf: Arc::new(Mutex::new(Vec::new())),
            sample_rate: Arc::new(AtomicU32::new(0)),
            capture_rx: None,
            ticker_task: None,
            capture_task: None,
            listener_task: None,
        }
    }

    /// PseudoAsrStreamer を初期化する。
    ///
    /// OpenAIBackend を作成し、PseudoAsrStreamer を構築する。
    /// VAD モデルや PostCorrectionProcessor は streamer 内部で管理される。
    pub fn init_audio(&mut self) -> Result<()> {
        let oa_config = self.openai_config.as_ref().ok_or_else(|| {
            anyhow!("OpenAI config not available")
        })?;
        let oa_backend = OpenAIBackend::new(oa_config, self.language.clone());

        let (tx_streamer, rx_streamer) = mpsc::channel::<StreamerEvent>(100);
        let config = self.voiput_config.as_ref().ok_or_else(|| {
            anyhow!("VoiputConfig not available")
        })?;
        let streamer_config = build_streamer_config(config);

        let streamer = PseudoAsrStreamer::new(oa_backend, tx_streamer, streamer_config)?;

        {
            let mut guard = self.streamer.lock();
            *guard = Some(streamer);
        }
        self.streamer_rx = Some(rx_streamer);
        Ok(())
    }

    /// 音声認識セッションを開始する。
    ///
    /// 1. streamer.start() — VAD モデルの初期化
    /// 2. ネイティブ音声キャプチャを開始する
    /// 3. 250ms 遅延後に Ready イベントを送信する（ワイヤレスヘッドセットのスリープ復帰待ち）
    /// 4. 3つの tokio タスクを起動する: キャプチャ読み取り / 20ms ticker / イベントリスナー
    ///
    /// 複数回の start/stop サイクルに対応する。stop() でタスクを破棄した後も
    /// 再 init することで streamer を再利用可能にする。
    pub fn start(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(true, Ordering::SeqCst);

        // streamer_rx が前回のサイクルで消費されていたら再生成する
        if self.streamer_rx.is_none() {
            if let Err(e) = self.rebuild_streamer() {
                log::error!("[OpenAIRecognizer] Streamer rebuild failed: {}", e);
                let _ = self.tx.try_send(SttEvent::Error(format!(
                    "Streamer rebuild failed: {}", e
                )));
                self.is_running.store(false, Ordering::SeqCst);
                return;
            }
        }

        // PseudoAsrStreamer を開始する（VAD モデルの初期化）
        let streamer_started = {
            let mut guard = self.streamer.lock();
            if let Some(ref mut s) = *guard {
                s.start().is_ok()
            } else {
                false
            }
        };
        if !streamer_started {
            log::error!("[OpenAIRecognizer] Streamer not initialized. Call init_audio() first.");
            let _ = self.tx.try_send(SttEvent::Error(
                "Streamer not initialized. Call init_audio() first.".to_string(),
            ));
            self.is_running.store(false, Ordering::SeqCst);
            return;
        }

        // ネイティブ音声キャプチャを開始する（プラットフォーム依存）
        self.capture_rx = Self::platform_start_capture();

        let is_running = self.is_running.clone();
        let tx = self.tx.clone();
        let sequence_counter = self.sequence_counter.clone();
        let is_decorating = self.is_decorating.clone();
        let session_counter = self.session_counter.clone();
        let partial_result_buffer = self.partial_result_buffer.clone();
        let decoration_task = self.decoration_task.clone();
        let last_speech_end_time = self.last_speech_end_time.clone();
        let audio_buf = self.audio_buf.clone();
        let capture_rate = self.sample_rate.clone();
        let capture_rx = self.capture_rx.take();

        // Arc<Mutex> の streamer を共有参照として ticker に渡す
        let ticker_streamer = self.streamer.clone();

        // 250ms 遅延後に Ready イベントを送信する
        let tx_ready = tx.clone();
        tokio::spawn(async move {
            sleep(Duration::from_millis(OPENAI_READY_DELAY_MS)).await;
            let _ = tx_ready.try_send(SttEvent::Ready);
        });

        // --- Task 1: キャプチャ読み取り（サンプルレートを伝搬）---
        let capture_task = if let Some(mut rx) = capture_rx {
            let buf = audio_buf.clone();
            let rate = capture_rate.clone();
            Some(tokio::spawn(async move {
                while let Some((samples, sr)) = rx.recv().await {
                    let mut guard = buf.lock();
                    guard.extend(samples);
                    rate.store(sr, Ordering::SeqCst);
                }
            }))
        } else {
            None
        };
        self.capture_task = capture_task;

        // --- Task 2: Ticker (20ms) ---
        let ticker_is_running = is_running.clone();
        let ticker_audio_buf = audio_buf.clone();
        let ticker_streamer_clone = ticker_streamer.clone();
        let ticker_sample_rate = capture_rate.clone();

        self.ticker_task = Some(tokio::spawn(async move {
            let interval = Duration::from_millis(20);
            loop {
                if !ticker_is_running.load(Ordering::SeqCst) {
                    break;
                }

                // audio_buf からデータを取り出して streamer に渡す
                let samples = {
                    let mut guard = ticker_audio_buf.lock();
                    if guard.is_empty() {
                        None
                    } else {
                        Some(std::mem::take(&mut *guard))
                    }
                };

                if let Some(data) = samples {
                    // キャプチャから報告された実際のサンプルレートを使用する
                    let current_rate = ticker_sample_rate.load(Ordering::SeqCst);
                    let rate = if current_rate > 0 { current_rate } else { 48000 };

                    // ロック範囲を最小化: push_samples 後に一旦解放
                    {
                        let mut guard = ticker_streamer_clone.lock();
                        if let Some(ref mut s) = *guard {
                            s.push_samples(&data, rate);
                        }
                    }
                    {
                        let mut guard = ticker_streamer_clone.lock();
                        if let Some(ref mut s) = *guard {
                            s.tick();
                        }
                    }
                }

                sleep(interval).await;
            }
        }));

        // デコレーションタスクのタイムアウト（vad_max_speech_duration + 5s）
        let decoration_timeout_secs = self.voiput_config.as_ref()
            .map(|c| c.vad.max_speech_duration + 5.0)
            .unwrap_or(30.0);

        // --- Task 3: イベントリスナー ---
        let listener_tx = tx.clone();
        let listener_rx = self.streamer_rx.take();
        let listener_seq = sequence_counter.clone();
        let listener_is_decorating = is_decorating.clone();
        let listener_session_counter = session_counter.clone();
        let listener_partial_buffer = partial_result_buffer.clone();
        let listener_decoration_task = decoration_task.clone();
        let listener_speech_end_time = last_speech_end_time.clone();
        let listener_timeout_secs = decoration_timeout_secs;

        self.listener_task = Some(tokio::spawn(async move {
            let mut rx = match listener_rx {
                Some(r) => r,
                None => {
                    log::error!("[OpenAIRecognizer] Listener: streamer_rx is None");
                    return;
                }
            };

            while let Some(event) = rx.recv().await {
                match event {
                    StreamerEvent::SpeechStart(_org_text) => {
                        // 発話開始: デコレーションを開始する
                        listener_is_decorating.store(true, Ordering::SeqCst);
                        listener_session_counter.fetch_add(1, Ordering::SeqCst);

                        // 前発話の終了時刻をリセットする（新発話のアノマリー誤検出防止）
                        *listener_speech_end_time.lock() = None;

                        // 前回のバッファをクリアする
                        {
                            let mut guard = listener_partial_buffer.lock();
                            *guard = None;
                        }

                        // デコレーションタスクを起動する
                        let dec_tx = listener_tx.clone();
                        let dec_is_decorating = listener_is_decorating.clone();
                        let dec_session_counter = listener_session_counter.clone();
                        let dec_partial_buffer = listener_partial_buffer.clone();
                        let dec_speech_end_time = listener_speech_end_time.clone();
                        let dec_task_handle = listener_decoration_task.clone();
                        let current_session = dec_session_counter.load(Ordering::SeqCst);

                        // 既存のデコレーションタスクを完全に停止してから新しいタスクを開始する
                        let old_task = {
                            let mut guard = dec_task_handle.lock();
                            guard.take()
                        };
                        if let Some(task) = old_task {
                            task.abort();
                            let _ = task.await;
                        }

                        let timeout_secs = listener_timeout_secs;
                        // 新しいデコレーションタスクを起動する
                        let handle = tokio::spawn(async move {
                            let timeout_duration = Duration::from_secs_f64(timeout_secs as f64);
                            let start_time = Instant::now();
                            let mut pattern_index = 0usize;
                            let patterns = [" ... ", "? "];
                            let interval_dur = Duration::from_millis(STT_DECORATION_INTERVAL_MS);

                            loop {
                                // 4重終了チェック
                                // 1. is_decorating フラグ
                                if !dec_is_decorating.load(Ordering::SeqCst) {
                                    break;
                                }
                                // 2. session_counter が変化
                                if dec_session_counter.load(Ordering::SeqCst) != current_session {
                                    break;
                                }
                                // 3. タイムアウト
                                if start_time.elapsed() > timeout_duration {
                                    break;
                                }
                                // 4. SpeechEnd から 750ms 経過 → 異常復帰
                                {
                                    let end_time = dec_speech_end_time.lock();
                                    if let Some(t) = *end_time {
                                        if t.elapsed() > Duration::from_millis(750) {
                                            // 強制クリア: ForceClearDecoration で異常を通知する
                                            dec_is_decorating.store(false, Ordering::SeqCst);
                                            let _ = dec_tx.try_send(
                                                SttEvent::ForceClearDecoration,
                                            );
                                            let buffered =
                                                { dec_partial_buffer.lock().take() };
                                            if let Some(text) = buffered {
                                                let seq = dec_session_counter
                                                    .fetch_add(1, Ordering::SeqCst);
                                                let _ = dec_tx
                                                    .try_send(
                                                        SttEvent::PartialResult(text, seq),
                                                    );
                                            }
                                            let _ = dec_tx.try_send(SttEvent::SttCompleted);
                                            break;
                                        }
                                    }
                                }

                                // デコレーションパターンを送信する
                                let pattern = patterns[pattern_index % patterns.len()];
                                let _ = dec_tx.try_send(SttEvent::DecorationPartial(
                                    pattern.to_string(),
                                ));
                                pattern_index += 1;

                                sleep(interval_dur).await;
                            }
                        });

                        {
                            let mut guard = dec_task_handle.lock();
                            *guard = Some(handle);
                        }

                        let _ = listener_tx.try_send(SttEvent::SttPending);
                    }

                    StreamerEvent::SpeechEnd(_org_text) => {
                        // 発話終了: デコレーションを停止し、バッファをフラッシュする
                        listener_is_decorating.store(false, Ordering::SeqCst);
                        let _ = listener_speech_end_time.lock().insert(Instant::now());
                        listener_session_counter.fetch_add(1, Ordering::SeqCst);

                        // バッファリングされた PartialResult をフラッシュする
                        let buffered_text = { listener_partial_buffer.lock().take() };
                        if let Some(text) = buffered_text {
                            let seq = listener_seq.fetch_add(1, Ordering::SeqCst);
                            let _ = listener_tx.try_send(SttEvent::PartialResult(text, seq));
                            // SpeechEnd 時も is_stt_pending を解放するため SttCompleted を送信
                            let _ = listener_tx.try_send(SttEvent::SttCompleted);
                        }

                        // デコレーションタスクを破棄する
                        {
                            let mut guard = listener_decoration_task.lock();
                            if let Some(task) = guard.take() {
                                task.abort();
                            }
                        }
                    }

                    StreamerEvent::PartialResult(text) => {
                        // 発話中はバッファリング、それ以外は直接送信する
                        if listener_is_decorating.load(Ordering::SeqCst) {
                            let mut guard = listener_partial_buffer.lock();
                            *guard = Some(text);
                        } else {
                            let seq = listener_seq.fetch_add(1, Ordering::SeqCst);
                            let _ = listener_tx
                                .try_send(SttEvent::PartialResult(text, seq));
                            // mycute 準拠: 各発話単位で is_stt_pending を解放するため
                            // SttCompleted を送信する（これがないと BufferFlush が常に
                            // deferred 状態になり、PostCorrection 前にフラッシュできない）
                            let _ = listener_tx
                                .try_send(SttEvent::SttCompleted);
                        }
                    }

                    StreamerEvent::FinalResult(text) => {
                        // 最終結果: デコレーションを停止し、アーティファクトを除去する
                        listener_is_decorating.store(false, Ordering::SeqCst);
                        listener_session_counter.fetch_add(1, Ordering::SeqCst);

                        // バッファをクリアする
                        {
                            let mut guard = listener_partial_buffer.lock();
                            *guard = None;
                        }

                        // デコレーションタスクを破棄する
                        {
                            let mut guard = listener_decoration_task.lock();
                            if let Some(task) = guard.take() {
                                task.abort();
                            }
                        }

                        // アーティファクトを除去して送信する
                        let cleaned = strip_decoration_artifacts(&text);
                        let seq = listener_seq.fetch_add(1, Ordering::SeqCst);
                        let _ = listener_tx
                            .try_send(SttEvent::FinalResult(cleaned, seq));
                        let _ = listener_tx.try_send(SttEvent::SttCompleted);
                    }

                    StreamerEvent::PostCorrectionStarted => {
                        let _ = listener_tx.try_send(SttEvent::PostCorrectionStarted);
                    }

                    StreamerEvent::PostCorrectionFinished => {
                        let _ = listener_tx.try_send(SttEvent::PostCorrectionFinished);
                    }
                }
            }
        }));
    }

    /// 音声認識セッションを停止する。
    /// 全非同期タスクを abort し、ネイティブキャプチャを停止する。
    pub fn stop(&mut self) {
        if !self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(false, Ordering::SeqCst);
        self.is_decorating.store(false, Ordering::SeqCst);
        self.session_counter.fetch_add(1, Ordering::SeqCst);

        // 全タスクを中止する
        let tasks = [
            self.ticker_task.take(),
            self.capture_task.take(),
            self.listener_task.take(),
        ];
        for task in tasks.into_iter().flatten() {
            task.abort();
        }

        // デコレーションタスクを中止する
        {
            let mut guard = self.decoration_task.lock();
            if let Some(task) = guard.take() {
                task.abort();
            }
        }

        // PseudoAsrStreamer を停止する
        {
            let mut guard = self.streamer.lock();
            if let Some(ref mut s) = *guard {
                s.stop();
            }
        }

        // ネイティブキャプチャを停止する
        Self::platform_stop_capture();

        // バッファをクリアする
        {
            let mut guard = self.audio_buf.lock();
            guard.clear();
        }
        {
            let mut guard = self.partial_result_buffer.lock();
            *guard = None;
        }
    }

    pub fn tick(&mut self) {
        // バックグラウンド ticker タスクが処理するため no-op
    }

    pub fn set_locale(&mut self, locale: LocaleCode) {
        *self.language.lock() = locale;
    }

    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// PseudoAsrStreamer とそのイベントチャネルを再構築する。
    ///
    /// 複数回の start/stop サイクルに対応するため、streamer_rx が消費された後に
    /// 新しいチャネルと streamer を生成する。
    fn rebuild_streamer(&mut self) -> Result<()> {
        let oa_config = self.openai_config.as_ref().ok_or_else(|| {
            anyhow!("OpenAI config not available")
        })?;
        let oa_backend = OpenAIBackend::new(oa_config, self.language.clone());

        let (tx_streamer, rx_streamer) = mpsc::channel::<StreamerEvent>(100);
        let config = self.voiput_config.as_ref().ok_or_else(|| {
            anyhow!("VoiputConfig not available")
        })?;
        let streamer_config = build_streamer_config(config);

        let streamer = PseudoAsrStreamer::new(oa_backend, tx_streamer, streamer_config)?;

        {
            let mut guard = self.streamer.lock();
            *guard = Some(streamer);
        }
        self.streamer_rx = Some(rx_streamer);
        Ok(())
    }

    // ========================================================================
    // プラットフォーム固有のキャプチャ制御
    // ========================================================================

    /// プラットフォームのネイティブ音声キャプチャを開始する。
    #[cfg(target_os = "macos")]
    fn platform_start_capture() -> Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>> {
        crate::backends::mac::start_native_audio_capture()
    }

    #[cfg(target_os = "windows")]
    fn platform_start_capture() -> Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>> {
        crate::backends::win::start_native_audio_capture()
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn platform_start_capture() -> Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>> {
        log::warn!("[OpenAIRecognizer] Native audio capture not supported on this platform");
        None
    }

    /// プラットフォームのネイティブ音声キャプチャを停止する。
    #[cfg(target_os = "macos")]
    fn platform_stop_capture() {
        crate::backends::mac::stop_native_audio_capture();
    }

    #[cfg(target_os = "windows")]
    fn platform_stop_capture() {
        crate::backends::win::stop_native_audio_capture();
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    fn platform_stop_capture() {
        // no-op
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

    #[test]
    fn test_strip_decoration_artifacts_full() {
        // "hello ... ?" → "hello"
        let result = strip_decoration_artifacts("hello ... ?");
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_strip_decoration_artifacts_partial() {
        // "hello ... " → "hello"
        let result = strip_decoration_artifacts("hello ... ");
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_strip_decoration_artifacts_clean() {
        // "hello" → "hello"（変更なし）
        let result = strip_decoration_artifacts("hello");
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_strip_decoration_artifacts_empty() {
        let result = strip_decoration_artifacts("");
        assert_eq!(result, "");
    }

    #[test]
    fn test_strip_decoration_artifacts_only_artifact() {
        let result = strip_decoration_artifacts(" ... ?");
        assert_eq!(result, "");
    }

    #[test]
    fn test_resolve_model_path_absolute() {
        let result = resolve_model_path("/abs/path.onnx", &None);
        assert_eq!(result, "/abs/path.onnx");
    }

    #[test]
    fn test_resolve_model_path_relative_with_dir() {
        let result = resolve_model_path("rel/path.onnx", &Some("/models".into()));
        assert_eq!(result, "/models/rel/path.onnx");
    }

    #[test]
    fn test_resolve_model_path_relative_without_dir() {
        let result = resolve_model_path("rel/path.onnx", &None);
        assert_eq!(result, "rel/path.onnx");
    }

    #[test]
    fn test_resolve_model_path_empty() {
        let result = resolve_model_path("", &Some("/models".into()));
        assert_eq!(result, "");
    }
}


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

    fn backend_name(&self) -> &'static str {
        "openai-whisper"
    }

    fn record_asr_usage(&mut self, _duration_ms: u64) {
        // MYCUTE では UsageStats に記録。voiput では no-op
    }
}

// ============================================================================
// StreamerConfig 構築ヘルパー
// ============================================================================

/// VoiputConfig から StreamerConfig を構築する。
fn build_streamer_config(config: &VoiputConfig) -> StreamerConfig {
    let model_dir = &config.model_dir;
    let vad_path = resolve_model_path(
        match config.vad.vad_type {
            crate::types::VadType::Silero => &config.vad_model_paths.silero,
            crate::types::VadType::Ten => &config.vad_model_paths.ten,
        },
        model_dir,
    );
    let denoiser_path = resolve_model_path(&config.vad_model_paths.gtcrn, model_dir);

    StreamerConfig {
        vad_model_path: vad_path,
        vad_type: match config.vad.vad_type {
            crate::types::VadType::Silero => crate::pipeline::streamer::VadType::Silero,
            crate::types::VadType::Ten => crate::pipeline::streamer::VadType::Ten,
        },
        vad_threshold: config.vad.threshold,
        vad_min_silence_duration: config.vad.min_silence_duration,
        vad_min_speech_duration: config.vad.min_speech_duration,
        vad_max_speech_duration: config.vad.max_speech_duration,
        asr_stagnation_threshold_secs: config.vad.asr_stagnation_threshold_secs,
        vad_pre_padding_ms: config.vad.pre_padding_ms as u32,
        utterance_min_ms: config.vad.utterance_min_ms as u32,
        num_threads: config.vad.num_threads,
        locale: match config.locale {
            LocaleCode::Ja => crate::pipeline::streamer::StreamerLocale::Ja,
            LocaleCode::En => crate::pipeline::streamer::StreamerLocale::En,
        },
        signal_check_enabled: config.signal_filter.enabled,
        signal_rms_threshold: config.signal_filter.rms_threshold,
        signal_occupancy_ratio: config.signal_filter.occupancy_ratio,
        use_denoiser: config.denoiser.enabled,
        denoiser_model_path: denoiser_path,
        post_correction_sentence_count_threshold: config.post_correction.sentence_count_threshold,
        post_correction_min_text_length: config.post_correction.min_text_length,
        post_correction_interval_ms: config.post_correction.interval_ms,
    }
}

/// モデルファイルのパスを解決する。
fn resolve_model_path(path: &str, model_dir: &Option<String>) -> String {
    if path.is_empty() || path.starts_with('/') {
        return path.to_string();
    }
    match model_dir {
        Some(dir) if !dir.is_empty() => {
            let trimmed = dir.trim_end_matches('/');
            format!("{}/{}", trimmed, path)
        }
        _ => path.to_string(),
    }
}
