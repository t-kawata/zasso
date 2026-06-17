//! 認識器統括 — 3バックエンドの一元管理 + テキスト置換インターセプター
//!
//! 移植元: ~/shyme/mycute/src/stt/recognizer.rs
//! 変更点: LmgwClient → OpenAiConfig 直接構築、SttSettings → 個別Config

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use parking_lot::Mutex;

use indexmap::IndexMap;
use parking_lot::RwLock;
use tokio::sync::mpsc;

use crate::backends::openai::{build_streamer_config, OpenAIRecognizer};
use crate::config::VoiputConfig;
use crate::constants::*;
use crate::local::recognizer::LocalRecognizer;
use crate::pipeline::post_correct::{PostCorrectionBackend, PostCorrectionConfig};
use crate::pipeline::streamer::{
    BackendWrapper, PseudoAsrStreamer, StreamerEvent,
};
use crate::pipeline::vad::{VadConfig as VadProcessorConfig, VadType as VadProcessorType};
use crate::types::{
    LocaleCode, OpenAiConfig, Qwen3AsrConfig, Qwen3AsrModelPaths, SttEngine,
    SttEvent, VadConfig, VadModelPaths, VadType,
};
use crate::OpenAIBackend;

#[cfg(target_os = "macos")]
use crate::MacSpeechBackend;
#[cfg(target_os = "windows")]
use crate::WinSpeechBackend;

