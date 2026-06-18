//! 設定構造体定義
//!
//! GpuProvider / GpuConfig / GgufConfig / ModelConfig / ServerConfig / ConfigLayer を定義する。
//!
//! # [::STUB::] M1-1, M1-2, M1-4 でメソッド・マージロジックを実装

use std::net::SocketAddr;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::consts::DEFAULT_RT_PORT;

/// GPU プロバイダーの種類
///
/// システムの GPU 環境に応じて推論バックエンドを選択するために使用する。
/// JSON config から指定可能にするため、`Serialize` / `Deserialize` を derive する。
/// `Auto` が先頭バリアントのため、`Default` は `Auto` を返す。
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub enum GpuProvider {
    /// 自動検出（デフォルト）
    ///
    /// 実行環境に応じて最適な GPU プロバイダーを自動選択する。
    /// 選択ロジックは M1-2 で実装する。
    #[default]
    Auto,

    /// Apple Metal（macOS）
    ///
    /// Apple Silicon / AMD GPU を Metal Performance Shaders 経由で利用する。
    /// mistralrs の metal feature と対応する。
    Metal,

    /// DirectML（Windows）
    ///
    /// Windows の DirectML バックエンド。
    /// 現在の mistralrs v0.8.1 では未対応だが、将来の拡張性のために定義する。
    DirectML,

    /// NVIDIA CUDA（Linux / Windows）
    ///
    /// NVIDIA GPU を CUDA 経由で利用する。
    /// mistralrs の cuda feature と対応する。
    Cuda,

    /// CPU のみ（全環境）
    ///
    /// GPU が利用できない環境や、CPU 推論を強制したい場合のフォールバック。
    Cpu,
}

/// GPU 設定
///
/// GpuProvider の選択に加え、CPU 強制モードを指定する。
/// JSON config での指定を前提とする。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GpuConfig {
    /// GPU プロバイダー
    ///
    /// 使用する GPU プロバイダーの種類。
    /// 未指定時は `Auto`（自動検出）となる。
    pub provider: GpuProvider,

    /// CPU 強制モード
    ///
    /// `true` の場合、GPU が利用可能な環境でも CPU 推論を使用する。
    /// デバッグや再現性が必要な場合に使用する。
    pub cpu_only: bool,
}

impl Default for GpuConfig {
    fn default() -> Self {
        Self {
            provider: GpuProvider::Auto,
            cpu_only: false,
        }
    }
}

/// モデル設定
///
/// GGUF モデル1つ分の設定を保持する。
/// JSON config からデシリアライズ可能。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModelConfig {
    /// モデル名
    ///
    /// レジストリ内でモデルを一意に識別する名前。
    /// `ModelRegistry` のキーとして使用する。
    pub name: String,

    /// モデルファイルのパス
    ///
    /// GGUF モデルファイル（.gguf）のファイルシステム上のパス。
    /// 絶対パスまたはプロジェクトルートからの相対パス。
    pub model_path: PathBuf,

    /// 遅延ロードフラグ
    ///
    /// `true` の場合、モデルは初回推論時にロードされる。
    /// `false` の場合、起動時にプリロードされる。
    #[serde(default)]
    pub lazy_load: bool,

    /// コンテキストサイズ（トークン数、省略可）
    ///
    /// このモデルに固有のコンテキストサイズ。
    /// `None` の場合は `DEFAULT_CONTEXT_SIZE` が使用される。
    pub context_size: Option<u32>,

    /// GPU オフロードレイヤー数（省略可）
    ///
    /// GPU にオフロードするレイヤーの数。
    /// `None` の場合は自動決定（全レイヤーオフロード）。
    pub gpu_layers: Option<u32>,

    /// バッチサイズ（省略可）
    ///
    /// 推論時のバッチサイズ。
    /// `None` の場合はモデルデフォルトが使用される。
    pub batch_size: Option<u32>,

    /// チャットテンプレート（省略可）
    ///
    /// このモデルに固有のチャットテンプレート。
    /// `None` の場合はモデルファイル内のテンプレートが使用される。
    pub chat_template: Option<String>,
}

