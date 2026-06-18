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

impl GpuProvider {
    /// 環境変数または OS から GPU プロバイダーを検出する
    ///
    /// 1. `GGUFRS_GPU_PROVIDER` 環境変数が設定されていれば、その値を使用する
    /// 2. 環境変数が未設定なら、実行中の OS から自動検出する:
    ///    - macOS → Metal
    ///    - Windows → DirectML（将来拡張）
    ///    - その他 → Cpu
    pub fn detect() -> Self {
        let env_var = crate::consts::GPU_PROVIDER_ENV_VAR;
        if let Ok(val) = std::env::var(env_var) {
            if let Some(provider) = Self::from_str(&val) {
                return provider;
            }
        }
        #[cfg(target_os = "macos")]
        {
            return Self::Metal;
        }
        #[cfg(target_os = "windows")]
        {
            return Self::DirectML;
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Self::Cpu
        }
    }

    /// 文字列から GPU プロバイダーをパースする
    ///
    /// 大文字小文字を区別しない。未知の値には `None` を返す。
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "metal" => Some(Self::Metal),
            "directml" => Some(Self::DirectML),
            "cuda" => Some(Self::Cuda),
            "cpu" => Some(Self::Cpu),
            _ => None,
        }
    }

    /// mistralrs の feature flag 名を返す
    ///
    /// Cpu および Auto の場合は空文字列（CPU-only ビルドで対応）。
    /// Metal / Cuda は対応する mistralrs feature 名を返す。
    /// DirectML は mistralrs v0.8.1 で未対応のため空文字列。
    pub fn mistralrs_feature(&self) -> &'static str {
        match self {
            Self::Metal => "metal",
            Self::Cuda => "cuda",
            Self::Auto | Self::Cpu | Self::DirectML => "",
        }
    }
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

impl ModelConfig {
    /// Qwen3.5-0.8B モデルの設定を返す
    ///
    /// ビルトインモデルとして同梱される軽量 GGUF モデル。
    /// メモリ使用量が少なく、ローカル開発や簡易検証に適する。
    /// context_size は Qwen3.5 シリーズの最大値 32768 に設定。
    pub fn qwen3_5_0_8b() -> Self {
        Self {
            name: "qwen3.5-0.8b".into(),
            model_path: PathBuf::from("models/Qwen3.5-0.8B-Q4_K_M.gguf"),
            lazy_load: true,
            context_size: Some(32768),
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }
    }

    /// Qwen3.5-2B モデルの設定を返す
    ///
    /// ビルトインモデルとして同梱される標準 GGUF モデル。
    /// 0.8B より高品質な出力が期待できる。
    /// context_size は Qwen3.5 シリーズの最大値 32768 に設定。
    pub fn qwen3_5_2b() -> Self {
        Self {
            name: "qwen3.5-2b".into(),
            model_path: PathBuf::from("models/Qwen3.5-2B-Q4_K_M.gguf"),
            lazy_load: true,
            context_size: Some(32768),
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }
    }

    /// カスタムモデルの設定を返す
    ///
    /// crate 利用者が任意の mistralrs 対応 GGUF モデルを設定するための汎用コンストラクタ。
    /// モデル名とファイルパスのみ必須で、その他のオプションフィールドは全て `None` に設定される。
    pub fn custom(name: impl Into<String>, path: impl Into<PathBuf>) -> Self {
        Self {
            name: name.into(),
            model_path: path.into(),
            lazy_load: true,
            context_size: None,
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }
    }
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

    // ── GpuProvider method tests (M1-2) ──

    #[test]
    fn from_str_lowercase_metal() {
        assert_eq!(GpuProvider::from_str("metal"), Some(GpuProvider::Metal));
    }

    #[test]
    fn from_str_uppercase_metal() {
        assert_eq!(GpuProvider::from_str("METAL"), Some(GpuProvider::Metal));
    }

    #[test]
    fn from_str_mixed_case_cuda() {
        assert_eq!(GpuProvider::from_str("CuDa"), Some(GpuProvider::Cuda));
    }

    #[test]
    fn from_str_cpu() {
        assert_eq!(GpuProvider::from_str("cpu"), Some(GpuProvider::Cpu));
    }

    #[test]
    fn from_str_auto() {
        assert_eq!(GpuProvider::from_str("auto"), Some(GpuProvider::Auto));
    }

    #[test]
    fn from_str_unknown_returns_none() {
        assert_eq!(GpuProvider::from_str("unknown"), None);
    }

    #[test]
    fn from_str_empty_returns_none() {
        assert_eq!(GpuProvider::from_str(""), None);
    }

    #[test]
    fn mistralrs_feature_metal() {
        assert_eq!(GpuProvider::Metal.mistralrs_feature(), "metal");
    }

