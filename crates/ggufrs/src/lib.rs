//! # ggufrs — Rust による GGUF モデル推論エンジン
//!
//! mistralrs をバックエンドとして GGUF 形式の量子化言語モデルを推論実行するクレート。
//! 同一プロセス内でライブラリ API（直接推論）と OpenAI/Anthropic 互換 HTTP サーバーの両方を提供し、
//! ロードされたモデルインスタンスはスレッドセーフに共有される。
//!
//! ## モジュール構成
//!
//! - `consts` — 静的定数定義（ポート番号・デフォルトパス・タイムアウト）
//! - `error` — GgufError エラー型
//! - `config` — GgufConfig / ModelConfig / ServerConfig / GpuConfig 設定構造体
//! - `registry` — ModelRegistry モデル一元管理
//! - `inference` — InferenceEngine トレイト定義と実装
//! - `server` — Axum ルーター + OpenAI/Anthropic 互換エンドポイント

use std::sync::{Arc, Mutex};

use tokio::task::JoinHandle;

// モジュール宣言（以降のチケットで実装を追加する）
pub mod config;
pub mod consts;
pub mod error;

// [::STUB::] M2-1 で InferenceEngine トレイトを実装
pub mod inference;

// [::STUB::] M2-2 で ModelRegistry を実装
pub mod registry;

// [::STUB::] M4-1 で server モジュールを実装
pub mod server;

// [::STUB::] M3-5 で以下の pub use を実際の型に差し替える
// pub use mistralrs::{
//     Model, RequestBuilder, TextMessages, TextMessageRole,
//     Constraint, ChatCompletionResponse,
//     IsqBits,
// };

/// GGUF 推論エンジン
///
/// ggufrs crate のエントリポイント。モデル管理と推論実行の統合インターフェースを提供する。
/// `GgufEngine::new()` で初期化し、設定に基づいて ModelRegistry を構築する。
///
/// # フィールド
/// - `registry`: モデル一元管理（スレッドセーフに共有可能）
/// - `server_handle`: HTTP サーバーのタスクハンドル（未起動時は None）
pub struct GgufEngine {
    /// モデルレジストリ
    ///
    /// 設定された全モデルの情報とインスタンスを管理する。
    /// `Arc` により `InferenceEngine` 実装からも参照可能。
    pub registry: Arc<registry::ModelRegistry>,

    /// HTTP サーバーのタスクハンドル
    ///
    /// サーバー起動時に `start_server()` がセットする。
    /// 未起動時は `None`。`Mutex` によりスレッドセーフにアクセス可能。
    ///
    /// [::STUB::] M4-2 で start_server() 実装時に使用
    #[allow(dead_code)]
    pub(crate) server_handle: Mutex<Option<JoinHandle<Result<(), crate::error::GgufError>>>>,
}

impl GgufEngine {
    /// 設定から GgufEngine を初期化する
    ///
    /// 1. `ModelRegistry::from_config()` でモデル設定を登録
    /// 2. `load_immediate()` で lazy_load=false のモデルをプリロード
    ///
    /// # 引数
    /// - `config`: エンジン設定（モデル・サーバー・GPU 設定を含む）
    ///
    /// # エラー
    /// - `GgufError::ModelLoadFailed`: 即時ロードに失敗した場合
    pub async fn new(config: config::GgufConfig) -> Result<Self, crate::error::GgufError> {
        let registry = Arc::new(registry::ModelRegistry::from_config(config.models));
        // lazy_load=false のモデルをプリロード
        registry.load_immediate().await?;
        Ok(Self {
            registry,
            server_handle: Mutex::new(None),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{GgufConfig, ModelConfig};
    use std::path::PathBuf;

    #[tokio::test]
    async fn gguf_engine_new_initializes_successfully() {
        let config = GgufConfig::from_code(vec![ModelConfig {
            name: "test".into(),
            model_path: PathBuf::from("test.gguf"),
            lazy_load: true,
            context_size: None,
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }]);
        let engine = GgufEngine::new(config).await;
        assert!(engine.is_ok(), "GgufEngine::new should succeed with valid config");
    }

    #[tokio::test]
    async fn gguf_engine_new_returns_models_in_list() {
        let config = GgufConfig::from_code(vec![ModelConfig {
            name: "model_a".into(),
            model_path: PathBuf::from("a.gguf"),
            lazy_load: true,
            context_size: None,
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }]);
        let engine = GgufEngine::new(config).await.unwrap();
        let models = engine.registry.list_models();
        assert_eq!(models, vec!["model_a"]);
    }

    #[tokio::test]
    async fn gguf_engine_new_empty_config_creates_empty_registry() {
        let config = GgufConfig::from_code(vec![]);
        let engine = GgufEngine::new(config).await.unwrap();
        let models = engine.registry.list_models();
        assert!(models.is_empty(), "empty config should result in empty registry");
    }
}
