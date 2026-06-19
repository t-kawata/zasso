//! 設定構造体定義
//!
//! GpuProvider / GpuConfig / GgufConfig / ModelConfig / ServerConfig / ConfigLayer を定義する。
//!

use std::net::SocketAddr;
use std::path::Path;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::error::GgufError;

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
    /// llama-cpp-2 の metal feature と対応する。
    Metal,


    /// NVIDIA CUDA（Linux / Windows）
    ///
    /// NVIDIA GPU を CUDA 経由で利用する。
    /// llama-cpp-2 の cuda feature と対応する。
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
    ///    - Windows → Cpu
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
            Self::Metal
        }
        #[cfg(target_os = "windows")]
        {
            Self::Cpu
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            Self::Cpu
        }
    }

    /// 文字列から GPU プロバイダーをパースする
    ///
    /// 大文字小文字を区別しない。未知の値には `None` を返す。
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "metal" => Some(Self::Metal),
            "cuda" => Some(Self::Cuda),
            "cpu" => Some(Self::Cpu),
            _ => None,
        }
    }

    /// 対応する cargo feature 名を返す
    ///
    /// build.rs はこの値をもとに cmake フラグを設定する。
    pub fn feature_name(&self) -> &'static str {
        match self {
            Self::Metal => "metal",
            Self::Cuda => "cuda",
            Self::Cpu | Self::Auto => "cpu",
        }
    }

    /// 対応する cmake フラグ名と値を返す
    ///
    /// build.rs で LLAMA_METAL=ON / LLAMA_CUDA=ON の設定に使用する。
    /// CPU および Auto の場合は空のベクタを返す（cmake フラグ不要）。
    pub fn cmake_flags(&self) -> Vec<(&'static str, &'static str)> {
        match self {
            Self::Metal => vec![("LLAMA_METAL", "ON")],
            Self::Cuda => vec![("LLAMA_CUDA", "ON")],
            Self::Cpu | Self::Auto => vec![],
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
        }
    }

    /// Gemma4 E2B モデルの設定を返す
    ///
    /// mistralrs v0.8.1 でサポートが確認された Gemma4 E2B（≈3.1GB）UQFF モデル。
    /// Qwen3.5 非互換問題の代替として使用する。
    /// context_size は ASR 補正タスクに最適化した 2048 に固定。
    ///
    /// ## 高速化の設計判断
    /// - `context_size: Some(2048)`: ASR 補正タスク（入出力 60-90 トークン）では
    ///   128k フルコンテキストは不要。2k に制限することで prefill コストを削減する。
    ///   参照: `docs/mistralrs-gemma4-e2b-e4b/INFO.md`
    pub fn gemma4_e2b() -> Self {
        Self {
            name: "gemma4-e2b".into(),
            model_path: PathBuf::from("models/gemma4-e2b-uqff/q4k-0.uqff"),
            lazy_load: true,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
        }
    }

    /// Gemma4 E4B モデルの設定を返す
    ///
    /// mistralrs v0.8.1 でサポートが確認された Gemma4 E4B（≈5.0GB）UQFF モデル。
    /// E2B より高精度だが、より多くのメモリと推論時間を要する。
    /// context_size は E2B 同様 2048 に固定。
    pub fn gemma4_e4b() -> Self {
        Self {
            name: "gemma4-e4b".into(),
            model_path: PathBuf::from("models/gemma4-e4b-uqff/q4k-0.uqff"),
            lazy_load: true,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
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

impl GgufConfig {
    /// コード内設定から GgufConfig を生成する（最下層）
    ///
    /// サーバー設定と GPU 設定はそれぞれの Default 値で初期化される。
    /// このコンストラクタで生成された設定は、ConfigLayer::JsonStr や
    /// ConfigLayer::File からマージされることで上書き可能となる。
    pub fn from_code(models: Vec<ModelConfig>) -> Self {
        Self {
            models,
            server: ServerConfig::default(),
            gpu: GpuConfig::default(),
        }
    }

    /// 上位優先度の設定を自身にマージする（内部ヘルパー）
    ///
    /// - models: `name` フィールドをキーにマージ。同名モデルは上書き、新規モデルは追加
    /// - server: `bind.port() != 0` の場合のみ上書き（port=0 は「未指定」を意味する）
    /// - gpu: `provider != GpuProvider::Auto` の場合のみ上書き（Auto は「未指定」）
    ///
    pub(crate) fn merge_overlay(&mut self, overlay: GgufConfig) {
        // models: name ベースマージ
        for overlay_model in overlay.models {
            if let Some(existing) = self
                .models
                .iter_mut()
                .find(|m| m.name == overlay_model.name)
            {
                *existing = overlay_model;
            } else {
                self.models.push(overlay_model);
            }
        }

        // server: bind.port() != 0 の場合のみ上書き
        if overlay.server.bind.port() != 0 {
            self.server = overlay.server;
        } else if !overlay.server.models.is_empty() {
            // bind が未指定でも models リストが指定されていれば反映する
            self.server.models = overlay.server.models;
        }

        // gpu: provider != Auto の場合のみ上書き
        if overlay.gpu.provider != GpuProvider::Auto {
            self.gpu = overlay.gpu;
        }
    }

    /// JSON 文字列から設定をパースしてマージする（中間層）
    ///
    /// `serde_json::from_str` でパースし、`merge_overlay` でベース設定にマージする。
    /// パース失敗時は `GgufError::InvalidConfig` を返す。
    pub fn from_json_str(json: &str, mut base: Self) -> Result<Self, GgufError> {
        let overlay: GgufConfig = serde_json::from_str(json)?;
        base.merge_overlay(overlay);
        Ok(base)
    }

    /// ファイルから設定を読み込んでマージする（最上位層）
    ///
    /// `std::fs::read_to_string` で読み取り、`serde_json::from_str` でパースし、
    /// `merge_overlay` でベース設定にマージする。
    /// ファイル不存在・読み取り失敗時は `GgufError::InvalidConfig` を返す。
    pub fn from_file(path: &Path, base: Self) -> Result<Self, GgufError> {
        let content = std::fs::read_to_string(path)?;
        Self::from_json_str(&content, base)
    }

    /// 3層（コード設定 → 埋め込みJSON → ファイルJSON）を順次マージする
    ///
    /// 優先順位（低→高）:
    /// 1. `code` — コード内設定（最下層）
    /// 2. `json` — `Some` の場合、埋め込みJSON文字列（中間層）
    /// 3. `file` — `Some` の場合、ファイルJSON（最上位層）
    ///
    /// 各層が `None` の場合はスキップされる。
    /// ファイル不存在・JSON不正の場合はエラーを返す。
    pub fn build(code: Self, json: Option<&str>, file: Option<&Path>) -> Result<Self, GgufError> {
        let mut result = code;
        if let Some(json_str) = json {
            result = Self::from_json_str(json_str, result)?;
        }
        if let Some(file_path) = file {
            result = Self::from_file(file_path, result)?;
        }
        Ok(result)
    }

    /// 任意の数の `ConfigLayer` を順次マージする
    ///
    /// 各レイヤーは以下のように処理される:
    /// - `ConfigLayer::Code` → ベースとして直接使用（その時点での最下層）
    /// - `ConfigLayer::JsonStr` → JSON パース後、現在のベースにマージ
    /// - `ConfigLayer::File` → ファイル読み取り + JSON パース後、現在のベースにマージ
    ///
    /// 空のベクタが渡された場合は、デフォルト設定を返す。
    /// 最初のレイヤーが Code でない場合、空のコード設定をベースとして使用する。
    pub fn merge(layers: Vec<ConfigLayer>) -> Result<Self, GgufError> {
        let mut result: Option<Self> = None;
        for layer in layers {
            match layer {
                ConfigLayer::Code(cfg) => {
                    result = Some(cfg);
                }
                ConfigLayer::JsonStr(json) => {
                    let base = result.take().unwrap_or(GgufConfig::from_code(vec![]));
                    result = Some(Self::from_json_str(&json, base)?);
                }
                ConfigLayer::File(path) => {
                    let base = result.take().unwrap_or(GgufConfig::from_code(vec![]));
                    result = Some(Self::from_file(&path, base)?);
                }
            }
        }
        Ok(result.unwrap_or(GgufConfig::from_code(vec![])))
    }
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
        assert!(
            result.is_err(),
            "deserialization of invalid variant should fail"
        );
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
        assert!(
            json.contains("provider"),
            "serialized JSON must contain 'provider'"
        );
        assert!(
            json.contains("cpu_only"),
            "serialized JSON must contain 'cpu_only'"
        );
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
    fn feature_name_metal() {
        assert_eq!(GpuProvider::Metal.feature_name(), "metal");
    }

    #[test]
    fn feature_name_cuda() {
        assert_eq!(GpuProvider::Cuda.feature_name(), "cuda");
    }

    #[test]
    fn feature_name_cpu_auto() {
        assert_eq!(GpuProvider::Cpu.feature_name(), "cpu");
        assert_eq!(GpuProvider::Auto.feature_name(), "cpu");
    }

    #[test]
    fn cmake_flags_metal() {
        assert_eq!(
            GpuProvider::Metal.cmake_flags(),
            vec![("LLAMA_METAL", "ON")]
        );
    }

    #[test]
    fn cmake_flags_cuda() {
        assert_eq!(
            GpuProvider::Cuda.cmake_flags(),
            vec![("LLAMA_CUDA", "ON")]
        );
    }

    #[test]
    fn cmake_flags_cpu_auto() {
        assert!(GpuProvider::Cpu.cmake_flags().is_empty());
        assert!(GpuProvider::Auto.cmake_flags().is_empty());
    }

    #[test]
    fn detect_stress_env_var_and_os_fallback() {
        // detect() はグローバルな環境変数を読むため、並列テストと競合する。
        // この1テスト内で env var あり/なし の両方を直列に検証する。
        let env_var = crate::consts::GPU_PROVIDER_ENV_VAR;

        // 1) 環境変数設定時 → その値が優先される
        std::env::set_var(env_var, "cuda");
        let detected = GpuProvider::detect();
        std::env::remove_var(env_var);
        assert_eq!(
            detected,
            GpuProvider::Cuda,
            "env var should override OS detection"
        );

        // 2) 環境変数未設定時 → OS 自動検出
        let detected = GpuProvider::detect();
        #[cfg(target_os = "macos")]
        assert_eq!(
            detected,
            GpuProvider::Metal,
            "macOS should default to Metal"
        );
        #[cfg(not(target_os = "macos"))]
        assert_eq!(
            detected,
            GpuProvider::Cpu,
            "non-macOS should default to Cpu"
        );
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
        assert!(
            config.context_size.is_none(),
            "context_size should default to None"
        );
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
    }

    #[test]
    fn custom_lazy_load_is_true() {
        let config = ModelConfig::custom("test", "test.gguf");
        assert!(config.lazy_load);
    }

    // ── Gemma4 ModelConfig tests (M5-2.1) ──

    #[test]
    fn gemma4_e2b_has_correct_name() {
        let config = ModelConfig::gemma4_e2b();
        assert_eq!(config.name, "gemma4-e2b");
    }

    #[test]
    fn gemma4_e2b_has_correct_context_size() {
        let config = ModelConfig::gemma4_e2b();
        assert_eq!(config.context_size, Some(2048));
    }

    #[test]
    fn gemma4_e2b_lazy_load_is_true() {
        let config = ModelConfig::gemma4_e2b();
        assert!(config.lazy_load);
    }

    #[test]
    fn gemma4_e2b_optional_fields_are_none() {
        let config = ModelConfig::gemma4_e2b();
        assert!(config.gpu_layers.is_none());
        assert!(config.batch_size.is_none());
    }

    #[test]
    fn gemma4_e2b_is_idempotent() {
        let first = ModelConfig::gemma4_e2b();
        let second = ModelConfig::gemma4_e2b();
        assert_eq!(first.name, second.name);
        assert_eq!(first.model_path, second.model_path);
        assert_eq!(first.lazy_load, second.lazy_load);
        assert_eq!(first.context_size, second.context_size);
        assert_eq!(first.gpu_layers, second.gpu_layers);
        assert_eq!(first.batch_size, second.batch_size);
    }

    #[test]
    fn gemma4_e4b_has_correct_name() {
        let config = ModelConfig::gemma4_e4b();
        assert_eq!(config.name, "gemma4-e4b");
    }

    #[test]
    fn gemma4_e4b_has_correct_context_size() {
        let config = ModelConfig::gemma4_e4b();
        assert_eq!(config.context_size, Some(2048));
    }

    #[test]
    fn gemma4_e4b_lazy_load_is_true() {
        let config = ModelConfig::gemma4_e4b();
        assert!(config.lazy_load);
    }

    #[test]
    fn gemma4_e4b_optional_fields_are_none() {
        let config = ModelConfig::gemma4_e4b();
        assert!(config.gpu_layers.is_none());
        assert!(config.batch_size.is_none());
    }

    #[test]
    fn gemma4_e4b_is_idempotent() {
        let first = ModelConfig::gemma4_e4b();
        let second = ModelConfig::gemma4_e4b();
        assert_eq!(first.name, second.name);
        assert_eq!(first.model_path, second.model_path);
        assert_eq!(first.lazy_load, second.lazy_load);
        assert_eq!(first.context_size, second.context_size);
        assert_eq!(first.gpu_layers, second.gpu_layers);
        assert_eq!(first.batch_size, second.batch_size);
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
        assert!(
            !config.auto_start_server,
            "auto_start_server should default to false"
        );
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

    // ── GgufConfig merge tests (M1-4) ──

    fn sample_model(name: &str) -> ModelConfig {
        ModelConfig {
            name: name.into(),
            model_path: PathBuf::from(format!("models/{name}.gguf")),
            lazy_load: true,
            context_size: None,
            gpu_layers: None,
            batch_size: None,
        }
    }

    #[test]
    fn from_code_uses_default_server_and_gpu() {
        let config = GgufConfig::from_code(vec![]);
        assert_eq!(config.server, ServerConfig::default());
        assert_eq!(config.gpu, GpuConfig::default());
    }

    #[test]
    fn from_code_contains_given_models() {
        let model = sample_model("qwen3.5");
        let config = GgufConfig::from_code(vec![model]);
        assert_eq!(config.models.len(), 1);
        assert_eq!(config.models[0].name, "qwen3.5");
    }

    #[test]
    fn merge_overlay_same_name_model_overwrites() {
        let mut config = GgufConfig::from_code(vec![sample_model("test")]);
        let mut overlay = sample_model("test");
        overlay.lazy_load = false;
        config.merge_overlay(GgufConfig::from_code(vec![overlay]));
        assert_eq!(config.models.len(), 1);
        assert!(!config.models[0].lazy_load, "should be overwritten");
    }

    #[test]
    fn merge_overlay_diff_name_model_appends() {
        let mut config = GgufConfig::from_code(vec![sample_model("a")]);
        config.merge_overlay(GgufConfig::from_code(vec![sample_model("b")]));
        assert_eq!(config.models.len(), 2);
    }

    #[test]
    fn merge_overlay_server_only_when_port_nonzero() {
        let mut config = GgufConfig::from_code(vec![]);
        let overlay = GgufConfig {
            models: vec![],
            server: ServerConfig {
                bind: SocketAddr::from(([0, 0, 0, 0], 0)), // port 0 = 未指定
                ..ServerConfig::default()
            },
            gpu: GpuConfig::default(),
        };
        config.merge_overlay(overlay);
        // port=0 のサーバーは上書きされない → 127.0.0.1:DEFAULT_RT_PORT のまま
        assert_eq!(
            config.server.bind.port(),
            DEFAULT_RT_PORT,
            "server with port 0 should not overwrite"
        );
    }

    #[test]
    fn merge_overlay_gpu_only_when_provider_not_auto() {
        let mut config = GgufConfig::from_code(vec![]);
        let overlay = GgufConfig {
            models: vec![],
            server: ServerConfig::default(),
            gpu: GpuConfig {
                provider: GpuProvider::Auto, // Auto = 未指定
                cpu_only: true,
            },
        };
        config.merge_overlay(overlay);
        // provider=Auto の GPU は上書きされない → cpu_only は false のまま
        assert!(
            !config.gpu.cpu_only,
            "gpu with Auto provider should not overwrite"
        );
    }

    #[test]
    fn merge_overlay_empty_overlay_no_change() {
        let model = sample_model("keep");
        let mut config = GgufConfig::from_code(vec![model]);
        let original = config.clone();
        config.merge_overlay(GgufConfig::from_code(vec![]));
        assert_eq!(config.models.len(), original.models.len());
        assert_eq!(config.server, original.server);
        assert_eq!(config.gpu, original.gpu);
    }

    #[test]
    fn merge_overlay_partial_models_only() {
        let model_a = sample_model("a");
        let mut config = GgufConfig::from_code(vec![model_a]);
        let model_b = sample_model("b");
        config.merge_overlay(GgufConfig::from_code(vec![model_b]));
        assert_eq!(config.models.len(), 2);
        assert_eq!(config.models[0].name, "a");
        assert_eq!(config.models[1].name, "b");
    }

    // ── GgufConfig::from_json_str tests (M3-1) ──

    #[test]
    fn from_json_str_overwrites_same_name_model() {
        let base = GgufConfig::from_code(vec![sample_model("qwen3.5")]);
        let json = r#"{"models":[{"name":"qwen3.5","model_path":"override.gguf","lazy_load":false}],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let result = GgufConfig::from_json_str(json, base).unwrap();
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].model_path, PathBuf::from("override.gguf"));
        assert!(!result.models[0].lazy_load, "should be overwritten by JSON");
    }

    #[test]
    fn from_json_str_appends_new_model() {
        let base = GgufConfig::from_code(vec![sample_model("existing")]);
        let json = r#"{"models":[{"name":"new","model_path":"new.gguf","lazy_load":true}],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let result = GgufConfig::from_json_str(json, base).unwrap();
        assert_eq!(result.models.len(), 2);
        assert_eq!(result.models[1].name, "new");
    }

    #[test]
    fn from_json_str_overwrites_server_and_gpu() {
        let base = GgufConfig::from_code(vec![]);
        let json = r#"{"models":[],"server":{"bind":"0.0.0.0:9999","models":[],"auto_start_server":true},"gpu":{"provider":"Cuda","cpu_only":true}}"#;
        let result = GgufConfig::from_json_str(json, base).unwrap();
        assert_eq!(result.server.bind.port(), 9999);
        assert!(result.server.auto_start_server);
        assert_eq!(result.gpu.provider, GpuProvider::Cuda);
        assert!(result.gpu.cpu_only);
    }

    #[test]
    fn from_json_str_empty_object_preserves_base() {
        let base = GgufConfig::from_code(vec![sample_model("keep")]);
        let json = r#"{"models":[],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let result = GgufConfig::from_json_str(json, base).unwrap();
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].name, "keep");
    }

    #[test]
    fn from_json_str_invalid_json_returns_error() {
        let base = GgufConfig::from_code(vec![]);
        let result = GgufConfig::from_json_str("not valid json", base);
        assert!(result.is_err(), "invalid JSON should return error");
        match result {
            Err(GgufError::InvalidConfig(_)) => {} // expected
            _ => panic!("expected InvalidConfig error"),
        }
    }

    #[test]
    fn from_json_str_type_mismatch_returns_error() {
        let base = GgufConfig::from_code(vec![]);
        let json = r#"{"models":"not_an_array"}"#;
        let result = GgufConfig::from_json_str(json, base);
        assert!(result.is_err(), "type mismatch should return error");
        match result {
            Err(GgufError::InvalidConfig(_)) => {} // expected
            _ => panic!("expected InvalidConfig error"),
        }
    }

    // ── GgufConfig::from_file tests (M3-1) ──

    #[test]
    fn from_file_reads_and_merges_valid_json() {
        let base = GgufConfig::from_code(vec![sample_model("qwen3.5")]);
        let json_content = r#"{"models":[],"server":{"bind":"0.0.0.0:8080","models":[],"auto_start_server":true},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let tmp_path = std::env::temp_dir().join("ggufrs_test_from_file_valid.json");
        std::fs::write(&tmp_path, json_content).unwrap();
        let result = GgufConfig::from_file(&tmp_path, base);
        std::fs::remove_file(&tmp_path).unwrap();
        let config = result.unwrap();
        assert_eq!(config.server.bind.port(), 8080);
    }

    #[test]
    fn from_file_not_found_returns_error() {
        let base = GgufConfig::from_code(vec![]);
        let path = Path::new("/tmp/ggufrs_nonexistent_config_xyz.json");
        let result = GgufConfig::from_file(path, base);
        assert!(result.is_err(), "non-existent file should return error");
        match result {
            Err(GgufError::InvalidConfig(_)) => {} // expected
            _ => panic!("expected InvalidConfig error"),
        }
    }

    #[test]
    fn from_file_invalid_content_returns_error() {
        let base = GgufConfig::from_code(vec![]);
        let tmp_path = std::env::temp_dir().join("ggufrs_test_from_file_invalid.json");
        std::fs::write(&tmp_path, "not json content").unwrap();
        let result = GgufConfig::from_file(&tmp_path, base);
        std::fs::remove_file(&tmp_path).unwrap();
        assert!(result.is_err(), "invalid content should return error");
        match result {
            Err(GgufError::InvalidConfig(_)) => {} // expected
            _ => panic!("expected InvalidConfig error"),
        }
    }

    // ── GgufConfig::build tests (M3-1) ──

    #[test]
    fn build_three_layer_merge() {
        let code = GgufConfig::from_code(vec![sample_model("base")]);
        let json = r#"{"models":[{"name":"base","model_path":"json.gguf"}],"server":{"bind":"127.0.0.1:8080","models":[],"auto_start_server":true},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let file_content = r#"{"models":[{"name":"base","model_path":"json.gguf"}],"server":{"bind":"127.0.0.1:8080","models":[],"auto_start_server":true},"gpu":{"provider":"Cuda","cpu_only":true}}"#;
        let tmp_path = std::env::temp_dir().join("ggufrs_test_build_three_layer.json");
        std::fs::write(&tmp_path, file_content).unwrap();
        let config = GgufConfig::build(code, Some(json), Some(&tmp_path)).unwrap();
        std::fs::remove_file(&tmp_path).unwrap();
        // file 層で gpu が上書きされている
        assert_eq!(config.gpu.provider, GpuProvider::Cuda);
        assert!(config.gpu.cpu_only);
        // json 層で server が設定されている（file 層でも同一値）
        assert_eq!(config.server.bind.port(), 8080);
        // json 層でモデルが設定されている（file 層でも同一値）
        assert_eq!(config.models[0].model_path, PathBuf::from("json.gguf"));
    }

    #[test]
    fn build_code_only_no_json_no_file() {
        let code = GgufConfig::from_code(vec![sample_model("only")]);
        let config = GgufConfig::build(code, None, None).unwrap();
        assert_eq!(config.models.len(), 1);
        assert_eq!(config.models[0].name, "only");
    }

    #[test]
    fn build_code_and_json_only() {
        let code = GgufConfig::from_code(vec![sample_model("base")]);
        let json = r#"{"models":[],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Cuda","cpu_only":true}}"#;
        let config = GgufConfig::build(code, Some(json), None).unwrap();
        assert_eq!(config.gpu.provider, GpuProvider::Cuda);
    }

    #[test]
    fn build_code_and_file_only() {
        let code = GgufConfig::from_code(vec![sample_model("base")]);
        let file_content = r#"{"models":[],"server":{"bind":"0.0.0.0:7070","models":[],"auto_start_server":true},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let tmp_path = std::env::temp_dir().join("ggufrs_test_build_code_file.json");
        std::fs::write(&tmp_path, file_content).unwrap();
        let config = GgufConfig::build(code, None, Some(&tmp_path)).unwrap();
        std::fs::remove_file(&tmp_path).unwrap();
        assert_eq!(config.server.bind.port(), 7070);
    }

    #[test]
    fn build_file_not_found_returns_error() {
        let code = GgufConfig::from_code(vec![]);
        let result = GgufConfig::build(
            code,
            None,
            Some(Path::new("/tmp/ggufrs_nonexistent_build.json")),
        );
        assert!(result.is_err(), "non-existent file should return error");
    }

    // ── GgufConfig::merge tests (M3-1) ──

    #[test]
    fn merge_code_layer_only() {
        let cfg = GgufConfig::from_code(vec![sample_model("m")]);
        let layers = vec![ConfigLayer::Code(cfg)];
        let result = GgufConfig::merge(layers).unwrap();
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].name, "m");
    }

    #[test]
    fn merge_json_str_layer_only() {
        let json = r#"{"models":[{"name":"from_json","model_path":"j.gguf","lazy_load":true}],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let layers = vec![ConfigLayer::JsonStr(json.into())];
        let result = GgufConfig::merge(layers).unwrap();
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].name, "from_json");
    }

    #[test]
    fn merge_file_layer_only() {
        let file_content = r#"{"models":[{"name":"from_file","model_path":"f.gguf","lazy_load":true}],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let tmp_path = std::env::temp_dir().join("ggufrs_test_merge_file_only.json");
        std::fs::write(&tmp_path, file_content).unwrap();
        let layers = vec![ConfigLayer::File(tmp_path.clone())];
        let result = GgufConfig::merge(layers).unwrap();
        std::fs::remove_file(&tmp_path).unwrap();
        assert_eq!(result.models.len(), 1);
        assert_eq!(result.models[0].name, "from_file");
    }

    #[test]
    fn merge_three_layers_with_priority() {
        // Code → JsonStr → File の優先度検証
        let code_cfg = GgufConfig::from_code(vec![sample_model("m")]);
        let json = r#"{"models":[],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Cuda","cpu_only":true}}"#;
        let file_content = r#"{"models":[],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Metal","cpu_only":false}}"#;
        let tmp_path = std::env::temp_dir().join("ggufrs_test_merge_priority.json");
        std::fs::write(&tmp_path, file_content).unwrap();
        let layers = vec![
            ConfigLayer::Code(code_cfg),
            ConfigLayer::JsonStr(json.into()),
            ConfigLayer::File(tmp_path.clone()),
        ];
        let result = GgufConfig::merge(layers).unwrap();
        std::fs::remove_file(&tmp_path).unwrap();
        // File 層が最優先 → Metal
        assert_eq!(result.gpu.provider, GpuProvider::Metal);
        assert!(
            !result.gpu.cpu_only,
            "file layer should overwrite json layer"
        );
        // モデルは code 層のまま
        assert_eq!(result.models[0].name, "m");
    }

    #[test]
    fn merge_empty_vector_returns_default() {
        let result = GgufConfig::merge(vec![]).unwrap();
        assert!(result.models.is_empty());
        assert_eq!(result.server, ServerConfig::default());
        assert_eq!(result.gpu, GpuConfig::default());
    }

    #[test]
    fn merge_invalid_json_str_returns_error() {
        let layers = vec![ConfigLayer::JsonStr("invalid json".into())];
        let result = GgufConfig::merge(layers);
        assert!(result.is_err(), "invalid JSON should return error");
    }

    #[test]
    fn merge_file_not_found_returns_error() {
        let path = Path::new("/tmp/ggufrs_nonexistent_merge.json");
        let layers = vec![ConfigLayer::File(path.to_path_buf())];
        let result = GgufConfig::merge(layers);
        assert!(result.is_err(), "non-existent file should return error");
    }

    #[test]
    fn merge_all_layer_types_combined() {
        // Code → JsonStr(モデル追加) → File(サーバー設定) の組み合わせ
        let code_cfg = GgufConfig::from_code(vec![sample_model("m1")]);
        let json = r#"{"models":[{"name":"m2","model_path":"m2.gguf","lazy_load":true}],"server":{"bind":"127.0.0.1:3910","models":[],"auto_start_server":false},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let file_content = r#"{"models":[{"name":"m2","model_path":"m2.gguf","lazy_load":true}],"server":{"bind":"0.0.0.0:3000","models":[],"auto_start_server":true},"gpu":{"provider":"Auto","cpu_only":false}}"#;
        let tmp_path = std::env::temp_dir().join("ggufrs_test_merge_all.json");
        std::fs::write(&tmp_path, file_content).unwrap();
        let layers = vec![
            ConfigLayer::Code(code_cfg),
            ConfigLayer::JsonStr(json.into()),
            ConfigLayer::File(tmp_path.clone()),
        ];
        let result = GgufConfig::merge(layers).unwrap();
        std::fs::remove_file(&tmp_path).unwrap();
        assert_eq!(result.models.len(), 2);
        assert_eq!(result.models[0].name, "m1");
        assert_eq!(result.models[1].name, "m2");
        assert_eq!(result.server.bind.port(), 3000);
    }
}
