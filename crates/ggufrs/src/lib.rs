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

use tokio::task::{AbortHandle, JoinHandle};

// モジュール宣言（以降のチケットで実装を追加する）
pub mod config;
pub mod consts;
pub mod error;

pub mod inference;
pub mod registry;

pub mod server;

// mistralrs の主要型を crate 利用者に公開する
// ggufrs のみを依存関係に追加すれば mistralrs の型も利用可能
pub use mistralrs::{
    ChatCompletionResponse, Constraint, Model, RequestBuilder, Response, SamplingParams,
    TextMessageRole, TextMessages,
};

// ggufrs の公開型（crate ルートから利用可能）
pub use config::{ConfigLayer, GgufConfig, GpuConfig, GpuProvider, ModelConfig, ServerConfig};
pub use error::GgufError;
pub use inference::{GenerateParams, InferenceEngine};
pub use registry::{ModelInfo, ModelRegistry};

/// GGUF 推論エンジン
///
/// ggufrs crate のエントリポイント。モデル管理と推論実行の統合インターフェースを提供する。
/// `GgufEngine::new()` で初期化し、設定に基づいて ModelRegistry を構築する。
///
/// # フィールド
/// - `registry`: モデル一元管理（スレッドセーフに共有可能）
/// - `server_handle`: HTTP サーバーの AbortHandle（未起動時は None）
pub struct GgufEngine {
    /// モデルレジストリ
    ///
    /// 設定された全モデルの情報とインスタンスを管理する。
    /// `Arc` により `InferenceEngine` 実装からも参照可能。
    pub registry: Arc<registry::ModelRegistry>,

    /// HTTP サーバーのタスクハンドル
    ///
    /// サーバー起動時に `start_server()` がセットする `AbortHandle`。
    /// 未起動時は `None`。`Mutex` によりスレッドセーフにアクセス可能。
    /// `AbortHandle` は `Clone` 可能なため、`JoinHandle` と異なり
    /// 内部保存と外部返却を両立できる。
    pub(crate) server_handle: Mutex<Option<AbortHandle>>,
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

    /// HTTP サーバーを起動する
    ///
    /// `build_router()` で Axum Router を構築し、指定されたアドレスで HTTP サーバーを開始する。
    /// `self: Arc<Self>` を要求するのは、`build_router()` が内部で
    /// `Arc<dyn InferenceEngine>` を必要とするため。
    ///
    /// # 引数
    /// - `config`: サーバー設定（バインドアドレス・モデル一覧）
    ///
    /// # 戻り値
    /// - `Ok(JoinHandle)`: サーバータスクのハンドル（呼び出し元が死活監視・abort可能）
    /// - `Err(GgufError::ServerStartupFailed)`: バインドまたはサーバー起動の失敗
    pub async fn start_server(
        self: Arc<Self>,
        config: config::ServerConfig,
    ) -> Result<JoinHandle<Result<(), crate::error::GgufError>>, crate::error::GgufError> {
        let bind = config.bind;
        // build_router で使用するため、self をクローンしてから tokio::spawn に渡す
        let engine_for_server = Arc::clone(&self);
        let handle = tokio::spawn(async move {
            let app = crate::server::build_router(engine_for_server);
            let listener = tokio::net::TcpListener::bind(bind)
                .await
                .map_err(|e| GgufError::ServerStartupFailed(Box::new(e)))?;
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown_signal())
                .await
                .map_err(|e| GgufError::ServerStartupFailed(Box::new(e)))?;
            Ok(())
        });
        // AbortHandle を内部保存し、Drop 時にサーバータスクを abort 可能にする
        // Mutex ロック失敗（poisoning）はログに記録して無視する
        if let Ok(mut guard) = self.server_handle.lock() {
            *guard = Some(handle.abort_handle());
        } else {
            tracing::warn!("server_handle mutex poisoned, cannot store AbortHandle");
        }
        Ok(handle)
    }

    /// 設定から GgufEngine を初期化し、必要に応じてサーバーを自動起動する
    ///
    /// `config.server.auto_start_server` が `true` の場合、
    /// バックグラウンドで HTTP サーバーを自動起動する。
    /// エンジンは `Arc<Self>` でラップされて返るため、
    /// `InferenceEngine` としてスレッドセーフに共有可能。
    ///
    /// # 引数
    /// - `config`: エンジン設定（サーバーの自動起動設定を含む）
    ///
    /// # エラー
    /// - `GgufError::ModelLoadFailed`: モデルの即時ロードに失敗した場合
    pub async fn new_with_auto_start(
        config: config::GgufConfig,
    ) -> Result<Arc<Self>, crate::error::GgufError> {
        let engine = Arc::new(GgufEngine::new(config.clone()).await?);
        if config.server.auto_start_server {
            let eng = engine.clone();
            tokio::spawn(async move {
                let _ = eng.start_server(config.server.clone()).await;
            });
        }
        Ok(engine)
    }
}