/// サーバー設定
///
/// OpenAI / Anthropic 互換 HTTP サーバーの設定。
/// JSON config からデシリアライズ可能。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ServerConfig {
    /// バインドアドレス
    ///
    /// サーバーがリッスンする IP アドレスとポート。
    /// デフォルトは `127.0.0.1:DEFAULT_RT_PORT`。
    pub bind: SocketAddr,

    /// 起動時にロードするモデル名のリスト
    ///
    /// サーバー起動時に自動ロードされるモデルの名前リスト。
    /// 空の場合は手動ロードが必要。
    pub models: Vec<String>,

    /// サーバー自動起動フラグ
    ///
    /// `true` の場合、`GgufEngine::new()` でサーバーが自動起動する。
    /// `false` の場合、`start_server()` の明示的呼び出しが必要。
    pub auto_start_server: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            // SocketAddr は Default トレイトを実装しないため手動で構築する
            bind: SocketAddr::from(([127, 0, 0, 1], DEFAULT_RT_PORT)),
            models: Vec::new(),
            auto_start_server: false,
        }
    }
}

/// 統合設定
///
/// ggufrs crate の全設定を保持するトップレベル設定構造体。
/// モデル設定・サーバー設定・GPU 設定を統合する。
/// JSON config としてファイルまたは文字列から読み取り可能。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GgufConfig {
    /// モデル設定リスト
    ///
    /// ロードするモデルの設定。複数モデルを同時に管理可能。
    pub models: Vec<ModelConfig>,

    /// サーバー設定
    ///
    /// OpenAI / Anthropic 互換 HTTP サーバーの設定。
    pub server: ServerConfig,

    /// GPU 設定
    ///
    /// GPU プロバイダー選択と CPU 強制モード。
    pub gpu: GpuConfig,
}