/// 置換辞書をテキストに適用する。
///
/// IndexMap<String, Vec<String>> は { "置換後" => ["置換前1", "置換前2", ...] } の形式。
/// 最長一致優先でソートしてから順次置換する。
pub fn apply_replaces(replaces_map: &RwLock<IndexMap<String, Vec<String>>>, text: &str) -> String {
    let map = replaces_map.read();
    if map.is_empty() {
        return text.to_string();
    }

    // IndexMap を (before, after) ペアにフラット化
    let mut flat: Vec<(&str, &str)> = Vec::new();
    for (after, befores) in map.iter() {
        for before in befores {
            if !before.is_empty() {
                flat.push((before.as_str(), after.as_str()));
            }
        }
    }

    // 最長一致優先: 置換前文字列が長いものを先に適用する
    flat.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

    // 順次置換を適用
    let mut result = text.to_string();
    for (from, to) in &flat {
        result = result.replace(from, to);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_map() -> RwLock<IndexMap<String, Vec<String>>> {
        RwLock::new(IndexMap::new())
    }

    fn map_with(entries: Vec<(&str, Vec<&str>)>) -> RwLock<IndexMap<String, Vec<String>>> {
        let mut m = IndexMap::new();
        for (after, befores) in entries {
            m.insert(
                after.to_string(),
                befores.into_iter().map(|s| s.to_string()).collect(),
            );
        }
        RwLock::new(m)
    }

    #[test]
    fn test_empty_map_passthrough() {
        assert_eq!(apply_replaces(&empty_map(), "hello"), "hello");
    }

    #[test]
    fn test_single_replacement() {
        let map = map_with(vec![("world", vec!["hello"])]);
        assert_eq!(apply_replaces(&map, "hello"), "world");
    }

    #[test]
    fn test_multiple_replacements() {
        let map = map_with(vec![
            ("MYCUTE", vec!["mycute", "MyCute"]),
            ("WORLD", vec!["world"]),
        ]);
        assert_eq!(
            apply_replaces(&map, "mycute is MyCute world"),
            "MYCUTE is MYCUTE WORLD"
        );
    }

    #[test]
    fn test_longest_match_priority() {
        let map = map_with(vec![("α", vec!["a"]), ("αβ", vec!["ab"])]);
        assert_eq!(apply_replaces(&map, "ab"), "αβ");
    }

    #[test]
    fn test_empty_before_is_skipped() {
        let map = map_with(vec![("after", vec![""])]);
        assert_eq!(apply_replaces(&map, "text"), "text");
    }

    #[test]
    fn test_deterministic() {
        let map = map_with(vec![("X", vec!["a", "b"]), ("Y", vec!["c"])]);
        let r1 = apply_replaces(&map, "a b c");
        let r2 = apply_replaces(&map, "a b c");
        assert_eq!(r1, r2);
    }
}

// ============================================================================
// SpeechRecognizer
// ============================================================================

/// 3バックエンドを統括する認識器。
///
/// 全バックエンドを常に初期化し、エンジン切り替えを即時可能にする。
/// インターセプタータスク（std::thread）が全イベントを中継し、テキスト置換を適用する。
pub struct SpeechRecognizer {
    is_running: Arc<AtomicBool>,
    engine: SttEngine,
    /// OpenAI バックエンド
    openai_recognizer: Option<OpenAIRecognizer>,
    /// Windows バックエンド
    #[cfg(target_os = "windows")]
    win_backend: Option<WinSpeechBackend>,
    /// macOS バックエンド
    #[cfg(target_os = "macos")]
    mac_backend: Option<MacSpeechBackend>,
    /// Local バックエンド（Qwen3-ASR / Whisper 等）
    local_recognizer: Option<LocalRecognizerAdapter>,
    /// PostCorrection 再構築用の OpenAI 設定（認識エンジン用）
    openai_config: Option<OpenAiConfig>,
    /// PostCorrection 再構築用の OpenAI 設定（事後補正専用、エンジン非依存）
    pc_openai_config: Option<OpenAiConfig>,
    /// バックエンド初期化用の VAD 設定（pipeline 内部形式）
    vad_config: Option<VadProcessorConfig>,
    /// イベント送信側（インターセプター通過後、UI向け）
    tx: mpsc::Sender<SttEvent>,
    /// 全バックエンドで共有されるロケール
    shared_locale: Arc<parking_lot::Mutex<LocaleCode>>,
    /// 置換辞書（インターセプタータスクと共有、M5-2 で update_replaces に使用）
    #[allow(dead_code)]
    replaces_map: Arc<RwLock<IndexMap<String, Vec<String>>>>,
    /// 直前の認識結果（重複除去用）
    #[allow(dead_code)]
    last_result: String,
    /// ローカルシーケンスカウンタ
    #[allow(dead_code)]
    sequence_counter: u64,
}

/// `types::VadConfig` + `VadModelPaths` + `model_dir` → `pipeline::vad::VadConfig`
///
/// model_dir が設定されている場合、相対パスの VAD モデルファイルは
/// model_dir を起点として解決される。絶対パス（/ 始まり）はそのまま使用される。
fn build_vad_processor_config(
    cfg: &VadConfig,
    paths: &VadModelPaths,
    model_dir: &Option<String>,
) -> VadProcessorConfig {
    let model_path = resolve_vad_model_path(
        match cfg.vad_type {
            VadType::Silero => &paths.silero,
            VadType::Ten => &paths.ten,
        },
        model_dir,
    );
    let vad_type = match cfg.vad_type {
        VadType::Silero => VadProcessorType::Silero,
        VadType::Ten => VadProcessorType::Ten,
    };
    VadProcessorConfig {
        vad_type,
        model_path,
        threshold: cfg.threshold,
        min_silence_duration: cfg.min_silence_duration,
        min_speech_duration: cfg.min_speech_duration,
        max_speech_duration: cfg.max_speech_duration,
        num_threads: cfg.num_threads,
    }
}

/// VAD モデルファイルのパスを解決する。
///
/// - 絶対パス（/ 始まり）: そのまま返す
/// - 相対パス + model_dir あり: `{model_dir}/{path}` として結合
/// - 相対パス + model_dir なし: path をそのまま返す
fn resolve_vad_model_path(path: &str, model_dir: &Option<String>) -> String {
    if path.starts_with('/') {
        return path.to_string();
    }
    match model_dir {
        Some(dir) if !path.is_empty() => {
            let trimmed = dir.trim_end_matches('/');
            format!("{}/{}", trimmed, path)
        }
        _ => path.to_string(),
    }
}

/// Qwen3-ASR モデルファイルのパスを解決する。
///
/// model_dir が設定されている場合、`models/qwen3-asr/` サブディレクトリを
/// そのパスからの相対として解決する。絶対パスの場合はそのまま使用する。
///
/// Qwen3-ASR モデルファイルのパスを解決する。
///
/// [::STUB::] ユーティリティ関数。統合テストは直接パス構築するため現状未使用。
/// 将来 Qwen3-ASR 設定フローからの呼び出しが必要になった際に #[allow(dead_code)] を外す。
#[allow(dead_code)]
pub(crate) fn resolve_qwen3_model_paths(model_dir: &Option<String>) -> Qwen3AsrModelPaths {
    let subdir = resolve_vad_model_path(QWEN3_MODEL_SUBDIR, model_dir);
    Qwen3AsrModelPaths {
        encoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_ENCODER),
        decoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_DECODER),
        conv_frontend: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_CONV_FRONTEND),
        tokenizer_dir: format!("{}/{}", subdir, QWEN3_TOKENIZER_SUBDIR),
    }
}

/// VoiputConfig から Qwen3AsrConfig を解決する。
///
/// qwen3_asr_config が設定されている場合、各モデルファイルのパスが
/// 絶対パスか相対パスかを判断し、必要に応じて model_dir と結合する。
///
/// [::STUB::] ユーティリティ関数。統合テストは直接 Qwen3AsrConfig 構築するため現状未使用。
/// 将来 Qwen3-ASR 設定フローからの呼び出しが必要になった際に #[allow(dead_code)] を外す。
#[allow(dead_code)]
pub(crate) fn resolve_qwen3_asr_config(config: &VoiputConfig) -> Option<Qwen3AsrConfig> {
    let qwen3_config = config.qwen3_asr_config.as_ref()?;
    let model_dir = &config.model_dir;

    let resolve = |path: &str| -> String {
        if path.starts_with('/') {
            path.to_string()
        } else {
            match model_dir {
                Some(dir) => {
                    let trimmed = dir.trim_end_matches('/');
                    format!("{}/{}", trimmed, path)
                }
                None => path.to_string(),
            }
        }
    };

    Some(Qwen3AsrConfig {
        model_paths: Qwen3AsrModelPaths {
            encoder: resolve(&qwen3_config.model_paths.encoder),
            decoder: resolve(&qwen3_config.model_paths.decoder),
            conv_frontend: resolve(&qwen3_config.model_paths.conv_frontend),
            tokenizer_dir: resolve(&qwen3_config.model_paths.tokenizer_dir),
        },
        provider: qwen3_config.provider.clone(),
        num_threads: qwen3_config.num_threads,
        debug: qwen3_config.debug,
    })
}

