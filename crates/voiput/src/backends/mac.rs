//! macOS ネイティブ音声認識バックエンド
//!
//! Swift SpeechHelper ライブラリを C FFI 経由で呼び出し、macOS の音声認識機能を利用する。
//! Classic（SFSpeechRecognizer）と Tahoe（macOS 15+）の2モードをサポート。
//!
//! 移植元: ~/shyme/mycute/src/stt/mac.rs
//! 変更点:
//!   - FFI 宣言 → crate::native::mac_ffi に分離済み
//!   - crate::mycute_settings → crate::types / crate::pipeline
//!   - SttSettings → Option<VadConfig>（必要な設定値のみ保持）
//!   - MAC_DEBUG_COUNTER 削除
//!   - エラーコードを名前付き定数に抽出
//!   - coalescing / watermark を純粋関数として抽出

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use lazy_static::lazy_static;
use parking_lot::Mutex as ParkingMutex;
use tokio::sync::mpsc;

// std::sync::Mutex はグローバルチャネル（lazy_static）用、parking_lot は構造体フィールド用
use std::sync::Mutex;

use crate::constants::SPEECH_TIMEOUT_SEC;
use crate::native::mac_ffi::*;
use crate::pipeline::post_correct::{
    PostCorrectionBackend, PostCorrectionProcessor, ProcessorOutput, SttModelType,
};
use crate::pipeline::resampler::{InternalResampler, SincResampler};
use crate::pipeline::vad::{VadConfig, VadProcessor, VAD_SAMPLE_RATE};
use crate::types::{LocaleCode, PostCorrectionConfig, SttEvent};

// ============================================================================
// エラーコード定数（Swift SpeechHelper から返される値）
// ============================================================================

/// macOS 15 未満で Tahoe エンジンを要求した
const ERROR_TAHOE_UNSUPPORTED_OS: i32 = -10;
/// 音声モデルが未インストール
const ERROR_MODEL_NOT_INSTALLED: i32 = -11;
/// Neural Engine 非対応ハードウェア
const ERROR_NO_NEURAL_ENGINE: i32 = -12;
/// マイク権限が拒否された
const ERROR_PERMISSION_DENIED: i32 = -13;

// ============================================================================
// InternalMacEngine
// ============================================================================

/// 内部で使用する macOS 音声認識エンジンの種別
#[derive(Debug, Clone, Copy, PartialEq)]
enum InternalMacEngine {
    Tahoe,
    Classic,
}

// ============================================================================
// グローバルチャネル（FFI コールバック → Rust 非同期タスク間の橋渡し）
// ============================================================================

lazy_static! {
    /// 認識結果（PartialResult / FinalResult）をアプリ層に送るチャネル
    static ref MAC_GLOBAL_TX: Mutex<Option<mpsc::Sender<SttEvent>>> =
        Mutex::new(None);
    /// イベント順序を管理するシーケンスカウンタ
    static ref MAC_GLOBAL_SEQ: std::sync::atomic::AtomicU64 =
        std::sync::atomic::AtomicU64::new(0);
    /// 音声データ（f32 PCM + サンプリングレート）を ticker タスクに送るチャネル
    static ref MAC_AUDIO_SENDER: Mutex<Option<mpsc::UnboundedSender<(Vec<f32>, u32)>>> =
        Mutex::new(None);
}

// ============================================================================
// FFI コールバック（Swift → Rust への非同期通知）
// ============================================================================

/// Swift 側から生の音声データ（PCM f32）を受け取る
extern "C" fn mac_audio_data_callback(samples: *const f32, count: i32, sample_rate: i32) {
    if samples.is_null() || count <= 0 {
        return;
    }

    if let Ok(mut guard) = MAC_AUDIO_SENDER.lock() {
        if let Some(ref tx) = *guard {
            // Safety: Swift 側が count 要素の有効なポインタを保証する
            let slice = unsafe { std::slice::from_raw_parts(samples, count as usize) };
            let data = slice.to_vec();
            let rate = sample_rate as u32;

            if tx.send((data, rate)).is_err() {
                log::warn!("[Mac] Failed to send audio data. Sender cleared.");
                *guard = None;
            }
        }
    }
}

