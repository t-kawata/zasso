//! Voiput 公開API — crate 利用者が触れる唯一のエントリポイント
//!
//! 移植元: MYCUTE MycuteManager の STT 制御部分
//! 変更点: SpeechRecognizer をラップし、イベントチャネルと置換辞書を統合管理。
//!         M8-3 でホットキー駆動音声入力の全責務を内蔵。
//!
//! # ホットキー統合
//!
//! `enable_hotkeys()` を呼び出すと HotkeyMonitor が起動し、`handle_hotkey_events()`
//! でホットキーアクションを処理する。ユーザーはイベントループ内で定期的に
//! `handle_hotkey_events()` を呼び出すことで、ホットキーによる録音開始・フラッシュ・
//! ペーストの全動作が crate 内部で完結する。

use std::sync::Arc;

use indexmap::IndexMap;
use parking_lot::RwLock;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

use crate::audio::{play_commit_sound, play_ready_sound};
use crate::config::VoiputConfig;
use crate::error::VoiputError;
use crate::recognizer::SpeechRecognizer;
use crate::types::*;

/// voiput crate の公開エントリポイント。
///
/// 利用者はこの構造体を通じて音声認識の全操作を行う。
///
/// # 使用例
///
/// ```rust,no_run
/// use voiput::{Voiput, VoiputConfig, SttEngine, LocaleCode, VadModelPaths};
///
/// let mut voiput = Voiput::new(
///     VoiputConfig::builder()
///         .engine(SttEngine::Os)
///         .locale(LocaleCode::Ja)
///         .vad_model_paths(VadModelPaths {
///             silero: "/path/to/silero.onnx".into(),
///             ten: "/path/to/ten.onnx".into(),
///             gtcrn: String::new(),
///         })
///         .build().unwrap(),
/// ).unwrap();
///
/// let rt = tokio::runtime::Runtime::new().unwrap();
/// rt.block_on(voiput.start()).unwrap();
/// // ... 認識中 ...
/// let text = rt.block_on(async { voiput.flush().await }).unwrap();
/// println!("認識結果: {}", text);
/// ```
pub struct Voiput {
    /// 内部認識器（3バックエンド統括）
    recognizer: SpeechRecognizer,
    /// イベント受信チャネル（インターセプター通過後）
    event_rx: mpsc::Receiver<SttEvent>,
    /// イベント送信チャネル（SpeechRecognizer への入力用）
    #[allow(dead_code)]
    event_tx: mpsc::Sender<SttEvent>,
    /// 置換辞書（SpeechRecognizer のインターセプターと共有）
    replaces_map: Arc<RwLock<IndexMap<String, Vec<String>>>>,
    /// 現在のエンジン種別（キャッシュ）
    engine: SttEngine,

    // ---- M8-3: ホットキー駆動音声入力 ----
    /// 入力動作モード（RealTime / Buffered）
    mode: InputMode,
    /// 確定テキスト蓄積バッファ（Buffered モード用）
    buffer: String,
    /// 最新の認識テキスト（PartialResult で更新）
    current_text: String,
    /// LLM 事後補正中フラグ
    is_post_correcting: bool,
    /// 非同期フラッシュ要求の送信チャネル（request_flush 用）
    flush_tx: Option<oneshot::Sender<String>>,
    /// ホットキーアクション受信チャネル
    hotkey_rx: Option<mpsc::Receiver<super::hotkey::HotkeyAction>>,
}

impl Voiput {
    /// 設定から認識器を構築する。
    ///
    /// `VoiputConfig` のバリデーションはビルダーの `build()` で実行済み。
    pub fn new(config: VoiputConfig) -> Result<Self, VoiputError> {
        let (tx, rx) = mpsc::channel(100);
        let replaces_map = Arc::new(RwLock::new(IndexMap::new()));

        let recognizer = SpeechRecognizer::new(tx.clone(), &config, replaces_map.clone())
            .map_err(|e| VoiputError::InitError(e))?;

        Ok(Self {
            recognizer,
            event_rx: rx,
            event_tx: tx,
            replaces_map,
            engine: config.engine,
            mode: InputMode::Buffered,
            buffer: String::new(),
            current_text: String::new(),
            is_post_correcting: false,
            flush_tx: None,
            hotkey_rx: None,
        })
    }