impl SpeechRecognizer {
    /// エンジンが現在の OS で利用可能かを検証する。
    ///
    /// - `SttEngine::OpenAI`: 全プラットフォームで利用可能
    /// - `SttEngine::Os`: macOS / Windows でのみ利用可能。非対応OS では UnsupportedEngine エラー
    pub fn validate_config(engine: &SttEngine) -> Result<(), String> {
        match engine {
            SttEngine::Os => {
                if cfg!(not(any(target_os = "macos", target_os = "windows"))) {
                    Err("SttEngine::Os は現在のプラットフォームでは利用できません".into())
                } else {
                    Ok(())
                }
            }
            SttEngine::OpenAI => Ok(()),
            // Local バックエンドは全プラットフォームで利用可能。
            SttEngine::Local { .. } => Ok(()),
        }
    }

    /// 認識器を構築する。
    ///
    /// `config` から必要なパラメータを内部で抽出し、インターセプタータスクを起動して全バックエンドを初期化する。
    pub fn new(
        tx: mpsc::Sender<SttEvent>,
        config: &VoiputConfig,
        replaces_map: Arc<RwLock<IndexMap<String, Vec<String>>>>,
    ) -> Result<Self, String> {
        let engine = config.engine;
        let locale = config.locale;
        let openai_config = config.openai_config.clone();
        // PostCorrection 用の OpenAI 設定（エンジン非依存）
        let pc_openai_config = config.post_correction_openai_config.clone();

        // types::VadConfig → pipeline::vad::VadConfig に変換
        let vad_config = Some(build_vad_processor_config(
            &config.vad,
            &config.vad_model_paths,
            &config.model_dir,
        ));

        // ================================================================
        // インターセプター層: 各バックエンド → tx_internal → 置換適用 → tx
        // ================================================================
        let (tx_internal, mut rx_internal) = mpsc::channel::<SttEvent>(100);

        let replaces_for_task = replaces_map.clone();
        let tx_for_task = tx.clone();

        std::thread::spawn(move || {
            while let Some(event) = rx_internal.blocking_recv() {
                let forwarded = match event {
                    SttEvent::FinalResult(text, seq) => {
                        let replaced = apply_replaces(&replaces_for_task, &text);
                        SttEvent::FinalResult(replaced, seq)
                    }
                    SttEvent::PartialResult(text, seq) => {
                        let replaced = apply_replaces(&replaces_for_task, &text);
                        SttEvent::PartialResult(replaced, seq)
                    }
                    other => other,
                };
                if tx_for_task.blocking_send(forwarded).is_err() {
                    break;
                }
            }
        });

        let shared_locale = Arc::new(parking_lot::Mutex::new(locale));

        // OpenAI バックエンドの初期化
        let openai_recognizer = if let Some(ref _oa_config) = openai_config {
            let mut recognizer = OpenAIRecognizer::new(
                tx_internal.clone(),
                config,  // 実 config を渡す（ダミーではない）
                shared_locale.clone(),
            );
            let _ = recognizer.init_audio();
            Some(recognizer)
        } else {
            None
        };

        // macOS バックエンドの初期化（常に）
        #[cfg(target_os = "macos")]
        let mac_backend = {
            let (pc_backend, pc_config) = rebuild_pc_backend(
                pc_openai_config.as_ref(),
                shared_locale.clone(),
            );
            match MacSpeechBackend::new(
                tx_internal.clone(),
                shared_locale.clone(),
                pc_backend,
                pc_config,
                vad_config.clone(),
            ) {
                Ok(backend) => Some(backend),
                Err(e) => {
                    log::error!("[SpeechRecognizer] macOS backend init failed: {}", e);
                    None
                }
            }
        };

        // Windows バックエンドの初期化（常に）
        #[cfg(target_os = "windows")]
        let win_backend = {
            let (pc_backend, pc_config) = rebuild_pc_backend(
                pc_openai_config.as_ref(),
                shared_locale.clone(),
            );
            match WinSpeechBackend::new(
                tx_internal.clone(),
                shared_locale.clone(),
                pc_backend,
                pc_config,
                vad_config.clone(),
            ) {
                Ok(backend) => Some(backend),
                Err(e) => {
                    log::error!("[SpeechRecognizer] Windows backend init failed: {}", e);
                    None
                }
            }
        };

        // Local バックエンドの初期化（SttEngine::Local の場合のみ）
        let local_recognizer = match engine {
            SttEngine::Local { .. } => {
                match LocalRecognizerAdapter::new(tx_internal.clone(), config) {
                    Ok(adapter) => Some(adapter),
                    Err(e) => {
                        log::error!("[SpeechRecognizer] Local backend init failed: {}", e);
                        None
                    }
                }
            }
            _ => None,
        };

        Ok(Self {
            is_running: Arc::new(AtomicBool::new(false)),
            engine,
            openai_recognizer,
            local_recognizer,
            #[cfg(target_os = "windows")]
            win_backend,
            #[cfg(target_os = "macos")]
            mac_backend,
            openai_config,
            pc_openai_config,
            vad_config,
            tx,
            shared_locale,
            replaces_map,
            last_result: String::new(),
            sequence_counter: 0,
        })
    }