/// Swift 側から認識結果テキストを受け取る
extern "C" fn result_callback(text: *const c_char, is_final: i32) {
    if text.is_null() {
        return;
    }

    if let Ok(guard) = MAC_GLOBAL_TX.lock() {
        if let Some(ref tx) = *guard {
            let c_str = unsafe { CStr::from_ptr(text) };
            if let Ok(s) = c_str.to_str() {
                let seq = MAC_GLOBAL_SEQ.fetch_add(1, Ordering::SeqCst);
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

/// Swift 側からエラー通知を受け取る
extern "C" fn error_callback(error: *const c_char) {
    if error.is_null() {
        return;
    }

    if let Ok(guard) = MAC_GLOBAL_TX.lock() {
        if let Some(ref tx) = *guard {
            let c_str = unsafe { CStr::from_ptr(error) };
            if let Ok(s) = c_str.to_str() {
                // "COMPLETED:" で始まるメッセージは正常終了通知
                if s.starts_with("COMPLETED:") {
                    log::info!("[Mac] Native session completed: {}", s);
                    return;
                }
                let _ = tx.try_send(SttEvent::Error(s.to_string()));
            }
        }
    }
}

/// Swift 側から準備完了通知を受け取る
extern "C" fn mac_ready_callback() {
    if let Ok(guard) = MAC_GLOBAL_TX.lock() {
        if let Some(ref tx) = *guard {
            let _ = tx.try_send(SttEvent::Ready);
        }
    }
}

// ============================================================================
// Native capture 制御
// ============================================================================

/// 音声キャプチャを開始し、受信用のチャネルを返す
pub(crate) fn start_native_audio_capture() -> Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>> {
    let (tx, rx) = mpsc::unbounded_channel();

    if let Ok(mut guard) = MAC_AUDIO_SENDER.lock() {
        *guard = Some(tx);
    }

    unsafe {
        speech_helper_set_audio_data_callback(Some(mac_audio_data_callback));
        let ret = speech_helper_start_capture();
        if ret != 0 {
            log::error!("[Mac] Failed to start audio capture: {}", ret);
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

    if let Ok(mut guard) = MAC_AUDIO_SENDER.lock() {
        *guard = None;
    }
}

// ============================================================================
// 純粋関数（coalescing / watermark）
// ============================================================================

/// STT イベント群から最新の結果のみを保持し、制御イベントはそのまま透過させる。
///
/// - `PartialResult` / `FinalResult`: 最も新しい seq の1件のみ保持
/// - 制御イベント（Error, Ready 等）: すべてそのまま保持
///
/// 戻り値: (最新のSTT結果, 制御イベント一覧)
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
/// raw_text の先頭 watermark_len 文字は既にアプリに確定送信済み。
/// この関数は残りの未確定部分のみを返す。
#[allow(dead_code)]
pub(crate) fn extract_unconfirmed_slice(raw_text: &str, watermark_len: usize) -> String {
    raw_text.chars().skip(watermark_len).collect()
}

// ============================================================================
// MacSpeechBackend
// ============================================================================

/// macOS ネイティブ音声認識バックエンド
pub struct MacSpeechBackend {
    is_running: Arc<AtomicBool>,
    internal_engine: InternalMacEngine,
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

impl MacSpeechBackend {
    /// macOS SpeechHelper を初期化しバックエンドを構築する。
    ///
    /// 内部で Tahoe（macOS 15+）と Classic の自動検出が行われる。
    pub fn new(
        tx: mpsc::Sender<SttEvent>,
        shared_locale: Arc<ParkingMutex<LocaleCode>>,
        backend: Option<Arc<dyn PostCorrectionBackend>>,
        pc_config: Option<PostCorrectionConfig>,
        vad_config: Option<VadConfig>,
    ) -> Result<Self, String> {
        let (tx_raw, rx_raw) = mpsc::channel(100);
        let is_speaking = Arc::new(AtomicBool::new(false));

        // グローバルチャネルに内部送信側を設定（FFI コールバックからの受信口）
        if let Ok(mut guard) = MAC_GLOBAL_TX.lock() {
            *guard = Some(tx_raw);
        } else {
            return Err("Failed to lock MAC_GLOBAL_TX".to_string());
        }

        // PostCorrectionProcessor の初期化
        let post_correction_processor = if let (Some(b), Some(c)) = (backend, pc_config) {
            Some(PostCorrectionProcessor::with_model_type(
                b, c, SttModelType::UseOnlineModel, is_speaking.clone(),
            ))
        } else {
            None
        };

        let mut internal_engine = InternalMacEngine::Classic;

        // Swift SpeechHelper の初期化
        unsafe {
            let result = speech_helper_init(SPEECH_TIMEOUT_SEC);
            if result != 0 {
                return Err(Self::format_error_code(result));
            }

            // コールバック設定
            speech_helper_set_result_callback(result_callback);
            speech_helper_set_error_callback(error_callback);
            speech_helper_set_ready_callback(mac_ready_callback);

            // Tahoe（macOS 15+）の自動検出
            let locale_str = CString::new(shared_locale.lock().as_str())
                .unwrap_or_else(|_| CString::new("en-US").expect("Static string"));

            let tahoe_result = tahoe_helper_init(locale_str.as_ptr(), SPEECH_TIMEOUT_SEC);
            if tahoe_result == 0 {
                log::info!("[Mac] Tahoe engine initialized (macOS 15+)");
                internal_engine = InternalMacEngine::Tahoe;
            } else {
                log::info!("[Mac] Classic engine fallback (Tahoe init code={})", tahoe_result);
            }
        }

        Ok(Self {
            is_running: Arc::new(AtomicBool::new(false)),
            internal_engine,
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

    /// FFI エラーコードを人間が読めるメッセージに変換する。
    fn format_error_code(code: i32) -> String {
        match code {
            ERROR_TAHOE_UNSUPPORTED_OS => {
                "macOS 15.0 or later is required for selected engine.".to_string()
            }
            ERROR_MODEL_NOT_INSTALLED => {
                "Speech model is not installed.".to_string()
            }
            ERROR_NO_NEURAL_ENGINE => {
                "Hardware does not support Neural Engine.".to_string()
            }
            ERROR_PERMISSION_DENIED => {
                "Microphone permission denied.".to_string()
            }
            _ => format!("Failed to initialize speech helper (Error: {})", code),
        }
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

        // Swift 側で認識開始
        let locale_str = match *self.locale.lock() {
            LocaleCode::En => "en-US",
            LocaleCode::Ja => "ja-JP",
        };
        let c_locale = CString::new(locale_str)
            .unwrap_or_else(|_| CString::new("en-US").expect("Static string"));

        unsafe {
            let result = if self.internal_engine == InternalMacEngine::Tahoe {
                tahoe_helper_start(c_locale.as_ptr())
            } else {
                speech_helper_start(c_locale.as_ptr())
            };
            if result != 0 {
                let msg = Self::format_error_code(result);
                log::error!("[Mac] Failed to start: {}", msg);
                let _ = self.tx_app.try_send(SttEvent::Error(msg));
                self.is_running.store(false, Ordering::SeqCst);
                return;
            }
        }

        // VadProcessor の初期化（設定があれば）
        if let Some(ref vad_config) = self.vad_config {
            let mut vp_guard = self.vad_processor.lock();
            if vp_guard.is_none() {
                match VadProcessor::new(vad_config.clone(), self.is_speaking.clone()) {
                    Ok(vp) => *vp_guard = Some(vp),
                    Err(e) => log::error!("[Mac] VadProcessor init failed: {}", e),
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

            loop {
                if !is_running.load(Ordering::SeqCst) {
                    break;
                }

                // 1. 音声データ収集 → リサンプル → VAD
                if let Some(ref mut rx) = rx_audio {
                    let mut audio_data = Vec::new();
                    while let Ok((samples, rate)) = rx.try_recv() {
                        let mut res_guard = resampler.lock();

                        let needs_init = match *res_guard {
                            Some(ref res) => res.input_rate() != rate,
                            None => true,
                        };
                        if needs_init && rate != 0 {
                            *res_guard = SincResampler::new(rate, VAD_SAMPLE_RATE as u32).ok();
                        }

                        if rate != VAD_SAMPLE_RATE as u32 {
                            if let Some(ref mut res) = *res_guard {
                                if let Ok(downsampled) = res.process(&samples) {
                                    audio_data.extend(downsampled);
                                    continue;
                                }
                            }
                        }
                        audio_data.extend(samples);
                    }
                    if !audio_data.is_empty() {
                        let vp_guard = vad_processor.lock();
                        if let Some(ref vp) = *vp_guard {
                            vp.accept_waveform(&audio_data);
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
                let (latest_stt, control_events) =
                    coalesce_stt_events(raw_events, last_processed_seq);

                // 4. 制御イベントをアプリへ転送
                for event in control_events {
                    let _ = tx_app.try_send(event);
                }

                // 5. Watermark 同期 + PostCorrection
                if let Some(event) = latest_stt {
                    let (raw_text, seq, is_final) = match event {
                        SttEvent::PartialResult(t, s) => (t, s, false),
                        SttEvent::FinalResult(t, s) => (t, s, true),
                        _ => unreachable!(),
                    };
                    last_processed_seq = seq;
                    let raw_char_count = raw_text.chars().count();

                    // バックトラック検出: watermark より短いテキストは無視
                    if raw_char_count < watermark_len {
                        log::warn!(
                            "[Mac] Engine backtracked: {} < watermark={}",
                            raw_char_count, watermark_len
                        );
                    } else {
                        let unconfirmed_slice: String = raw_text.chars().skip(watermark_len).collect();
                        let output = {
                            let mut proc_guard = processor.lock();
                            if let Some(ref mut proc) = *proc_guard {
                                proc.process_input(&unconfirmed_slice)
                            } else {
                                None
                            }
                        };

                        if let Some(output) = output {
                            match output {
                                ProcessorOutput::Partial(corrected) => {
                                    let _ = tx_app.try_send(SttEvent::PartialResult(corrected, seq));
                                }
                                ProcessorOutput::Final(corrected) => {
                                    watermark_len = raw_char_count;
                                    let _ = tx_app.try_send(SttEvent::FinalResult(corrected, seq));
                                }
                            }
                        } else {
                            let has_processor = processor.lock().is_some();
                            // PostCorrection 未設定時のみパススルー（設定時は process_input の戻り値で処理）
                            if !has_processor {
                                if is_final {
                                    watermark_len = raw_char_count;
                                }
                                let _ = tx_app.try_send(if is_final {
                                    SttEvent::FinalResult(unconfirmed_slice, seq)
                                } else {
                                    SttEvent::PartialResult(unconfirmed_slice, seq)
                                });
                            }
                        }
                        current_raw_char_count = raw_char_count;
                        current_seq = seq;
                    }
                }

                // 6. PostCorrection pending 実行（沈黙タイマー）
                let (ready_to_correct, text_to_correct) = {
                    let mut proc_guard = processor.lock();
                    if let Some(ref mut proc) = *proc_guard {
                        if proc.check_and_start_silence_timer() {
                            (true, proc.get_text_to_correct())
                        } else {
                            (false, String::new())
                        }
                    } else {
                        log::info!("[PostCorrection] silence_timer: processor=None");
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
                                    let _ = tx_app.try_send(SttEvent::FinalResult(final_text, current_seq));
                                }
                            }
                            Err(e) => {
                                log::error!("[Mac] Post correction failed: {}", e);
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
        MAC_GLOBAL_SEQ.store(0, Ordering::SeqCst);

        stop_native_audio_capture();

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
            if self.internal_engine == InternalMacEngine::Tahoe {
                tahoe_helper_stop();
            } else {
                speech_helper_stop();
            }
        }
    }

    /// ロケールを更新する（次回セッションから有効）。
    pub fn set_locale(&mut self, locale: LocaleCode) {
        *self.locale.lock() = locale;
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
    /// イベント処理はバックグラウンド ticker タスクが担当する。
    pub fn tick(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            unsafe { speech_helper_tick(); }
        }
    }
}

impl Drop for MacSpeechBackend {
    fn drop(&mut self) {
        self.stop();
        self.cleanup();
        if let Ok(mut guard) = MAC_GLOBAL_TX.lock() {
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
    // InternalMacEngine
    // -----------------------------------------------------------------------

    #[test]
    fn test_internal_engine_debug_clone() {
        let engine = InternalMacEngine::Tahoe;
        assert_eq!(engine, InternalMacEngine::Tahoe);
        assert_ne!(engine, InternalMacEngine::Classic);
        assert_eq!(format!("{:?}", engine), "Tahoe");
    }

    // -----------------------------------------------------------------------
    // Coalescing
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
    // Watermark
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
    // エラーコードマッピング
    // -----------------------------------------------------------------------

    #[test]
    fn test_format_error_code_known_codes() {
        assert!(MacSpeechBackend::format_error_code(-13).contains("permission"));
        assert!(MacSpeechBackend::format_error_code(-10).contains("macOS 15"));
        assert!(MacSpeechBackend::format_error_code(-11).contains("Speech model"));
        assert!(MacSpeechBackend::format_error_code(-12).contains("Neural Engine"));
    }

    #[test]
    fn test_format_error_code_unknown() {
        let msg = MacSpeechBackend::format_error_code(-99);
        assert!(msg.contains("Error: -99"));
    }
}
