//! Voiput 公開API — crate 利用者が触れる唯一のエントリポイント
//!
//! 移植元: MYCUTE MycuteManager の STT 制御部分
//! 変更点: SpeechRecognizer をラップし、イベントチャネルと置換辞書を統合管理

use std::sync::Arc;

use indexmap::IndexMap;
use parking_lot::RwLock;
use tokio::sync::mpsc;

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
}

impl Voiput {
    /// 設定から認識器を構築する。
    ///
    /// `VoiputConfig` のバリデーション（locale 必須、engine==OpenAI で openai_config 必須等）は
    /// ビルダーの `build()` で実行済み。ここでは `SpeechRecognizer` の初期化を行う。
    pub fn new(config: VoiputConfig) -> Result<Self, VoiputError> {
        let (tx, rx) = mpsc::channel(100);
        let replaces_map = Arc::new(RwLock::new(IndexMap::new()));

        let recognizer = SpeechRecognizer::new(
            tx.clone(),
            &config,
            replaces_map.clone(),
        )
        .map_err(|e| VoiputError::InitError(e))?;

        Ok(Self {
            recognizer,
            event_rx: rx,
            event_tx: tx,
            replaces_map,
            engine: config.engine,
        })
    }

    /// 認識を開始する。
    ///
    /// 内部の `SpeechRecognizer::start()` を呼び出し、アクティブなバックエンドで音声認識が始まる。
    /// RFC §4.2 準拠の async インターフェース。
    pub async fn start(&mut self) -> Result<(), VoiputError> {
        self.recognizer.start();
        Ok(())
    }

    /// 認識を停止する。
    ///
    /// 内部の `SpeechRecognizer::stop()` を呼び出し、全バックエンドを停止する。
    /// `flush()` を使用すると、停止 → 残余イベント収集 → 再開 を1メソッドで実行できる。
    /// RFC §4.2 準拠の async インターフェース。
    pub async fn stop(&mut self) -> Result<(), VoiputError> {
        self.recognizer.stop();
        Ok(())
    }

    /// OS バックエンドの権限が付与されているか確認する。
    ///
    /// # 戻り値
    ///
    /// - `Ok(true)`: 権限あり（または権限取得が成功）
    /// - `Ok(false)`: 権限なし
    /// - `Err`: 権限確認中にエラーが発生
    ///
    /// # プラットフォーム動作
    ///
    /// - macOS: `SFSpeechRecognizer.requestAuthorization()` を Swift FFI 経由で呼び出す
    /// - Windows: `health_check()` の bit 2（マイク権限フラグ）を確認する
    /// - 非対応OS: 常に `Ok(false)` を返す
    pub async fn request_permissions(&self) -> Result<bool, VoiputError> {
        #[cfg(target_os = "macos")]
        {
            // SAFETY: speech_helper_request_authorization() は C FFI 関数。
            // 引数なし・戻り値 i32 の純粋関数で、内部で Swift の
            // SFSpeechRecognizer.requestAuthorization() を同期的に呼ぶ。
            // 静的リンクされた libSpeechHelper.a が初期化済みであることが前提。
            let status =
                unsafe { crate::native::mac_ffi::speech_helper_request_authorization() };
            // 1 = SFSpeechRecognizerAuthorizationStatus.authorized
            Ok(status == 1)
        }
        #[cfg(target_os = "windows")]
        {
            let health = crate::native::win_ffi::health_check_result();
            // bit 2 (4) = マイク権限なし
            Ok((health & 4) == 0)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Ok(false)
        }
    }

    /// 次のイベントを非同期で待機する。
    ///
    /// インターセプター（置換辞書適用）を通過した後のイベントを受信する。
    /// チャネルがクローズされた場合は `None` を返す。
    pub async fn next_event(&mut self) -> Option<SttEvent> {
        self.event_rx.recv().await
    }