    /// 認識を開始する。
    pub fn start(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(true, Ordering::SeqCst);
        let _ = self.tx.try_send(SttEvent::Started);

        match self.engine {
            SttEngine::OpenAI => {
                if let Some(ref mut backend) = self.openai_recognizer {
                    backend.start();
                } else {
                    log::error!("[SpeechRecognizer] OpenAI backend not initialized");
                    self.is_running.store(false, Ordering::SeqCst);
                }
            }
            SttEngine::Os => {
                #[cfg(target_os = "windows")]
                if let Some(ref mut backend) = self.win_backend {
                    backend.start();
                    return;
                }
                #[cfg(target_os = "macos")]
                if let Some(ref mut backend) = self.mac_backend {
                    backend.start();
                    return;
                }
                log::error!("[SpeechRecognizer] No native backend for Os engine");
                self.is_running.store(false, Ordering::SeqCst);
            }
            SttEngine::Local { .. } => {
                if let Some(ref mut backend) = self.local_recognizer {
                    backend.start();
                } else {
                    log::error!("[SpeechRecognizer] Local backend not initialized");
                    self.is_running.store(false, Ordering::SeqCst);
                }
            }
        }
    }

    /// 認識を停止する。
    ///
    /// アクティブなエンジンのみを停止する（全バックエンド一律停止は行わない）。
    pub fn stop(&mut self) {
        if !self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(false, Ordering::SeqCst);
        self.last_result.clear();
        self.sequence_counter = 0;

        match self.engine {
            SttEngine::OpenAI => {
                if let Some(ref mut backend) = self.openai_recognizer {
                    backend.stop();
                }
            }
            SttEngine::Os => {
                #[cfg(target_os = "windows")]
                if let Some(ref mut backend) = self.win_backend {
                    backend.stop();
                }
                #[cfg(target_os = "macos")]
                if let Some(ref mut backend) = self.mac_backend {
                    backend.stop();
                }
            }
            SttEngine::Local { .. } => {
                if let Some(ref mut backend) = self.local_recognizer {
                    backend.stop();
                }
            }
        }

        let _ = self.tx.try_send(SttEvent::Stopped);
    }

    /// ロケールを更新する（全バックエンドに伝播）。
    pub fn set_locale(&mut self, locale: LocaleCode) {
        *self.shared_locale.lock() = locale;

        if let Some(ref mut backend) = self.openai_recognizer {
            backend.set_locale(locale);
        }
        #[cfg(target_os = "windows")]
        if let Some(ref mut backend) = self.win_backend {
            backend.set_locale(locale);
        }
        #[cfg(target_os = "macos")]
        if let Some(ref mut backend) = self.mac_backend {
            backend.set_locale(locale);
        }
        if let Some(ref mut backend) = self.local_recognizer {
            backend.set_locale(locale);
        }
        #[cfg(target_os = "windows")]
        if let Some(ref mut backend) = self.win_backend {
        }
        #[cfg(target_os = "macos")]
        if let Some(ref mut backend) = self.mac_backend {
            backend.set_locale(locale);
        }
    }

    /// エンジンを設定する（次回 start() から有効）。
    pub fn set_engine(&mut self, engine: SttEngine) {
        self.engine = engine;
    }

    /// 現在の動作状態を返す。
    pub fn is_running(&self) -> bool {
        self.is_running.load(Ordering::SeqCst)
    }

    /// OS バックエンドのヘルスチェック結果を返す。
    ///
    /// - Windows: `native::win_ffi::health_check_result()` の値をそのまま返す
    /// - macOS/非対応OS: 常に 0（正常）を返す
    pub(crate) fn health_check(&self) -> u32 {
        #[cfg(target_os = "windows")]
        {
            crate::native::win_ffi::health_check_result()
        }
        #[cfg(not(target_os = "windows"))]
        {
            0
        }
    }

    /// 設定を更新する（動作中は一時停止し再開）。
    pub fn update_config(
        &mut self,
        engine: SttEngine,
        locale: LocaleCode,
        openai_config: Option<OpenAiConfig>,
        vad_config: Option<VadProcessorConfig>,
    ) {
        let was_running = self.is_running.load(Ordering::SeqCst);
        if was_running {
            self.stop();
        }

        self.engine = engine;
        self.openai_config = openai_config;
        self.vad_config = vad_config;
        *self.shared_locale.lock() = locale;

        // アクティブなバックエンドにロケールを伝播
        if let Some(ref mut backend) = self.openai_recognizer {
            backend.set_locale(locale);
        }
        #[cfg(target_os = "windows")]
        if let Some(ref mut backend) = self.win_backend {
            backend.set_locale(locale);
            let (pc_backend, pc_config) = rebuild_pc_backend(
                self.pc_openai_config.as_ref(),
                self.shared_locale.clone(),
            );
            backend.update_pc_config(pc_backend, pc_config);
        }
        #[cfg(target_os = "macos")]
        if let Some(ref mut backend) = self.mac_backend {
            backend.set_locale(locale);
            let (pc_backend, pc_config) = rebuild_pc_backend(
                self.pc_openai_config.as_ref(),
                self.shared_locale.clone(),
            );
            backend.update_pc_config(pc_backend, pc_config);
        }

        if was_running {
            self.start();
        }
    }