    // ========================================================================
    // 基本操作（start / stop / flush）
    // ========================================================================

    /// 認識を開始する。
    pub async fn start(&mut self) -> Result<(), VoiputError> {
        self.recognizer.start();
        Ok(())
    }

    /// 認識を停止する。
    pub async fn stop(&mut self) -> Result<(), VoiputError> {
        self.recognizer.stop();
        Ok(())
    }

    /// OS バックエンドの権限が付与されているか確認する。
    ///
    /// 権限がない場合は以下の処理を自動的に行う:
    /// ① `log::warn!` で必要な設定パスを表示
    /// ② OS の設定画面を開く（macOS: `open`, Windows: `start ms-settings:`）
    pub async fn request_permissions(&self) -> Result<bool, VoiputError> {
        #[cfg(target_os = "macos")]
        {
            // SAFETY: speech_helper_request_authorization() は C FFI 関数。
            // 引数なし・戻り値 i32 の純粋関数で、内部で Swift の
            // SFSpeechRecognizer.requestAuthorization() を同期的に呼ぶ。
            let status =
                unsafe { crate::native::mac_ffi::speech_helper_request_authorization() };
            let authorized = status == 1;
            if !authorized {
                Self::show_permission_guide_macos();
            }
            Ok(authorized)
        }
        #[cfg(target_os = "windows")]
        {
            let health = crate::native::win_ffi::health_check_result();
            let authorized = (health & 4) == 0;
            if !authorized {
                Self::show_permission_guide_windows();
            }
            Ok(authorized)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            log::warn!("request_permissions: このプラットフォームでは音声認識権限の確認は利用できません");
            Ok(false)
        }
    }

    /// macOS 向け権限ガイドを表示し、設定画面を開く。
    #[cfg(target_os = "macos")]
    fn show_permission_guide_macos() {
        log::warn!("==================================================");
        log::warn!("音声認識の権限が許可されていません。");
        log::warn!("以下の設定を確認してください:");
        log::warn!("");
        log::warn!("  1. システム設定 → プライバシーとセキュリティ");
        log::warn!("     → 音声認識 → アプリケーションを許可");
        log::warn!("  2. システム設定 → プライバシーとセキュリティ");
        log::warn!("     → マイク → アプリケーションを許可");
        log::warn!("  3. (ホットキー使用時) システム設定");
        log::warn!("     → プライバシーとセキュリティ");
        log::warn!("     → アクセシビリティ → アプリケーションを許可");
        log::warn!("==================================================");
        // 設定画面を開く（失敗しても無視）
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition")
            .spawn();
    }