    /// 認識を一時停止し、残余イベントを収集して最後のテキストを返す。
    ///
    /// # 動作シーケンス
    ///
    /// 1. `stop()` を呼び出して現在の発話を確定させる
    /// 2. イベントチャネルに残っている `FinalResult` / `PartialResult` を収集する
    /// 3. `start()` を呼び出して認識を再開する
    /// 4. 収集した最後のテキストを返す
    ///
    /// Ctrl+Enter 等の「今のテキストを確定して次へ進む」操作に使用する。
    pub async fn flush(&mut self) -> Result<String, VoiputError> {
        self.stop().await?;

        let mut final_text = String::new();
        loop {
            match self.event_rx.try_recv() {
                Ok(SttEvent::FinalResult(text, _)) | Ok(SttEvent::PartialResult(text, _)) => {
                    final_text = text;
                }
                Ok(_) => {
                    // 制御イベント（Started, Stopped 等）は無視
                }
                Err(mpsc::error::TryRecvError::Empty) => break,
                Err(mpsc::error::TryRecvError::Disconnected) => break,
            }
        }

        self.start().await?;
        Ok(final_text)
    }

    /// 現在のエンジン種別を返す。
    pub fn engine(&self) -> SttEngine {
        self.engine
    }

    /// エンジン種別を設定する。
    ///
    /// 認識動作中の場合、一度停止してからエンジンを切り替え、再開する。
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
    ///
    /// 全バックエンドのロケールを即座に更新する。
    pub fn set_locale(&mut self, locale: LocaleCode) {
        self.recognizer.set_locale(locale);
    }

    /// 置換辞書を更新する。
    ///
    /// インターセプタータスクと共有される辞書を差し替える。
    /// リアルタイムに反映される（次回のイベント中継から有効）。
    pub fn update_replaces(&self, replaces: IndexMap<String, Vec<String>>) {
        let mut map = self.replaces_map.write();
        *map = replaces;
    }

    /// 現在の動作状態を返す。
    pub fn is_running(&self) -> bool {
        self.recognizer.is_running()
    }

    /// OS バックエンドのヘルスチェック結果を返す。
    ///
    /// - 0: 正常
    /// - 非0: 回復が必要（主に Windows の WinRT SpeechRecognizer 初期化状態確認用）
    /// - Windows: `native::win_ffi::health_check_result()` の値を返す
    /// - macOS/非対応OS: 常に 0 を返す
    pub fn health_check(&self) -> u32 {
        self.recognizer.health_check()
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
        // start()/stop() は常に Ok(()) を返す（SpeechRecognizer の内部エラーはログ出力のみ）。
        // バックエンド不在時（テスト環境）は is_running が false になるが、
        // これは start() メソッドの契約範囲外（正常系: API 呼び出しがパニックしないこと）。
        assert!(rt.block_on(voiput.start()).is_ok());
        assert!(rt.block_on(voiput.stop()).is_ok());
        // stop → stop の冪等性
        assert!(rt.block_on(voiput.stop()).is_ok());
    }

    #[test]
    fn test_voiput_request_permissions() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let voiput = Voiput::new(minimal_config()).unwrap();
        // request_permissions() が Result<bool, VoiputError> を返すこと
        let result = rt.block_on(voiput.request_permissions());
        assert!(result.is_ok());
        // テスト環境では false（権限なし）が返る可能性が高い
        // （本機能の実質的な確認は実機E2Eテストで行う）
    }

    #[test]
    fn test_voiput_drop_cleanup() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        drop(voiput);
        // パニックしないこと
    }

    #[test]
    fn test_voiput_flush_called() {
        // flush() が内部的に stop/start を呼び、エラーにならないこと
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
        // パニックしないこと
    }

    #[test]
    fn test_voiput_update_replaces() {
        let voiput = Voiput::new(minimal_config()).unwrap();
        let mut replaces = IndexMap::new();
        replaces.insert("world".to_string(), vec!["hello".to_string()]);
        // パニックしないこと
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
}