//! Windows ネイティブ音声認識バックエンド
//!
//! C# SpeechHelper.lib（Native AOT Static）を C FFI 経由で呼び出し、Windows 音声認識機能を利用する。
//!
//! 移植元: ~/shyme/mycute/src/stt/win.rs
//! 変更点:
//!   - FFI 宣言 + ヘルスチェック → crate::native::win_ffi に分離済み
//!   - crate::mycute_settings → crate::types / crate::pipeline
//!   - SttSettings → Option<VadConfig>
//!   - WIN_DEBUG_COUNTER 削除
//!   - IME制御 / health check / timeout punctuation は維持
//!   - coalescing / watermark / has_unconfirmed を純粋関数として抽出

use std::ffi::{CStr, CString};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use lazy_static::lazy_static;
use parking_lot::Mutex as ParkingMutex;
use tokio::sync::mpsc;

// std::sync::Mutex はグローバルチャネル（lazy_static）用
use std::sync::Mutex;

use crate::constants::{SPEECH_TIMEOUT_SEC, STT_TIMEOUT_PUNCTUATION_MS};
use crate::native::win_ffi::*;
use crate::pipeline::post_correct::{
    PostCorrectionBackend, PostCorrectionConfig, PostCorrectionProcessor, ProcessorOutput,
    SttModelType,
};
use crate::pipeline::punctuation::PunctuationMachine;
use crate::pipeline::resampler::{InternalResampler, SincResampler};
use crate::pipeline::vad::{VadConfig, VadProcessor, VAD_SAMPLE_RATE};
use crate::types::{LocaleCode, SttEvent};

// ============================================================================
// グローバルチャネル（FFI コールバック → Rust 非同期タスク間の橋渡し）
// ============================================================================

lazy_static! {
    /// 認識結果（PartialResult / FinalResult）をアプリ層に送るチャネル
    static ref WIN_GLOBAL_TX: Mutex<Option<mpsc::Sender<SttEvent>>> =
        Mutex::new(None);
    /// イベント順序を管理するシーケンスカウンタ
    static ref WIN_GLOBAL_SEQ: AtomicU64 =
        AtomicU64::new(0);
    /// 句読点挿入機（ticker task 内で使用）
    static ref WIN_GLOBAL_PUNCH: Mutex<Option<PunctuationMachine>> =
        Mutex::new(None);
    /// 現在のロケール（コールバック内で参照）
    static ref WIN_CURRENT_LOCALE: Mutex<LocaleCode> =
        Mutex::new(LocaleCode::Ja);
    /// 音声データ（f32 PCM + サンプリングレート）を ticker タスクに送るチャネル
    static ref WIN_AUDIO_SENDER: Mutex<Option<mpsc::UnboundedSender<(Vec<f32>, u32)>>> =
        Mutex::new(None);
}

// ============================================================================
// IME 制御
// ============================================================================

/// 音声入力時に IME を無効化する
pub(crate) fn disable_ime() {
    unsafe { speech_helper_disable_ime(); }
}

/// 音声入力終了時に IME を復元する
pub(crate) fn restore_ime() {
    unsafe { speech_helper_restore_ime(); }
}

// ============================================================================
// FFI コールバック（C# → Rust への非同期通知）
// ============================================================================

/// C# 側から生の音声データ（PCM f32）を受け取る
extern "C" fn win_audio_data_callback(samples: *const f32, count: u32, sample_rate: u32) {
    if samples.is_null() || count == 0 {
        return;
    }

    if let Ok(mut guard) = WIN_AUDIO_SENDER.lock() {
        if let Some(ref tx) = *guard {
            // Safety: C# 側 (GC pinned) が count 要素の有効なポインタを保証する
            let slice = unsafe { std::slice::from_raw_parts(samples, count as usize) };
            let data = slice.to_vec();
            let rate = sample_rate;

            if tx.send((data, rate)).is_err() {
                log::warn!("[Win] Failed to send audio data. Sender cleared.");
                *guard = None;
            }
        }
    }
}

/// C# 側から認識結果テキストを受け取る
extern "C" fn win_result_callback(text: *const std::ffi::c_char, is_final: std::ffi::c_int) {
    if text.is_null() {
        return;
    }

    if let Ok(guard) = WIN_GLOBAL_TX.lock() {
        if let Some(ref tx) = *guard {
            let c_str = unsafe { CStr::from_ptr(text) };
            if let Ok(s) = c_str.to_str() {
                let seq = WIN_GLOBAL_SEQ.fetch_add(1, Ordering::SeqCst);
                let event = if is_final != 0 {
                    SttEvent::FinalResult(s.to_string(), seq)
                } else {
                    SttEvent::PartialResult(s.to_string(), seq)
                };
                let _ = tx.try_send(event);
            }
        }
    }
}