    /// Windows 向け権限ガイドを表示し、設定画面を開く。
    #[cfg(target_os = "windows")]
    fn show_permission_guide_windows() {
        log::warn!("==================================================");
        log::warn!("音声認識の権限が許可されていません。");
        log::warn!("以下の設定を確認してください:");
        log::warn!("");
        log::warn!("  設定 → プライバシーとセキュリティ → マイク");
        log::warn!("  → アプリケーションにマイクへのアクセスを許可");
        log::warn!("==================================================");
        // 設定画面を開く（失敗しても無視）
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "ms-settings:privacy-microphone"])
            .spawn();
    }

    /// 次のイベントを非同期で待機する。
    ///
    /// インターセプター（置換辞書適用）を通過した後のイベントを受信する。
    /// 受信後、flush_tx 発火条件をチェックする。
    pub async fn next_event(&mut self) -> Option<SttEvent> {
        let event = self.event_rx.recv().await?;

        // イベント種別に応じて flush_tx 発火条件をチェックする
        match &event {
            SttEvent::Stopped
            | SttEvent::PostCorrectionFinished
            | SttEvent::SttCompleted => {
                self.try_send_flush_text();
            }
            SttEvent::PartialResult(text, _) => {
                self.current_text = text.clone();
                if !self.is_post_correcting && self.flush_tx.is_some() {
                    self.try_send_flush_text();
                }
            }
            SttEvent::FinalResult(text, _) => {
                self.buffer.push_str(text);
                // buffer と current_text を同期し、build_flush_text の starts_with
                // 判定が正しく動作するようにする（二重出力防止）
                self.current_text = self.buffer.clone();
                if !self.is_post_correcting && self.flush_tx.is_some() {
                    self.try_send_flush_text();
                }
            }
            SttEvent::PostCorrectionStarted => {
                self.is_post_correcting = true;
            }
            _ => {}
        }

        Some(event)
    }

    /// 認識を一時停止し、残余イベントを収集して最後のテキストを返す。
    ///
    /// 1. `stop()` を呼び出して現在の発話を確定させる
    /// 2. イベントチャネルに残っている `FinalResult` / `PartialResult` を収集する
    /// 3. `start()` を呼び出して認識を再開する
    pub async fn flush(&mut self) -> Result<String, VoiputError> {
        self.stop().await?;

        let mut final_text = String::new();
        loop {
            match self.event_rx.try_recv() {
                Ok(SttEvent::FinalResult(text, _)) | Ok(SttEvent::PartialResult(text, _)) => {
                    final_text = text;
                }
                Ok(_) => {}
                Err(mpsc::error::TryRecvError::Empty) => break,
                Err(mpsc::error::TryRecvError::Disconnected) => break,
            }
        }

        self.start().await?;
        Ok(final_text)
    }

    // ========================================================================
    // ホットキー統合（M8-3）
    // ========================================================================

    /// ホットキー監視を有効にする。
    ///
    /// macOS/Windows では HotkeyMonitor を起動し、ホットキーアクションを
    /// 受信可能な状態にする。非対応 OS では何もしない。
    /// 受信したホットキーアクションは `handle_hotkey_events()` で処理する。
    pub fn enable_hotkeys(&mut self) {
        #[cfg(any(target_os = "macos", target_os = "windows"))]
        {
            let rx = crate::hotkey::start_hotkey_monitor();
            self.hotkey_rx = Some(rx);
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            log::warn!("enable_hotkeys: ホットキーは macOS / Windows のみ対応しています");
        }
    }

    /// ホットキーアクションを処理する。
    ///
    /// 保留中のホットキーアクションを全て処理する。
    /// ユーザーのイベントループ内で定期的に呼び出すこと。
    pub fn handle_hotkey_events(&mut self) {
        // ループ内で self の分割借用を避けるため、action を先に取り出して
        // rx の借用を解放してから self.process_hotkey_action を呼ぶ。
        loop {
            let action = match self.hotkey_rx.as_mut() {
                Some(rx) => match rx.try_recv() {
                    Ok(a) => a,
                    Err(mpsc::error::TryRecvError::Empty) => break,
                    Err(mpsc::error::TryRecvError::Disconnected) => {
                        self.hotkey_rx = None;
                        break;
                    }
                },
                None => break,
            };
            self.process_hotkey_action(action);
        }
    }

    /// ホットキーアクションを処理する内部メソッド。
    ///
    /// - Start: 録音開始 + Ready 音再生（録音中は無視）
    /// - BufferFlush: フラッシュ + カーソルペースト + 確定音再生（非録音中は無視）
    /// - OrchestratorInput: モード切替 + 停止
    /// - Correct / Summarize: 現状はログ出力のみ（M8-4 以降で拡張）
    ///
    /// 各分岐は「①開始処理 ②ホットキーフラグ更新 ③エフェクト」の順で遷移する。
    fn process_hotkey_action(&mut self, action: super::hotkey::HotkeyAction) {
        use super::hotkey::HotkeyAction;
        match action {
            HotkeyAction::Start => {
                // ① 開始処理: 録音中は無視
                if self.recognizer.is_running() {
                    log::debug!("[Hotkey] Start ignored: already recording");
                    return;
                }
                self.mode = InputMode::Buffered;
                self.buffer.clear();
                self.current_text.clear();
                self.is_post_correcting = false;
                self.recognizer.start();
                // ② ホットキーフラグ更新
                Self::update_recording_state(true);
                // ③ エフェクト
                log::info!("[Hotkey] Start: 録音開始");
                play_ready_sound();
            }
            HotkeyAction::BufferFlush => {
                // ① 開始処理: 非録音中は無視
                if !self.recognizer.is_running() {
                    log::debug!("[Hotkey] BufferFlush ignored: not recording");
                    return;
                }
                log::info!("[Hotkey] BufferFlush: フラッシュ要求");
                if self.is_post_correcting {
                    log::debug!("[Hotkey] BufferFlush: 事後補正中のため保留");
                } else {
                    let text = self.build_flush_text();
                    if !text.is_empty() {
                        crate::input::clipboard::save_paste_and_restore(&text);
                        play_commit_sound();
                    }
                    self.recognizer.stop();
                    // ② ホットキーフラグ更新
                    Self::update_recording_state(false);
                    self.buffer.clear();
                    self.current_text.clear();
                }
            }
            HotkeyAction::OrchestratorInput => {
                log::info!("[Hotkey] OrchestratorInput: モード切替");
                if self.recognizer.is_running() {
                    self.recognizer.stop();
                }
                // ② ホットキーフラグ更新
                Self::update_recording_state(false);
                // ① モード切替
                self.mode = match self.mode {
                    InputMode::Buffered => InputMode::RealTime,
                    InputMode::RealTime => InputMode::Buffered,
                };
            }
            action => {
                log::debug!("[Hotkey] 未処理アクション: {:?}", action);
            }
        }
    }

    /// macOS/Windows のホットキー録音状態を設定する。
    ///
    /// このフラグは HotkeyMonitor 内部のダブルタップ判定（Start vs BufferFlush）に使用される。
    fn update_recording_state(active: bool) {
        #[cfg(target_os = "macos")]
        crate::hotkey::mac::set_recording_active(active);
        #[cfg(target_os = "windows")]
        crate::hotkey::win::set_recording_active(active);
    }

    // ========================================================================
    // flush 制御（M8-3）
    // ========================================================================

    /// buffer と current_text を連結してフラッシュ用の全文を構築する。
    ///
    /// 優先順位:
    /// 1. current_text が空 → buffer をそのまま返す
    /// 2. current_text が buffer で始まる → current_text のみ返す（全文送信方式）
    /// 3. buffer が current_text で終わる → buffer のみ返す（インクリメンタル方式）
    /// 4. 上記いずれでもない → buffer + current_text を連結
    pub fn build_flush_text(&self) -> String {
        if self.current_text.is_empty() {
            self.buffer.clone()
        } else if self.current_text.starts_with(&self.buffer) {
            // 全文送信方式: current_text が buffer 全体を含むので current_text のみ返す
            self.current_text.clone()
        } else if self.buffer.ends_with(&self.current_text) {
            // インクリメンタル方式: buffer が既に current_text を末尾に含むので buffer のみ返す
            self.buffer.clone()
        } else {
            // 上記いずれでもない場合のみ連結（二重出力の最終防衛線）
            format!("{}{}", self.buffer, self.current_text)
        }
    }

    /// 非同期フラッシュ要求を行う。
    ///
    /// flush_tx を先にセットしてから recognizer.stop() を呼び出す。
    /// stop() は即座に SttEvent::Stopped をイベントループに送信するため、
    /// この順序が重要（逆順だと競合が発生する）。
    /// 戻り値の oneshot Receiver でフラッシュテキストを受け取る。
    pub fn request_flush(&mut self) -> oneshot::Receiver<String> {
        let (tx, rx) = oneshot::channel();
        self.flush_tx = Some(tx);
        self.recognizer.stop();
        rx
    }

    /// flush_tx が設定されている場合、現在のテキストを送信する。
    ///
    /// 空テキストの場合は flush_tx を温存し、後続イベントでの送信を待つ。
    /// MYCUTE の main_of_cl.rs の 4 段階発火ロジックに相当。
    fn try_send_flush_text(&mut self) {
        let Some(tx) = self.flush_tx.take() else { return };
        let text = self.build_flush_text();
        if text.is_empty() {
            // テキストがまだパイプライン内にある。flush_tx を温存する。
            self.flush_tx = Some(tx);
        } else {
            // oneshot 送信失敗は相手がドロップした場合のみなので無視
            let _ = tx.send(text);
        }
    }

    // ========================================================================
    // クリップボード操作（M8-3）
    // ========================================================================

    /// テキストをカーソル位置にペーストする。
    ///
    /// クリップボードを退避→テキスト設定→Cmd+V→復元 の安全な手順で実行する。
    pub fn paste_at_cursor(&self, text: &str) -> bool {
        crate::input::clipboard::save_paste_and_restore(text)
    }

    // ========================================================================
    // 設定・状態
    // ========================================================================

    /// 現在のエンジン種別を返す。
    pub fn engine(&self) -> SttEngine {
        self.engine
    }

    /// エンジン種別を設定する。
    pub async fn set_engine(&mut self, engine: SttEngine) -> Result<(), VoiputError> {
        let was_engine_running = self.recognizer.is_running();
        if was_engine_running {
            self.stop().await?;
        }
        self.recognizer.set_engine(engine);
        self.engine = engine;
        if was_engine_running {
            self.start().await?;
        }
        Ok(())
    }

    /// 言語ロケールを設定する。
    pub fn set_locale(&mut self, locale: LocaleCode) {
        self.recognizer.set_locale(locale);
    }

    /// 置換辞書を更新する。
    pub fn update_replaces(&self, replaces: IndexMap<String, Vec<String>>) {
        let mut map = self.replaces_map.write();
        *map = replaces;
    }

    /// 現在の動作状態を返す。
    pub fn is_running(&self) -> bool {
        self.recognizer.is_running()
    }

    /// OS バックエンドのヘルスチェック結果を返す。
    pub fn health_check(&self) -> u32 {
        self.recognizer.health_check()
    }

    /// 現在の入力モードを返す。
    pub fn input_mode(&self) -> InputMode {
        self.mode
    }

    /// 入力モードを設定する。
    pub fn set_input_mode(&mut self, mode: InputMode) {
        self.mode = mode;
    }
}