    /// ネイティブリソースを解放する。
    pub fn cleanup(&self) {
        #[cfg(target_os = "macos")]
        if let Some(ref backend) = self.mac_backend {
            backend.cleanup();
        }
    }

    /// アクティブなバックエンドの tick を駆動する。
    pub fn tick(&mut self) {
        if !self.is_running.load(Ordering::SeqCst) {
            return;
        }
        match self.engine {
            SttEngine::OpenAI => {
                if let Some(ref mut backend) = self.openai_recognizer {
                    backend.tick();
                }
            }
            SttEngine::Os => {
                #[cfg(target_os = "windows")]
                if let Some(ref mut backend) = self.win_backend {
                    backend.tick();
                }
                #[cfg(target_os = "macos")]
                if let Some(ref mut backend) = self.mac_backend {
                    backend.tick();
                }
            }
            // Local バックエンドの tick() は no-op。
            // イベント中継はバックグラウンドスレッド内で行う。
            SttEngine::Local { .. } => {}
        }
    }
}

impl Drop for SpeechRecognizer {
    fn drop(&mut self) {
        self.stop();
        self.cleanup();
    }
}

/// PostCorrection バックエンドを OpenAiConfig から構築する。
///
/// macOS / Windows の update_pc_config 呼び出しで使用されるヘルパー。
fn rebuild_pc_backend(
    pc_openai_config: Option<&OpenAiConfig>,
    shared_locale: Arc<parking_lot::Mutex<LocaleCode>>,
) -> (Option<Arc<dyn PostCorrectionBackend>>, Option<PostCorrectionConfig>) {
    if let Some(oa_config) = pc_openai_config {
        log::info!("[PostCorrection] LLM 事後補正バックエンド初期化: model={}", oa_config.model);
        let oa_backend = OpenAIBackend::new(oa_config, shared_locale);
        let wrapper: Arc<dyn PostCorrectionBackend> =
            Arc::new(BackendWrapper(Arc::new(std::sync::Mutex::new(oa_backend))));
        (Some(wrapper), Some(PostCorrectionConfig::default()))
    } else {
        log::warn!("[PostCorrection] LLM 事後補正: 無効（OpenAI API キー未設定）");
        (None, None)
    }
}

// ============================================================================
// LocalRecognizerAdapter — Local バックエンドを SpeechRecognizer に統合する
// ============================================================================

/// LocalRecognizer を PseudoAsrStreamer と統合するアダプター。
///
/// OpenAIRecognizer と同様の方式で PseudoAsrStreamer を内蔵し、
/// マイクキャプチャ → VAD → ASR（Qwen3-ASR）のパイプラインを駆動する。
///
/// 以下の機能は OpenAIRecognizer に対して簡略化している：
/// - デコレーションアニメーション: 未実装（Local バックエンドでは不要）
/// - PostCorrection: 未統合（trate の AsrBackend::post_correct() を使用可能）
struct LocalRecognizerAdapter {
    /// UI 向けイベント送信チャネル
    tx: mpsc::Sender<SttEvent>,
    /// 現在のロケール
    locale: LocaleCode,
    /// PseudoAsrStreamer（start/stop/push_samples で使用、Arc<Mutex> でタスク間共有）
    streamer: Arc<Mutex<Option<PseudoAsrStreamer<LocalRecognizer>>>>,
    /// Streamer からのイベント受信チャネル。
    /// Arc<Mutex> でラップすることで start/stop サイクルを超えて生存し、
    /// スレッド終了後も再利用可能になる（rebuild_streamer 不要 → モデル再読み込み防止）。
    streamer_rx: Arc<Mutex<Option<mpsc::Receiver<StreamerEvent>>>>,
    /// ネイティブ音声キャプチャ受信チャネル（start 時にバックグラウンドタスクに移動）
    capture_rx: Option<mpsc::UnboundedReceiver<(Vec<f32>, u32)>>,
    /// 実行中フラグ（バックグラウンドタスクのループ制御用）
    is_running: Arc<AtomicBool>,
}