/// 設定マージ層の種類
///
/// `GgufConfig::merge()` メソッドの引数として使用する。
/// 3層の設定ソース（コード内設定、JSON文字列、ファイルパス）を表現する。
/// 後方の層ほど優先度が高い。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConfigLayer {
    /// コード内設定（最下層）
    ///
    /// プログラム内で直接構築された設定。
    /// デフォルト値として使用され、上位層で上書き可能。
    Code(GgufConfig),

    /// JSON 文字列（中間層）
    ///
    /// JSON 形式の設定文字列。ファイルより簡便に指定可能。
    JsonStr(String),

    /// ファイルパス（最上位層）
    ///
    /// JSON 設定ファイルのパス。最も優先度が高い。
    File(PathBuf),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::consts::DEFAULT_RT_PORT;

    // ── GpuProvider tests (M0-3) ──

    #[test]
    fn gpu_provider_default_is_auto() {
        assert_eq!(GpuProvider::default(), GpuProvider::Auto);
    }

    #[test]
    fn gpu_provider_all_variants_roundtrip_json() {
        let variants = [
            GpuProvider::Auto,
            GpuProvider::Metal,
            GpuProvider::DirectML,
            GpuProvider::Cuda,
            GpuProvider::Cpu,
        ];
        for variant in variants {
            let json = serde_json::to_string(&variant).unwrap();
            let deserialized: GpuProvider = serde_json::from_str(&json).unwrap();
            assert_eq!(variant, deserialized, "roundtrip failed for {:?}", variant);
        }
    }

    #[test]
    fn gpu_provider_auto_serializes_to_auto() {
        let json = serde_json::to_string(&GpuProvider::Auto).unwrap();
        assert_eq!(json, "\"Auto\"");
    }

    #[test]
    fn gpu_provider_metal_serializes_to_metal() {
        let json = serde_json::to_string(&GpuProvider::Metal).unwrap();
        assert_eq!(json, "\"Metal\"");
    }

    #[test]
    fn gpu_provider_directml_serializes_to_directml() {
        let json = serde_json::to_string(&GpuProvider::DirectML).unwrap();
        assert_eq!(json, "\"DirectML\"");
    }

    #[test]
    fn gpu_provider_cuda_serializes_to_cuda() {
        let json = serde_json::to_string(&GpuProvider::Cuda).unwrap();
        assert_eq!(json, "\"Cuda\"");
    }

    #[test]
    fn gpu_provider_cpu_serializes_to_cpu() {
        let json = serde_json::to_string(&GpuProvider::Cpu).unwrap();
        assert_eq!(json, "\"Cpu\"");
    }

    #[test]
    fn gpu_provider_deserialize_invalid_variant() {
        let result: Result<GpuProvider, _> = serde_json::from_str("\"InvalidGPU\"");
        assert!(result.is_err(), "deserialization of invalid variant should fail");
    }

    #[test]
    fn gpu_config_default_returns_auto_and_cpu_only_false() {
        let config = GpuConfig::default();
        assert_eq!(config.provider, GpuProvider::Auto);
        assert!(!config.cpu_only, "cpu_only should default to false");
    }

    #[test]
    fn gpu_config_roundtrip_json() {
        let config = GpuConfig {
            provider: GpuProvider::Cuda,
            cpu_only: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: GpuConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, deserialized);
    }

    #[test]
    fn gpu_config_all_fields_serialize() {
        let config = GpuConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("provider"), "serialized JSON must contain 'provider'");
        assert!(json.contains("cpu_only"), "serialized JSON must contain 'cpu_only'");
    }

    // ── ModelConfig tests (M0-5) ──

    #[test]
    fn model_config_roundtrip_json() {
        let config = ModelConfig {
            name: "qwen3.5".into(),
            model_path: PathBuf::from("models/qwen3.5.gguf"),
            lazy_load: true,
            context_size: Some(16384),
            gpu_layers: Some(24),
            batch_size: Some(8),
            chat_template: Some("custom_template".into()),
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: ModelConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, deserialized);
    }

    #[test]
    fn model_config_default_lazy_load_is_false() {
        // serde のデフォルトでは bool は false になる
        let json = r#"{"name":"test","model_path":"test.gguf"}"#;
        let config: ModelConfig = serde_json::from_str(json).unwrap();
        assert!(!config.lazy_load, "lazy_load should default to false");
    }

    #[test]
    fn model_config_default_context_size_is_none() {
        let json = r#"{"name":"test","model_path":"test.gguf"}"#;
        let config: ModelConfig = serde_json::from_str(json).unwrap();
        assert!(config.context_size.is_none(), "context_size should default to None");
    }

    // ── ServerConfig tests (M0-5) ──

    #[test]
    fn server_config_default_uses_loopback_and_default_rt_port() {
        let config = ServerConfig::default();
        assert_eq!(
            config.bind,
            SocketAddr::from(([127, 0, 0, 1], DEFAULT_RT_PORT)),
            "bind should be 127.0.0.1:{}",
            DEFAULT_RT_PORT
        );
    }

    #[test]
    fn server_config_default_auto_start_is_false() {
        let config = ServerConfig::default();
        assert!(!config.auto_start_server, "auto_start_server should default to false");
    }

    #[test]
    fn server_config_roundtrip_json() {
        let config = ServerConfig {
            bind: SocketAddr::from(([0, 0, 0, 0], 8080)),
            models: vec!["qwen3.5".into(), "llama".into()],
            auto_start_server: true,
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: ServerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, deserialized);
    }

    // ── GgufConfig tests (M0-5) ──

    #[test]
    fn gguf_config_roundtrip_json() {
        let config = GgufConfig {
            models: vec![ModelConfig {
                name: "qwen3.5".into(),
                model_path: PathBuf::from("models/qwen3.5.gguf"),
                lazy_load: true,
                context_size: None,
                gpu_layers: None,
                batch_size: None,
                chat_template: None,
            }],
            server: ServerConfig::default(),
            gpu: GpuConfig::default(),
        };
        let json = serde_json::to_string(&config).unwrap();
        let deserialized: GgufConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config, deserialized);
    }

    // ── ConfigLayer tests (M0-5) ──

    #[test]
    fn config_layer_code_roundtrip_json() {
        let inner = GgufConfig {
            models: vec![],
            server: ServerConfig::default(),
            gpu: GpuConfig::default(),
        };
        let layer = ConfigLayer::Code(inner);
        let json = serde_json::to_string(&layer).unwrap();
        let deserialized: ConfigLayer = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, deserialized);
    }

    #[test]
    fn config_layer_json_str_roundtrip() {
        let layer = ConfigLayer::JsonStr(r#"{"models":[]}"#.into());
        let json = serde_json::to_string(&layer).unwrap();
        let deserialized: ConfigLayer = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, deserialized);
    }

    #[test]
    fn config_layer_file_roundtrip() {
        let layer = ConfigLayer::File(PathBuf::from("config.json"));
        let json = serde_json::to_string(&layer).unwrap();
        let deserialized: ConfigLayer = serde_json::from_str(&json).unwrap();
        assert_eq!(layer, deserialized);
    }
}