impl Drop for Voiput {
    fn drop(&mut self) {
        // SpeechRecognizer の Drop が自動的に stop() + cleanup() を呼ぶ
    }
}

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::VoiputConfig;

    fn minimal_config() -> VoiputConfig {
        VoiputConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .vad_model_paths(VadModelPaths {
                silero: "/tmp/silero.onnx".into(),
                ten: "/tmp/ten.onnx".into(),
                gtcrn: String::new(),
            })
            .build()
            .unwrap()
    }

    fn openai_config() -> VoiputConfig {
        VoiputConfig::builder()
            .engine(SttEngine::OpenAI)
            .locale(LocaleCode::En)
            .openai_config(OpenAiConfig {
                base_url: "https://api.openai.com/v1".into(),
                api_key: "sk-test".into(),
                model: "gpt-4o-mini-transcribe".into(),
            })
            .vad_model_paths(VadModelPaths {
                silero: "/tmp/silero.onnx".into(),
                ten: "/tmp/ten.onnx".into(),
                gtcrn: String::new(),
            })
            .build()
            .unwrap()
    }

    // ---- 正常系: 構築 ----

    #[test]
    fn test_voiput_new_minimal() {
        let voiput = Voiput::new(minimal_config());
        assert!(voiput.is_ok());
    }

    #[test]
    fn test_voiput_new_with_openai() {
        let voiput = Voiput::new(openai_config());
        assert!(voiput.is_ok());
    }

    // ---- 異常系: 構築 ----

    #[test]
    fn test_voiput_new_rejects_missing_vad_paths() {
        let result = VoiputConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .build();
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("vad_model_paths"));
    }

    // ---- ライフサイクル ----

    #[test]
    fn test_voiput_start_stop() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        assert!(rt.block_on(voiput.start()).is_ok());
        assert!(rt.block_on(voiput.stop()).is_ok());
        assert!(rt.block_on(voiput.stop()).is_ok());
    }

    #[test]
    fn test_voiput_request_permissions() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let voiput = Voiput::new(minimal_config()).unwrap();
        let result = rt.block_on(voiput.request_permissions());
        assert!(result.is_ok());
    }

    #[test]
    fn test_voiput_drop_cleanup() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        drop(voiput);
    }

    #[test]
    fn test_voiput_flush_called() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        let result = rt.block_on(async { voiput.flush().await });
        assert!(result.is_ok());
    }

    // ---- 設定変更 ----

    #[test]
    fn test_voiput_set_engine() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        assert_eq!(voiput.engine(), SttEngine::Os);
        assert!(rt.block_on(voiput.set_engine(SttEngine::OpenAI)).is_ok());
        assert_eq!(voiput.engine(), SttEngine::OpenAI);
        assert!(rt.block_on(voiput.set_engine(SttEngine::Os)).is_ok());
        assert_eq!(voiput.engine(), SttEngine::Os);
    }

    #[test]
    fn test_voiput_set_locale() {
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.set_locale(LocaleCode::En);
        voiput.set_locale(LocaleCode::Ja);
    }

    #[test]
    fn test_voiput_update_replaces() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        let mut replaces = IndexMap::new();
        replaces.insert("world".to_string(), vec!["hello".to_string()]);
        voiput.update_replaces(replaces);
    }

    #[test]
    fn test_voiput_health_check() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        assert_eq!(voiput.health_check(), 0);
    }

    #[test]
    fn test_voiput_engine_getter() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        assert_eq!(voiput.engine(), SttEngine::Os);
    }

    // ---- M8-3: build_flush_text ----

    #[test]
    fn test_build_flush_text_empty_current() {
        // buffer 空 + current_text あり → current_text を返す
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = String::new();
        voiput.current_text = "hello".into();
        assert_eq!(voiput.build_flush_text(), "hello");
    }

    #[test]
    fn test_build_flush_text_empty_buffer() {
        // buffer あり + current_text 空 → buffer を返す
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = "hello".into();
        voiput.current_text = String::new();
        assert_eq!(voiput.build_flush_text(), "hello");
    }

    #[test]
    fn test_build_flush_text_prefix_match() {
        // current_text starts_with buffer → current_text（重複除去）
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = "hello ".into();
        voiput.current_text = "hello world".into();
        assert_eq!(voiput.build_flush_text(), "hello world");
    }

    #[test]
    fn test_build_flush_text_no_prefix() {
        // 重複なし → buffer + current_text 連結
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = "hello ".into();
        voiput.current_text = "world".into();
        assert_eq!(voiput.build_flush_text(), "hello world");
    }

    // ---- M8-3: request_flush ----

    // ---- M8-3: enable_hotkeys ----

    #[test]
    fn test_voiput_enable_hotkeys() {
        // enable_hotkeys() がエラーにならないこと（非対応OSでは no-op）
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.enable_hotkeys();
        // hotkey_rx は cfg によって Some または None
    }

    // ---- M8-3: paste_at_cursor ----

    #[test]
    fn test_voiput_paste_at_cursor() {
        // paste_at_cursor() がパニックしないこと（実際のペーストはテストしない）
        let voiput = Voiput::new(minimal_config()).unwrap();
        let result = voiput.paste_at_cursor("test");
        // キーボード注入が失敗しても false を返す（パニックしない）
        let _ = result;
    }

    // ---- M8-3: InputMode ----

    #[test]
    fn test_voiput_input_mode_default() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        assert_eq!(voiput.input_mode(), InputMode::Buffered);
    }

    #[test]
    fn test_voiput_set_input_mode() {
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.set_input_mode(InputMode::RealTime);
        assert_eq!(voiput.input_mode(), InputMode::RealTime);
        voiput.set_input_mode(InputMode::Buffered);
        assert_eq!(voiput.input_mode(), InputMode::Buffered);
    }

    // ---- M8-3: try_send_flush_text ----

    #[test]
    fn test_request_flush_sets_flush_tx() {
        // request_flush() が flush_tx を Some に設定することを確認する
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.current_text = "flush text".into();
        let _rx = voiput.request_flush();
        // request_flush は flush_tx = Some(tx) を設定してから recognizer.stop() を呼ぶ
        assert!(voiput.flush_tx.is_some());
    }

    #[test]
    fn test_voiput_handle_hotkey_events_no_rx() {
        // hotkey_rx がない状態で handle_hotkey_events() → 何もしない
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.handle_hotkey_events();
    }

    // ---- #78: RECORDING_ACTIVE 連携 ----

    #[test]
    fn test_update_recording_state_toggle() {
        // update_recording_state() が cfg 分岐によりパニックしないこと
        Voiput::update_recording_state(true);
        Voiput::update_recording_state(false);
    }

    #[test]
    fn test_process_hotkey_buffer_flush_idle() {
        // 非録音状態で BufferFlush → 無視される（is_running チェック）
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        // recognizer は停止中なので BufferFlush は何もしない
        voiput.process_hotkey_action(super::super::hotkey::HotkeyAction::BufferFlush);
        // パニックしないこと
    }

    #[test]
    fn test_process_hotkey_orchestrator_input() {
        // OrchestratorInput → モード切替 + update_recording_state が呼ばれる
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        assert_eq!(voiput.input_mode(), InputMode::Buffered);
        // 非録音状態でもモード切替は行われる
        voiput.process_hotkey_action(super::super::hotkey::HotkeyAction::OrchestratorInput);
        assert_eq!(voiput.input_mode(), InputMode::RealTime);
        voiput.process_hotkey_action(super::super::hotkey::HotkeyAction::OrchestratorInput);
        assert_eq!(voiput.input_mode(), InputMode::Buffered);
    }

    // ---- #80: 二重出力防止 ----

    #[test]
    fn test_build_flush_text_ends_with() {
        // buffer が current_text で終わる場合 → buffer のみ返す（インクリメンタル方式）
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = "A。B".into();
        voiput.current_text = "B".into();
        assert_eq!(voiput.build_flush_text(), "A。B");
    }

    #[test]
    fn test_build_flush_text_final_sync() {
        // FinalResult 同期後の状態をシミュレート:
        // buffer = "A。B", current_text = "A。B"（同期済み）
        // → current_text starts_with buffer → true → current_text を返す
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = "A。B".into();
        voiput.current_text = "A。B".into();
        assert_eq!(voiput.build_flush_text(), "A。B");
    }

    #[test]
    fn test_build_flush_text_partial_after_final() {
        // FinalResult 同期後、PartialResult で current_text が上書きされた状態:
        // buffer = "A。B", current_text = "C"（新規発話）
        // → ends_with も starts_with も false → 連結
        let mut voiput = Voiput::new(minimal_config()).unwrap();
        voiput.buffer = "A。B".into();
        voiput.current_text = "C".into();
        assert_eq!(voiput.build_flush_text(), "A。BC");
    }
}