impl LocalRecognizerAdapter {
    /// LocalRecognizerAdapter を構築する。
    ///
    /// 1. LocalRecognizer（Qwen3AsrBackend）を初期化
    /// 2. PseudoAsrStreamer を構築して保持
    /// 3. バックグラウンドタスクは start() まで起動しない
    fn new(tx: mpsc::Sender<SttEvent>, config: &VoiputConfig) -> Result<Self> {
        let kind = match config.engine {
            SttEngine::Local { backend } => backend,
            _ => unreachable!("LocalRecognizerAdapter は Local エンジン専用"),
        };
        let recognizer = LocalRecognizer::new(kind, config)?;

        // PseudoAsrStreamer を構築する
        let (tx_streamer, rx_streamer) = mpsc::channel::<StreamerEvent>(100);
        let streamer_config = build_streamer_config(config);
        let streamer = PseudoAsrStreamer::new(recognizer, tx_streamer, streamer_config)?;

        Ok(Self {
            tx,
            locale: config.locale,
            streamer: Arc::new(Mutex::new(Some(streamer))),
            streamer_rx: Arc::new(Mutex::new(Some(rx_streamer))),
            capture_rx: None,
            is_running: Arc::new(AtomicBool::new(false)),
        })
    }

    /// 認識を開始する。
    ///
    /// SpeechRecognizer::start() からエンジン別ディスパッチ経由で呼ばれる。
    ///
    /// Streamer は new() で一度構築され、以降の start/stop サイクルで
    /// 再利用される（モデル再読み込み防止）。
    ///
    /// イベント中継と音声データ転送はバックグラウンドスレッド内で行う。
    /// streamer_rx は Arc<Mutex> でラップすることでスレッド終了後も生存し、
    /// 次回 start で新スレッドが再利用可能。
    ///
    /// Started/Stopped イベントは送信しない（SpeechRecognizer 側で一元送信）。
    fn start(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(true, Ordering::SeqCst);

        // PseudoAsrStreamer を開始する（VAD モデルの初期化）
        // Streamer 本体は new() で一度構築済み。モデル再読み込みは発生しない。
        let streamer_started = {
            let mut guard = self.streamer.lock();
            if let Some(ref mut s) = *guard {
                s.start().is_ok()
            } else {
                false
            }
        };
        if !streamer_started {
            log::error!("[LocalRecognizerAdapter] Streamer start failed");
            let _ = self.tx.try_send(SttEvent::Error(
                "Local streamer start failed".to_string(),
            ));
            self.is_running.store(false, Ordering::SeqCst);
            return;
        }

        // ネイティブ音声キャプチャを開始する（プラットフォーム依存）
        self.capture_rx = Self::platform_start_capture();

        let is_running = self.is_running.clone();
        let tx = self.tx.clone();
        let streamer = self.streamer.clone();
        let mut rx_audio = self.capture_rx.take();
        let rx_for_thread = self.streamer_rx.clone();

        // 250ms 遅延後に Ready イベントを送信する（ワイヤレスヘッドセット対策）
        let tx_ready = tx.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(OPENAI_READY_DELAY_MS));
            let _ = tx_ready.try_send(SttEvent::Ready);
        });

        // バックグラウンドスレッド: 音声転送 + イベント中継
        //
        // PseudoAsrStreamer::tick() 内部で Handle::current().block_on() により
        // 事後補正の非同期呼び出しを行うため、スレッド内に Tokio ランタイムを
        // 作成し enter しておく（std::thread::spawn では Tokio コンテキストがない）。
        //
        // streamer_rx は Arc<Mutex> で共有されているため、スレッド終了後も
        // 生存し、次回 start で新スレッドが再利用できる。
        std::thread::spawn(move || {
            let rt = match tokio::runtime::Runtime::new() {
                Ok(r) => r,
                Err(e) => {
                    log::error!("[LocalRecognizerAdapter] Failed to create Tokio runtime: {}", e);
                    return;
                }
            };
            let _guard = rt.enter();
            let mut seq_counter = 0u64;

            while is_running.load(Ordering::SeqCst) {
                // 1. ストリーマーイベントを読み取り UI に転送する
                {
                    let mut guard = rx_for_thread.lock();
                    if let Some(ref mut rx) = *guard {
                        while let Ok(event) = rx.try_recv() {
                            let stt_event = match event {
                                StreamerEvent::SpeechStart(_) => None,
                                StreamerEvent::SpeechEnd(_) => None,
                                StreamerEvent::PartialResult(text) => {
                                    seq_counter += 1;
                                    Some(SttEvent::PartialResult(text, seq_counter))
                                }
                                StreamerEvent::FinalResult(text) => {
                                    seq_counter += 1;
                                    Some(SttEvent::FinalResult(text, seq_counter))
                                }
                                StreamerEvent::PostCorrectionStarted => {
                                    Some(SttEvent::PostCorrectionStarted)
                                }
                                StreamerEvent::PostCorrectionFinished => {
                                    Some(SttEvent::PostCorrectionFinished)
                                }
                            };
                            if let Some(ev) = stt_event {
                                let _ = tx.try_send(ev);
                            }
                        }
                    }
                }

                // 2. 音声データをキャプチャからストリーマーに転送する
                if let Some(ref mut rx) = rx_audio {
                    while let Ok((samples, rate)) = rx.try_recv() {
                        let mut guard = streamer.lock();
                        if let Some(ref mut s) = *guard {
                            s.push_samples(&samples, rate);
                            s.tick();
                        }
                    }
                }

                std::thread::sleep(Duration::from_millis(20));
            }
        });
    }

    /// 認識を停止する。
    ///
    /// PseudoAsrStreamer の内部状態をリセットし、次回 start() で再初期化する。
    /// モデル再読み込みは発生しない（rebuild_streamer を呼ばないため）。
    ///
    /// Started/Stopped イベントは送信しない（SpeechRecognizer 側で一元送信）。
    fn stop(&mut self) {
        if !self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(false, Ordering::SeqCst);

        // PseudoAsrStreamer の内部状態をリセットする（VAD バッファ・発話状態等）
        // s.stop() は OfflineRecognizer の解放やモデル再読み込みを行わない。
        {
            let mut guard = self.streamer.lock();
            if let Some(ref mut s) = *guard {
                s.stop();
            }
        }

        // ネイティブキャプチャを停止する
        Self::platform_stop_capture();
    }

    /// ロケールを設定する。
    fn set_locale(&mut self, locale: LocaleCode) {
        self.locale = locale;
    }

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
        log::warn!("[LocalRecognizerAdapter] Native audio capture not supported on this platform");
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