/// C# 側からエラー通知を受け取る
extern "C" fn win_error_callback(error: *const std::ffi::c_char) {
    if error.is_null() {
        return;
    }

    if let Ok(guard) = WIN_GLOBAL_TX.lock() {
        if let Some(ref tx) = *guard {
            let c_str = unsafe { CStr::from_ptr(error) };
            if let Ok(s) = c_str.to_str() {
                let _ = tx.try_send(SttEvent::Error(s.to_string()));
            }
        }
    }
}

/// C# 側から準備完了通知を受け取る
extern "C" fn win_ready_callback() {
    if let Ok(guard) = WIN_GLOBAL_TX.lock() {
        if let Some(ref tx) = *guard {
            let _ = tx.try_send(SttEvent::Ready);
        }
    }
}

// ============================================================================
// Native capture 制御
// ============================================================================

/// 音声キャプチャを開始し、受信用のチャネルを返す
pub(crate) fn start_native_audio_capture()
    -> Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>>
{
    let (tx, rx) = mpsc::unbounded_channel();

    if let Ok(mut guard) = WIN_AUDIO_SENDER.lock() {
        *guard = Some(tx);
    }

    unsafe {
        speech_helper_set_audio_data_callback(Some(win_audio_data_callback));
        let ret = speech_helper_start_capture();
        if ret != 0 {
            log::error!("[Win] Failed to start audio capture: {}", ret);
            return None;
        }
    }

    Some(rx)
}

/// 音声キャプチャを停止する
pub(crate) fn stop_native_audio_capture() {
    unsafe {
        speech_helper_stop_capture();
        speech_helper_set_audio_data_callback(None);
    }

    if let Ok(mut guard) = WIN_AUDIO_SENDER.lock() {
        *guard = None;
    }
}

// ============================================================================
// 純粋関数（coalescing / watermark / has_unconfirmed）
// ============================================================================

/// STT イベント群から最新の結果のみを保持し、制御イベントはそのまま透過させる。
///
/// mac.rs の coalesce_stt_events と同一ロジック。
pub(crate) fn coalesce_stt_events(
    events: Vec<SttEvent>,
    last_processed_seq: u64,
) -> (Option<SttEvent>, Vec<SttEvent>) {
    let mut latest_stt: Option<SttEvent> = None;
    let mut control_events = Vec::new();

    for event in events {
        match event {
            SttEvent::PartialResult(_, seq) | SttEvent::FinalResult(_, seq) => {
                if seq >= last_processed_seq {
                    let is_newer = latest_stt.as_ref().map_or(true, |current| match current {
                        SttEvent::PartialResult(_, s) | SttEvent::FinalResult(_, s) => seq >= *s,
                        _ => true,
                    });
                    if is_newer {
                        latest_stt = Some(event);
                    }
                }
            }
            other => control_events.push(other),
        }
    }

    (latest_stt, control_events)
}

/// 確定済み文字数（watermark）以降の未確定テキスト差分を抽出する。
///
/// mac.rs の extract_unconfirmed_slice と同一ロジック。
pub(crate) fn extract_unconfirmed_slice(raw_text: &str, watermark_len: usize) -> String {
    raw_text.chars().skip(watermark_len).collect()
}

/// raw_char_count が watermark_len より大きいか判定する（未確定文字有無の確認）。
pub(crate) fn has_unconfirmed_chars(raw_char_count: usize, watermark_len: usize) -> bool {
    raw_char_count > watermark_len
}

// ============================================================================
// WinSpeechBackend
// ============================================================================

/// Windows ネイティブ音声認識バックエンド
pub struct WinSpeechBackend {
    is_running: Arc<AtomicBool>,
    locale: Arc<ParkingMutex<LocaleCode>>,
    post_correction_processor: Arc<ParkingMutex<Option<PostCorrectionProcessor>>>,
    is_speaking: Arc<AtomicBool>,
    vad_processor: Arc<ParkingMutex<Option<VadProcessor>>>,
    vad_config: Option<VadConfig>,
    rx_raw: Arc<ParkingMutex<Option<mpsc::Receiver<SttEvent>>>>,
    tx_app: mpsc::Sender<SttEvent>,
    ticker_task: Option<tokio::task::JoinHandle<()>>,
    resampler: Arc<ParkingMutex<Option<SincResampler>>>,
}