    #[test]
    fn mistralrs_feature_cuda() {
        assert_eq!(GpuProvider::Cuda.mistralrs_feature(), "cuda");
    }

    #[test]
    fn mistralrs_feature_cpu_auto_empty() {
        assert_eq!(GpuProvider::Cpu.mistralrs_feature(), "");
        assert_eq!(GpuProvider::Auto.mistralrs_feature(), "");
    }

    #[test]
    fn mistralrs_feature_directml_empty() {
        assert_eq!(GpuProvider::DirectML.mistralrs_feature(), "");
    }

    #[test]
    fn detect_respects_env_var() {
        let env_var = crate::consts::GPU_PROVIDER_ENV_VAR;
        // 環境変数を一時的に設定して detect() が正しく値を読み取ることを確認
        std::env::set_var(env_var, "cuda");
        let detected = GpuProvider::detect();
        std::env::remove_var(env_var);
        assert_eq!(detected, GpuProvider::Cuda);
    }

    #[test]
    fn detect_auto_on_unset_on_linux_or_other() {
        // 並列実行される detect_respects_env_var が設定した環境変数の影響を
        // 受けないよう、既知の無効値で上書きしてから detect() を呼び出す
        let env_var = crate::consts::GPU_PROVIDER_ENV_VAR;
        std::env::set_var(env_var, "__no_such_provider__");
        let detected = GpuProvider::detect();
        std::env::remove_var(env_var);
        #[cfg(target_os = "macos")]
        assert_eq!(detected, GpuProvider::Metal);
        #[cfg(not(target_os = "macos"))]
        assert_eq!(detected, GpuProvider::Cpu);
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

    // ── ModelConfig constructor tests (M1-1) ──

    #[test]
    fn qwen3_5_0_8b_has_correct_name() {
        let config = ModelConfig::qwen3_5_0_8b();
        assert_eq!(config.name, "qwen3.5-0.8b");
    }

    #[test]
    fn qwen3_5_0_8b_has_correct_context_size() {
        let config = ModelConfig::qwen3_5_0_8b();
        assert_eq!(config.context_size, Some(32768));
    }

    #[test]
    fn qwen3_5_0_8b_lazy_load_is_true() {
        let config = ModelConfig::qwen3_5_0_8b();
        assert!(config.lazy_load);
    }

    #[test]
    fn qwen3_5_2b_has_correct_name() {
        let config = ModelConfig::qwen3_5_2b();
        assert_eq!(config.name, "qwen3.5-2b");
    }

    #[test]
    fn qwen3_5_2b_has_correct_context_size() {
        let config = ModelConfig::qwen3_5_2b();
        assert_eq!(config.context_size, Some(32768));
    }

    #[test]
    fn qwen3_5_2b_lazy_load_is_true() {
        let config = ModelConfig::qwen3_5_2b();
        assert!(config.lazy_load);
    }

    #[test]
    fn custom_uses_given_name_and_path() {
        let config = ModelConfig::custom("my-model", "my/path.gguf");
        assert_eq!(config.name, "my-model");
        assert_eq!(config.model_path, PathBuf::from("my/path.gguf"));
    }

    #[test]
    fn custom_optional_fields_are_none() {
        let config = ModelConfig::custom("test", "test.gguf");
        assert!(config.context_size.is_none());
        assert!(config.gpu_layers.is_none());
        assert!(config.batch_size.is_none());
        assert!(config.chat_template.is_none());
    }

    #[test]
    fn custom_lazy_load_is_true() {
        let config = ModelConfig::custom("test", "test.gguf");
        assert!(config.lazy_load);
    }

    #[test]
    fn qwen3_5_0_8b_is_idempotent() {
        let first = ModelConfig::qwen3_5_0_8b();
        let second = ModelConfig::qwen3_5_0_8b();
        assert_eq!(first.name, second.name);
        assert_eq!(first.model_path, second.model_path);
        assert_eq!(first.lazy_load, second.lazy_load);
        assert_eq!(first.context_size, second.context_size);
        assert_eq!(first.gpu_layers, second.gpu_layers);
        assert_eq!(first.batch_size, second.batch_size);
        assert_eq!(first.chat_template, second.chat_template);
    }

    #[test]
    fn qwen3_5_2b_is_idempotent() {
        let first = ModelConfig::qwen3_5_2b();
        let second = ModelConfig::qwen3_5_2b();
        assert_eq!(first.name, second.name);
        assert_eq!(first.model_path, second.model_path);
        assert_eq!(first.lazy_load, second.lazy_load);
        assert_eq!(first.context_size, second.context_size);
        assert_eq!(first.gpu_layers, second.gpu_layers);
        assert_eq!(first.batch_size, second.batch_size);
        assert_eq!(first.chat_template, second.chat_template);
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