// ============================================================================
// テスト
// ============================================================================

#[cfg(test)]
mod speech_recognizer_tests {
    use super::*;
    use crate::types::LocalAsrKind;

    #[test]
    fn test_validate_config_openai() {
        // OpenAI は全プラットフォームで利用可能
        assert!(SpeechRecognizer::validate_config(&SttEngine::OpenAI).is_ok());
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    #[test]
    fn test_validate_config_os_supported() {
        // macOS / Windows では Os エンジンが利用可能
        assert!(SpeechRecognizer::validate_config(&SttEngine::Os).is_ok());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    #[test]
    fn test_validate_config_os_unsupported() {
        // その他の OS では Os エンジンが利用不可
        assert!(SpeechRecognizer::validate_config(&SttEngine::Os).is_err());
    }

    /// インターセプターの置換適用ロジックを直接テストする。
    /// std::thread は起動せず、イベント変換のみを検証する。
    #[test]
    fn test_interceptor_applies_replaces() {
        let map: Arc<RwLock<IndexMap<String, Vec<String>>>> =
            Arc::new(RwLock::new(IndexMap::new()));
        {
            let mut m = map.write();
            m.insert("world".to_string(), vec!["hello".to_string()]);
        }

        // インターセプターと同じ変換ロジックをシミュレート
        let event = SttEvent::FinalResult("hello".to_string(), 1);
        let transformed = match event {
            SttEvent::FinalResult(text, seq) => {
                SttEvent::FinalResult(apply_replaces(&map, &text), seq)
            }
            _ => event,
        };
        if let SttEvent::FinalResult(text, _) = transformed {
            assert_eq!(text, "world");
        } else {
            panic!("Expected FinalResult");
        }
    }

    #[test]
    fn test_interceptor_passthrough_control_events() {
        let map: Arc<RwLock<IndexMap<String, Vec<String>>>> =
            Arc::new(RwLock::new(IndexMap::new()));

        let control_events = vec![
            SttEvent::Started,
            SttEvent::Stopped,
            SttEvent::Ready,
            SttEvent::Error("test".into()),
        ];

        for event in control_events {
            let transformed = match event {
                SttEvent::FinalResult(text, seq) => {
                    SttEvent::FinalResult(apply_replaces(&map, &text), seq)
                }
                SttEvent::PartialResult(text, seq) => {
                    SttEvent::PartialResult(apply_replaces(&map, &text), seq)
                }
                other => other,
            };
            // 制御イベントはそのまま（置換されず、variant も変わらない）
            match transformed {
                SttEvent::Started => {}   // OK
                SttEvent::Stopped => {}   // OK
                SttEvent::Ready => {}     // OK
                SttEvent::Error(_) => {}  // OK
                _ => panic!("Unexpected transformation"),
            }
        }
    }

    #[test]
    fn test_interceptor_empty_replaces() {
        let map: Arc<RwLock<IndexMap<String, Vec<String>>>> =
            Arc::new(RwLock::new(IndexMap::new()));

        let event = SttEvent::FinalResult("hello".to_string(), 1);
        let transformed = match event {
            SttEvent::FinalResult(text, seq) => {
                SttEvent::FinalResult(apply_replaces(&map, &text), seq)
            }
            _ => event,
        };
        if let SttEvent::FinalResult(text, _) = transformed {
            assert_eq!(text, "hello"); // 空マップ → パススルー
        } else {
            panic!("Expected FinalResult");
        }
    }

    // ---- VAD 設定変換（build_vad_processor_config / resolve_vad_model_path）----

    fn sample_vad_config() -> VadConfig {
        VadConfig {
            vad_type: VadType::Silero,
            threshold: 0.5,
            min_silence_duration: 0.2,
            min_speech_duration: 0.25,
            max_speech_duration: 25.0,
            num_threads: 4,
            ..Default::default()
        }
    }

    fn sample_paths() -> VadModelPaths {
        VadModelPaths {
            silero: "/models/silero.onnx".into(),
            ten: "/models/ten.onnx".into(),
            gtcrn: String::new(),
        }
    }

    #[test]
    fn test_build_vad_processor_config_silero() {
        let result = build_vad_processor_config(&sample_vad_config(), &sample_paths(), &None);
        assert_eq!(result.model_path, "/models/silero.onnx");
        assert_eq!(result.threshold, 0.5);
    }

    #[test]
    fn test_build_vad_processor_config_ten() {
        let cfg = VadConfig {
            vad_type: VadType::Ten,
            ..Default::default()
        };
        let paths = VadModelPaths {
            silero: "/s.onnx".into(),
            ten: "/t.onnx".into(),
            gtcrn: String::new(),
        };
        let result = build_vad_processor_config(&cfg, &paths, &None);
        assert_eq!(result.model_path, "/t.onnx");
    }

    #[test]
    fn test_resolve_vad_model_path_absolute() {
        let result = resolve_vad_model_path("/abs/path.onnx", &None);
        assert_eq!(result, "/abs/path.onnx");
    }

    #[test]
    fn test_resolve_vad_model_path_relative_with_dir() {
        let result = resolve_vad_model_path("rel/path.onnx", &Some("/base/models".into()));
        assert_eq!(result, "/base/models/rel/path.onnx");
    }

    #[test]
    fn test_resolve_vad_model_path_relative_without_dir() {
        let result = resolve_vad_model_path("rel/path.onnx", &None);
        assert_eq!(result, "rel/path.onnx");
    }

    #[test]
    fn test_resolve_vad_model_path_empty_with_dir() {
        let result = resolve_vad_model_path("", &Some("/base".into()));
        assert_eq!(result, "");
    }

    // --- Qwen3-ASR パス解決 (M2-5) ---

    #[test]
    fn test_resolve_qwen3_model_paths_with_dir() {
        let model_dir = Some("/opt/models".into());
        let paths = resolve_qwen3_model_paths(&model_dir);
        assert_eq!(paths.encoder, "/opt/models/qwen3-asr/encoder.int8.onnx");
        assert_eq!(paths.decoder, "/opt/models/qwen3-asr/decoder.int8.onnx");
        assert_eq!(paths.conv_frontend, "/opt/models/qwen3-asr/conv_frontend.onnx");
        assert_eq!(paths.tokenizer_dir, "/opt/models/qwen3-asr/tokenizer");
    }

    #[test]
    fn test_resolve_qwen3_model_paths_without_dir() {
        let paths = resolve_qwen3_model_paths(&None);
        assert_eq!(paths.encoder, "qwen3-asr/encoder.int8.onnx");
        assert_eq!(paths.tokenizer_dir, "qwen3-asr/tokenizer");
    }

    #[test]
    fn test_resolve_qwen3_model_paths_absolute_subdir() {
        let model_dir = Some("/".into());
        let paths = resolve_qwen3_model_paths(&model_dir);
        // model_dir="/" → trim_end_matches('/') → "" → ""/qwen3-asr/...
        assert_eq!(paths.encoder, "/qwen3-asr/encoder.int8.onnx");
        assert_eq!(paths.decoder, "/qwen3-asr/decoder.int8.onnx");
    }

    #[test]
    fn test_resolve_qwen3_asr_config_none() {
        // SttEngine::Os を使用（Local エンジンでは build() が qwen3_asr_config を要求するため）
        let config = VoiputConfig::builder()
            .engine(SttEngine::Os)
            .locale(LocaleCode::Ja)
            .vad_model_paths(VadModelPaths {
                silero: "silero.onnx".into(),
                ten: "ten.onnx".into(),
                gtcrn: "gtcrn.onnx".into(),
            })
            .build()
            .unwrap();
        // qwen3_asr_config 未設定 → None
        assert!(resolve_qwen3_asr_config(&config).is_none());
    }

    #[test]
    fn test_resolve_qwen3_asr_config_with_relative_paths() {
        let qwen3_config = Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: "encoder.int8.onnx".into(),
                decoder: "decoder.int8.onnx".into(),
                conv_frontend: "conv_frontend.onnx".into(),
                tokenizer_dir: "tokenizer".into(),
            },
            provider: "cpu".into(),
            num_threads: 2,
            debug: false,
        };
        let config = VoiputConfig::builder()
            .engine(SttEngine::Local { backend: LocalAsrKind::Qwen3Asr })
            .locale(LocaleCode::Ja)
            .qwen3_asr_config(qwen3_config)
            .vad_model_paths(VadModelPaths {
                silero: "silero.onnx".into(),
                ten: "ten.onnx".into(),
                gtcrn: "gtcrn.onnx".into(),
            })
            .model_dir("/opt/models")
            .build()
            .unwrap();
        let resolved = resolve_qwen3_asr_config(&config).expect("should resolve");
        assert_eq!(resolved.model_paths.encoder, "/opt/models/encoder.int8.onnx");
        assert_eq!(resolved.model_paths.decoder, "/opt/models/decoder.int8.onnx");
        assert_eq!(resolved.model_paths.conv_frontend, "/opt/models/conv_frontend.onnx");
        assert_eq!(resolved.model_paths.tokenizer_dir, "/opt/models/tokenizer");
        assert_eq!(resolved.provider, "cpu");
        assert_eq!(resolved.num_threads, 2);
    }
}