impl WinSpeechBackend {
    /// Windows SpeechHelper を初期化しバックエンドを構築する。
    ///
    /// 初期化時にヘルスチェックが実行される。
    pub fn new(
        tx: mpsc::Sender<SttEvent>,
        shared_locale: Arc<ParkingMutex<LocaleCode>>,
        backend: Option<Arc<dyn PostCorrectionBackend>>,
        pc_config: Option<PostCorrectionConfig>,
        vad_config: Option<VadConfig>,
    ) -> Result<Self, String> {
        let (tx_raw, rx_raw) = mpsc::channel(100);
        let is_speaking = Arc::new(AtomicBool::new(false));

        // グローバルチャネルに内部送信側を設定
        if let Ok(mut guard) = WIN_GLOBAL_TX.lock() {
            *guard = Some(tx_raw);
        }

        // PostCorrectionProcessor の初期化（UseOnlineModel = ネイティブOS音声認識用）
        let post_correction_processor = if let (Some(b), Some(c)) = (backend, pc_config) {
            Some(PostCorrectionProcessor::with_model_type(
                b, c, SttModelType::UseOnlineModel, is_speaking.clone(),
            ))
        } else {
            None
        };

        // PunctuationMachine の初期化
        if let Ok(mut guard) = WIN_GLOBAL_PUNCH.lock() {
            if guard.is_none() {
                match PunctuationMachine::new() {
                    Ok(pm) => *guard = Some(pm),
                    Err(e) => log::warn!("[Win] Failed to init PunctuationMachine: {}", e),
                }
            }
        }

        // グローバルロケール設定
        if let Ok(mut guard) = WIN_CURRENT_LOCALE.lock() {
            *guard = *shared_locale.lock();
        }

        // C# ライブラリ初期化
        unsafe {
            let result = speech_helper_init(SPEECH_TIMEOUT_SEC);
            if result != 0 {
                return Err(format!("speech_helper_init failed with code: {}", result));
            }

            speech_helper_set_result_callback(win_result_callback);
            speech_helper_set_error_callback(win_error_callback);
            speech_helper_set_ready_callback(win_ready_callback);
        }

        // ヘルスチェック実行
        unsafe {
            let health = speech_helper_check_health();
            store_health_check_result(health as u32);
            if health != 0 {
                log::info!(
                    "[Win] Health check: issues={} (model={}, privacy={}, mic={})",
                    health,
                    (health & 1) != 0,
                    (health & 2) != 0,
                    (health & 4) != 0,
                );
            }
        }

        Ok(Self {
            is_running: Arc::new(AtomicBool::new(false)),
            locale: shared_locale,
            post_correction_processor: Arc::new(ParkingMutex::new(post_correction_processor)),
            is_speaking,
            vad_processor: Arc::new(ParkingMutex::new(None)),
            vad_config,
            rx_raw: Arc::new(ParkingMutex::new(Some(rx_raw))),
            tx_app: tx,
            ticker_task: None,
            resampler: Arc::new(ParkingMutex::new(None)),
        })
    }