/// GgufEngine の Drop 実装
///
/// サーバーが起動中の場合は `JoinHandle::abort()` を呼び出して
/// サーバータスクを強制終了する。これによりリソースリークを防止する。
impl Drop for GgufEngine {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.server_handle.lock() {
            if let Some(abort_handle) = guard.take() {
                abort_handle.abort();
            }
        }
    }
}

/// シャットダウン信号を待機する
///
/// Ctrl+C と SIGTERM（Unix のみ）の2系統のシグナルを待機し、
/// いずれかを受信した時点で graceful shutdown をトリガーする。
/// シグナルハンドラのインストールに失敗した場合は警告をログに記録し、
/// graceful shutdown なしでサーバーを継続する（サーバー自体は正常動作）。
async fn shutdown_signal() {
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::warn!("failed to install Ctrl+C handler: {e}");
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(e) => {
                tracing::warn!("failed to install SIGTERM handler: {e}");
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
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
        }]);
        let engine = GgufEngine::new(config).await;
        assert!(
            engine.is_ok(),
            "GgufEngine::new should succeed with valid config"
        );
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
        assert!(
            models.is_empty(),
            "empty config should result in empty registry"
        );
    }

    // ── Drop テスト ──

    #[tokio::test]
    async fn drop_without_server_does_not_panic() {
        let engine = GgufEngine::new(GgufConfig::from_code(vec![]))
            .await
            .unwrap();
        // server_handle は None のまま → Drop は abort しない
        drop(engine);
        // パニックしないこと（到達すれば合格）
    }

    #[tokio::test]
    async fn drop_with_server_handle_aborts_task() {
        let engine = GgufEngine::new(GgufConfig::from_code(vec![]))
            .await
            .unwrap();

        // 無限スリープするダミータスクを作成し、AbortHandle を注入する
        let handle = tokio::spawn(async {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
            }
        });
        let abort_handle = handle.abort_handle();
        *engine.server_handle.lock().unwrap() = Some(abort_handle);

        // engine を Drop → abort が呼ばれる
        drop(engine);

        // abort されたタスクは JoinError::is_cancelled() で検出できる
        let result = handle.await;
        assert!(
            result.is_err() && result.unwrap_err().is_cancelled(),
            "Drop should abort the server task"
        );
    }

    // ── new_with_auto_start テスト ──

    #[tokio::test]
    async fn new_with_auto_start_false_does_not_start_server() {
        let config = GgufConfig {
            models: vec![],
            server: crate::config::ServerConfig {
                bind: "127.0.0.1:0".parse().unwrap(),
                models: vec![],
                auto_start_server: false,
            },
            gpu: crate::config::GpuConfig {
                provider: crate::config::GpuProvider::Cpu,
                cpu_only: true,
            },
        };
        let engine = GgufEngine::new_with_auto_start(config).await.unwrap();
        // server_handle は None（サーバー未起動）
        let guard = engine.server_handle.lock().unwrap();
        assert!(guard.is_none(), "server should not be started");
    }

    #[tokio::test]
    async fn new_with_auto_start_true_returns_arc_self() {
        let config = GgufConfig {
            models: vec![],
            server: crate::config::ServerConfig {
                bind: "127.0.0.1:0".parse().unwrap(),
                models: vec![],
                auto_start_server: true,
            },
            gpu: crate::config::GpuConfig {
                provider: crate::config::GpuProvider::Cpu,
                cpu_only: true,
            },
        };
        let engine = GgufEngine::new_with_auto_start(config).await;
        // auto_start_server=true でもエラーなく Arc<Self> が返る
        assert!(engine.is_ok(), "new_with_auto_start should succeed");
    }

    // ── shutdown_signal 存在確認 ──

    #[test]
    fn shutdown_signal_is_callable() {
        // コンパイル可能であることの確認（関数参照が取得できる）
        let _sig: fn() -> _ = shutdown_signal;
    }
}