    /// 音声認識セッションを開始する。
    pub fn start(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(true, Ordering::SeqCst);

        // PostCorrectionProcessor をリセット
        {
            let mut proc_guard = self.post_correction_processor.lock();
            if let Some(ref mut proc) = *proc_guard {
                proc.reset();
            }
        }

        // C# 側で認識開始
        let c_locale = CString::new(self.locale.lock().as_str())
            .unwrap_or_else(|_| CString::new("ja-JP").expect("Static string"));

        unsafe {
            let result = speech_helper_start(c_locale.as_ptr());
            if result != 0 {
                log::error!("[Win] speech_helper_start failed: {}", result);
                self.is_running.store(false, Ordering::SeqCst);
                if let Ok(guard) = WIN_GLOBAL_TX.lock() {
                    if let Some(ref tx) = *guard {
                        let _ = tx.try_send(SttEvent::Error(
                            format!("Windows speech recognition failed to start (code: {})", result),
                        ));
                    }
                }
                return;
            }
        }

        // IME を無効化
        disable_ime();

        // VadProcessor の初期化
        if let Some(ref vad_config) = self.vad_config {
            let mut vp_guard = self.vad_processor.lock();
            if vp_guard.is_none() {
                match VadProcessor::new(vad_config.clone(), self.is_speaking.clone()) {
                    Ok(vp) => *vp_guard = Some(vp),
                    Err(e) => log::error!("[Win] VadProcessor init failed: {}", e),
                }
            }
        }

        // ネイティブ音声キャプチャ開始
        let mut rx_audio = start_native_audio_capture();

        // バックグラウンド ticker task 起動
        let is_running = self.is_running.clone();
        let rx_raw = self.rx_raw.clone();
        let processor = self.post_correction_processor.clone();
        let vad_processor = self.vad_processor.clone();
        let tx_app = self.tx_app.clone();
        let resampler = self.resampler.clone();

        // 前セッションの古いイベントを排出
        {
            let mut rx_guard = rx_raw.lock();
            if let Some(ref mut rx) = *rx_guard {
                while let Ok(_) = rx.try_recv() {}
            }
        }

        self.ticker_task = Some(tokio::spawn(async move {
            let interval = tokio::time::Duration::from_millis(50);
            let mut last_processed_seq = 0u64;
            let mut watermark_len: usize = 0;
            let mut current_raw_char_count: usize = 0;
            let mut current_seq: u64 = 0;

            // タイムアウト監視（Windows 固有: 句読点挿入用）
            let mut last_received_time = tokio::time::Instant::now();
            let mut last_processed_text: Option<String> = None;
            let mut processed_timeout_seq: Option<u64> = None;
            let timeout_duration = tokio::time::Duration::from_millis(STT_TIMEOUT_PUNCTUATION_MS);

            loop {
                if !is_running.load(Ordering::SeqCst) {
                    break;
                }

                // 1. 音声データ収集 → リサンプル → VAD
                if let Some(ref mut rx) = rx_audio {
                    while let Ok((samples, rate)) = rx.try_recv() {
                        let mut res_guard = resampler.lock();

                        let needs_init = match *res_guard {
                            Some(ref res) => res.input_rate() != rate,
                            None => true,
                        };
                        if needs_init && rate != 0 {
                            *res_guard =
                                SincResampler::new(rate, VAD_SAMPLE_RATE as u32).ok();
                        }

                        let samples_to_process = if rate != VAD_SAMPLE_RATE as u32 {
                            if let Some(ref mut res) = *res_guard {
                                res.process(&samples).unwrap_or(samples)
                            } else {
                                samples
                            }
                        } else {
                            samples
                        };

                        let vp_guard = vad_processor.lock();
                        if let Some(ref vp) = *vp_guard {
                            vp.accept_waveform(&samples_to_process);
                        }
                    }
                }

                // 2. イベント収集
                let raw_events: Vec<SttEvent> = {
                    let mut rx_guard = rx_raw.lock();
                    if let Some(ref mut rx) = *rx_guard {
                        let mut collected = Vec::new();
                        while let Ok(event) = rx.try_recv() {
                            collected.push(event);
                        }
                        collected
                    } else {
                        Vec::new()
                    }
                };

                // 3. Coalescing
                let has_new_stt_event = raw_events.iter().any(|e| matches!(e,
                    SttEvent::PartialResult(..) | SttEvent::FinalResult(..)
                ));
                let (latest_stt, control_events) =
                    coalesce_stt_events(raw_events, last_processed_seq);

                // 4. 制御イベントをアプリへ転送
                for event in control_events {
                    let _ = tx_app.try_send(event);
                }

                if has_new_stt_event {
                    last_received_time = tokio::time::Instant::now();
                }

                // 5. タイムアウト判定（Windows 固有）
                let is_timeout = latest_stt.is_none()
                    && last_received_time.elapsed() >= timeout_duration
                    && processed_timeout_seq != Some(last_processed_seq);

                // 6. Watermark 同期 + PostCorrection
                let event_to_process = if let Some(evt) = latest_stt {
                    Some(evt)
                } else if is_timeout {
                    // タイムアウト: 保留テキストに句読点を挿入
                    if let Some(ref last_text) = last_processed_text {
                        let has_unconfirmed =
                            has_unconfirmed_chars(last_text.chars().count(), watermark_len);
                        processed_timeout_seq = Some(last_processed_seq);
                        last_received_time = tokio::time::Instant::now();

                        if has_unconfirmed {
                            Some(SttEvent::PartialResult(
                                last_text.clone(), last_processed_seq,
                            ))
                        } else {
                            Some(SttEvent::FinalResult(
                                last_text.clone(), last_processed_seq,
                            ))
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };

                if let Some(event) = event_to_process {
                    let (raw_text, seq, is_final) = match event {
                        SttEvent::PartialResult(t, s) => (t, s, false),
                        SttEvent::FinalResult(t, s) => (t, s, true),
                        _ => unreachable!(),
                    };
                    last_processed_seq = seq;
                    let raw_char_count = raw_text.chars().count();
                    last_processed_text = Some(raw_text.clone());

                    // バックトラック検出
                    if raw_char_count < watermark_len {
                        log::warn!(
                            "[Win] Engine backtracked: {} < watermark={}",
                            raw_char_count, watermark_len
                        );
                    } else {
                        let unconfirmed =
                            extract_unconfirmed_slice(&raw_text, watermark_len);

                        // 句読点挿入（Windows 固有: PunctuationMachine）
                    let insert_punctuation = |text: String| -> String {
                            let mut punch_guard = match WIN_GLOBAL_PUNCH.lock() {
                                Ok(g) => g,
                                Err(_) => return text,
                            };
                            if let Some(ref mut pm) = *punch_guard {
                                let locale = match WIN_CURRENT_LOCALE.lock() {
                                    Ok(g) => *g,
                                    Err(_) => return text,
                                };
                                pm.insert_with_context(
                                    &text, "", &locale, is_final,
                                )
                                .unwrap_or(text)
                            } else {
                                text
                            }
                        };

                        let punctuated = insert_punctuation(unconfirmed);

                        let output = {
                            let mut proc_guard = processor.lock();
                            proc_guard
                                .as_mut()
                                .and_then(|proc| proc.process_input(&punctuated))
                        };

                        if let Some(output) = output {
                            match output {
                                ProcessorOutput::Partial(corrected) => {
                                    let _ = tx_app.try_send(
                                        SttEvent::PartialResult(corrected, seq),
                                    );
                                }
                                ProcessorOutput::Final(corrected) => {
                                    watermark_len = raw_char_count;
                                    let _ = tx_app.try_send(
                                        SttEvent::FinalResult(corrected, seq),
                                    );
                                }
                            }
                        } else {
                            // プロセッサが条件未達で補正を出力しなかった場合でも
                            // 未補正テキストをパススルー（BufferFlush 消失防止）
                            if is_final {
                                watermark_len = raw_char_count;
                            }
                            let _ = tx_app.try_send(if is_final {
                                SttEvent::FinalResult(punctuated, seq)
                            } else {
                                SttEvent::PartialResult(punctuated, seq)
                            });
                        }
                        current_raw_char_count = raw_char_count;
                        current_seq = seq;
                    }
                }

                // 7. PostCorrection pending 実行（沈黙タイマー）
                let (ready_to_correct, text_to_correct) = {
                    let mut proc_guard = processor.lock();
                    if let Some(ref mut proc) = *proc_guard {
                        if proc.check_and_start_silence_timer() {
                            (true, proc.get_text_to_correct())
                        } else {
                            (false, String::new())
                        }
                    } else {
                        (false, String::new())
                    }
                };

                if ready_to_correct {
                    let backend = {
                        let proc_guard = processor.lock();
                        proc_guard.as_ref().map(|p| p.backend.clone())
                    };

                    if let Some(be) = backend {
                        let _ = tx_app.try_send(SttEvent::PostCorrectionStarted);
                        match be.post_correct(&text_to_correct).await {
                            Ok(corrected) => {
                                let output = {
                                    let mut proc_guard = processor.lock();
                                    proc_guard
                                        .as_mut()
                                        .map(|proc| proc.commit_correction(&corrected))
                                };
                                let _ = tx_app.try_send(SttEvent::PostCorrectionFinished);
                                if let Some(ProcessorOutput::Final(final_text)) = output {
                                    watermark_len = current_raw_char_count;
                                    let _ = tx_app.try_send(
                                        SttEvent::FinalResult(final_text, current_seq),
                                    );
                                }
                            }
                            Err(e) => {
                                log::error!("[Win] Post correction failed: {}", e);
                                let _ = tx_app.try_send(SttEvent::PostCorrectionFinished);
                            }
                        }
                    }
                }

                tokio::time::sleep(interval).await;
            }
        }));
    }

    /// 音声認識セッションを停止する。
    pub fn stop(&mut self) {
        if !self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(false, Ordering::SeqCst);
        WIN_GLOBAL_SEQ.store(0, Ordering::SeqCst);

        stop_native_audio_capture();
        // IME を復元
        restore_ime();

        {
            let mut proc_guard = self.post_correction_processor.lock();
            if let Some(ref mut proc) = *proc_guard {
                proc.reset();
            }
        }

        if let Some(task) = self.ticker_task.take() {
            task.abort();
        }

        unsafe {
            speech_helper_stop();
        }
    }

    /// ロケールを更新する（次回セッションから有効）。
    pub fn set_locale(&mut self, locale: LocaleCode) {
        *self.locale.lock() = locale;
        if let Ok(mut guard) = WIN_CURRENT_LOCALE.lock() {
            *guard = locale;
        }
    }

    /// 事後補正の設定を更新する。
    pub fn update_pc_config(
        &mut self,
        backend: Option<Arc<dyn PostCorrectionBackend>>,
        pc_config: Option<PostCorrectionConfig>,
    ) {
        let mut proc_guard = self.post_correction_processor.lock();
        if let (Some(b), Some(c)) = (backend, pc_config) {
            *proc_guard = Some(PostCorrectionProcessor::with_model_type(
                b, c, SttModelType::UseOnlineModel, self.is_speaking.clone(),
            ));
        } else {
            *proc_guard = None;
        }
    }

    /// ネイティブリソースを解放する。
    pub fn cleanup(&self) {
        unsafe { speech_helper_cleanup(); }
    }

    /// ネイティブ側のメッセージポンプを駆動する。
    pub fn tick(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            unsafe { speech_helper_tick(); }
        }
    }
}

impl Drop for WinSpeechBackend {
    fn drop(&mut self) {
        self.stop();
        self.cleanup();
        if let Ok(mut guard) = WIN_GLOBAL_TX.lock() {
            *guard = None;
        }
    }
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // Coalescing（macOS と同一ロジック）
    // -----------------------------------------------------------------------

    #[test]
    fn test_coalescing_drops_older_seq() {
        let events = vec![
            SttEvent::PartialResult("old".into(), 1),
            SttEvent::PartialResult("new".into(), 2),
        ];
        let (latest, controls) = coalesce_stt_events(events, 0);
        assert!(controls.is_empty());
        if let Some(SttEvent::PartialResult(text, 2)) = latest {
            assert_eq!(text, "new");
        } else {
            panic!("Expected PartialResult(new, 2), got {:?}", latest);
        }
    }

    #[test]
    fn test_coalescing_keeps_newer_seq() {
        let events = vec![
            SttEvent::FinalResult("final".into(), 5),
            SttEvent::PartialResult("older".into(), 3),
        ];
        let (latest, _) = coalesce_stt_events(events, 0);
        if let Some(SttEvent::FinalResult(text, 5)) = latest {
            assert_eq!(text, "final");
        } else {
            panic!("Expected FinalResult(final, 5), got {:?}", latest);
        }
    }

    #[test]
    fn test_coalescing_preserves_control_events() {
        let events = vec![
            SttEvent::Ready,
            SttEvent::PartialResult("hello".into(), 1),
            SttEvent::Error("test error".into()),
        ];
        let (latest, controls) = coalesce_stt_events(events, 0);
        assert_eq!(controls.len(), 2);
        assert!(matches!(controls[0], SttEvent::Ready));
        assert!(matches!(controls[1], SttEvent::Error(_)));
        assert!(latest.is_some());
    }

    #[test]
    fn test_coalescing_stale_seq_is_dropped() {
        let events = vec![SttEvent::PartialResult("stale".into(), 1)];
        let (latest, _) = coalesce_stt_events(events, 2);
        assert!(latest.is_none());
    }

    // -----------------------------------------------------------------------
    // Watermark（macOS と同一ロジック）
    // -----------------------------------------------------------------------

    #[test]
    fn test_watermark_forward_extracts_diff() {
        let diff = extract_unconfirmed_slice("hello world", 6);
        assert_eq!(diff, "world");
    }

    #[test]
    fn test_watermark_full_text_returns_empty() {
        let diff = extract_unconfirmed_slice("hello", 5);
        assert_eq!(diff, "");
    }

    #[test]
    fn test_watermark_empty_text_returns_empty() {
        let diff = extract_unconfirmed_slice("", 0);
        assert_eq!(diff, "");
    }

    // -----------------------------------------------------------------------
    // has_unconfirmed_chars（Windows 固有: タイムアウト句読点用）
    // -----------------------------------------------------------------------

    #[test]
    fn test_has_unconfirmed_true() {
        assert!(has_unconfirmed_chars(10, 5));
    }

    #[test]
    fn test_has_unconfirmed_false() {
        assert!(!has_unconfirmed_chars(5, 10));
        assert!(!has_unconfirmed_chars(5, 5));
    }
}
