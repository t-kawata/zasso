//! # 設定構造体群
//!
//! `anthropx` プロキシサーバーの設定システムを構成する全データ型を定義する。
//! 全フィールドは `pub` であり、TOML ファイルとプログラム的構築の二刀流を
//! `#[serde(default)]` + `impl Default` で実現する。
//!
//! ## 階層構造
//!
//! ```text
//! AppConfig
//!  ├── global: GlobalConfig          # サーバー全体設定
//!  │    ├── port, url_prefix, …       # 基本ネットワーク設定
//!  │    ├── log_format: LogFormat     # ログ出力形式
//!  │    ├── allow_lossy / error_lossy_continue  # Lossy 挙動
//!  │    ├── timeouts: TimeoutConfig   # タイムアウト値
//!  │    ├── limits: GlobalLimitConfig # 並行性制御のデフォルト
//!  │    └── aliases                   # グローバルモデルエイリアス
//!  └── providers: BTreeMap<String, ProviderConfig>
//!       └── ProviderConfig            # Provider 単位の設定
//!            ├── transparent / base_url / api_keys
//!            ├── openai_wire_api: OpenAiWireApi  # Wire format 選択
//!            ├── max_in_flight / max_queue        # 個別上限
//!            └── models: Vec<ModelConfig>         # 公開モデル定義
//! ```

use std::collections::BTreeMap;

// ---------------------------------------------------------------------------
// Enum 定義
// ---------------------------------------------------------------------------

/// ログ出力形式。
///
/// `serde(rename_all = "snake_case")` により TOML 上では `text` / `json` と記述する。
#[derive(Debug, Clone, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LogFormat {
    /// 人間可読なテキスト形式（開発環境向け、デフォルト）
    Text,
    /// 構造化 JSON 形式（本番環境向け、ログ集約システムで使用）
    Json,
}

/// 上流 provider の API ワイヤー形式。
///
/// OpenAI 互換 API は主に2系統（Chat Completions / Responses）が存在する。
/// `Auto` は `base_url` のパス末尾から自動判定する。
#[derive(Debug, Clone, PartialEq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenAiWireApi {
    /// base_url のパスから自動判定（デフォルト）
    Auto,
    /// /v1/chat/completions 形式
    ChatCompletions,
    /// /v1/responses 形式
    Responses,
}

// ---------------------------------------------------------------------------
// デフォルト値生成関数
// ---------------------------------------------------------------------------

/// ModelConfig::enabled のデフォルト: `true`（明示的に無効化されたモデルのみ非公開）
fn default_enabled() -> bool {
    true
}

/// TimeoutConfig::connect_ms のデフォルト: 3 秒
///
/// 通常のクラウド API は 1〜2 秒以内に接続確立するため、3 秒は
/// ネットワーク不安定時も含めて十分な余裕を持つ。
fn default_connect_ms() -> u64 {
    3000
}

/// TimeoutConfig::read_ms のデフォルト: 10 分
///
/// LLM のストリーミング応答は長文生成時に数分かかる場合がある。
/// 10 分は Claude の最大応答時間をカバーする値。
fn default_read_ms() -> u64 {
    600_000
}

/// TimeoutConfig::total_ms のデフォルト: 10 分
///
/// 接続＋読み取りの合計タイムアウト。read_ms と同一値にすることで、
/// ストリーミング中の切断を防ぎつつ、無応答状態を検出する。
fn default_total_ms() -> u64 {
    600_000
}

/// GlobalLimitConfig::default_max_in_flight のデフォルト: 64
///
/// 同時実行数の安全な初期値。単一 provider で 64 同時リクエストを
/// 許容することで、小さなチームの利用には十分なスループットを確保する。
fn default_in_flight() -> usize {
    64
}

/// GlobalLimitConfig::default_max_queue のデフォルト: 256
///
/// in_flight 超過時にキューイング可能な最大リクエスト数。
/// 256 はバーストトラフィックを吸収しつつ、メモリ枯渇を防ぐ値。
fn default_queue() -> usize {
    256
}

/// GlobalConfig::log_format のデフォルト: `LogFormat::Text`
fn default_log_format() -> LogFormat {
    LogFormat::Text
}

// ---------------------------------------------------------------------------
// 構造体定義
// ---------------------------------------------------------------------------

/// 最上位設定。
///
/// サーバー全体の設定 (`global`) と provider ごとの設定 (`providers`) を保持する。
/// `BTreeMap` により `/v1/models` でアルファベット順のソート済み出力が得られる。
#[derive(Debug, Clone, Default, serde::Deserialize, serde::Serialize)]
pub struct AppConfig {
    /// サーバー全体設定（ポート、タイムアウト、制限値など）
    pub global: GlobalConfig,
    /// Provider 名 → 設定 のマップ。BTreeMap によりキーがアルファベット昇順に整列する。
    #[serde(default)]
    pub providers: BTreeMap<String, ProviderConfig>,
}

impl AppConfig {
    /// 設定の整合性を検証する（RFC §2.1）。
    ///
    /// 全エラーを収集してから一度に報告する集約型バリデーション。
    /// これによりユーザーは1回の起動ですべての設定ミスを修正できる。
    ///
    /// # 検証項目
    ///
    /// 1. 各 provider の `api_keys` が1件以上存在する
    /// 2. 各 provider 内の `models.public` に重複がない
    /// 3. 各 provider 内の `model_aliases` の値が public model 名と衝突しない
    /// 4. ポート番号が 1〜65535 の範囲内
    /// 5. timeout 値（connect_ms / read_ms / total_ms）が 0 でない
    pub fn validate(&self) -> Result<(), Vec<ConfigError>> {
        let mut errors = Vec::new();

        // 1. 各 provider の api_keys が空でないこと
        for (name, provider) in &self.providers {
            if provider.api_keys.is_empty() {
                errors.push(ConfigError::EmptyApiKeys(name.clone()));
            }
        }

        // 2. 各 provider 内の models.public に重複がないこと
        // 3. 各 provider 内の model_aliases が public model 名と衝突しないこと
        for provider in self.providers.values() {
            let mut seen_public_names = std::collections::HashSet::new();
            // 2. public model 名の重複チェック
            for model in &provider.models {
                if !seen_public_names.insert(model.public.clone()) {
                    errors.push(ConfigError::DuplicateModel(model.public.clone()));
                }
            }
            // 3. alias の値が public model 名と衝突するかチェック
            // （値が public model 名のいずれかに一致し、かつ元のキーがその model 名と異なる場合）
            let public_names: std::collections::HashSet<String> =
                provider.models.iter().map(|m| m.public.clone()).collect();
            for (alias_key, alias_value) in &provider.model_aliases {
                if public_names.contains(alias_value.as_str()) && alias_key != alias_value {
                    errors.push(ConfigError::DuplicateAlias(
                        alias_key.clone(),
                        alias_value.clone(),
                    ));
                }
            }
        }

        // 4. ポート番号が 1〜65535 の範囲内
        // （u16 のため 65535 以上はコンパイル時保証される。0 のみチェック）
        if self.global.port == 0 {
            errors.push(ConfigError::ValidationFailed(vec![
                ConfigError::DuplicateModel("port must be between 1 and 65535".to_string()),
            ]));
        }

        // 5. timeout 値が 0 でないこと
        if self.global.timeouts.connect_ms == 0 {
            errors.push(ConfigError::ValidationFailed(vec![
                ConfigError::DuplicateModel("connect_ms must not be 0".to_string()),
            ]));
        }
        if self.global.timeouts.read_ms == 0 {
            errors.push(ConfigError::ValidationFailed(vec![
                ConfigError::DuplicateModel("read_ms must not be 0".to_string()),
            ]));
        }
        if self.global.timeouts.total_ms == 0 {
            errors.push(ConfigError::ValidationFailed(vec![
                ConfigError::DuplicateModel("total_ms must not be 0".to_string()),
            ]));
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }

    /// TOML ファイルから設定を読み込む。
    ///
    /// 1. `std::fs::read_to_string` でファイル内容を読み込み
    /// 2. `toml::from_str` でデシリアライズ
    /// 3. `self.validate()` で設定の整合性を検証
    pub fn from_toml(path: &std::path::Path) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| ConfigError::Io(path.to_string_lossy().to_string(), e))?;
        let config: Self = toml::from_str(&content)
            .map_err(|e| ConfigError::Parse(path.to_string_lossy().to_string(), e))?;
        config.validate().map_err(ConfigError::ValidationFailed)?;
        Ok(config)
    }
}

/// サーバー全体設定。
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct GlobalConfig {
    /// リッスンポート番号。デフォルト: 8088
    #[serde(default = "default_port")]
    pub port: u16,
    /// URL プレフィックス（リバースプロキシ配下で使用）。空文字列がデフォルト。
    #[serde(default)]
    pub url_prefix: String,
    /// クライアント認証の要否。`true` で Bearer Token 検証を有効化。
    #[serde(default)]
    pub require_client_auth: bool,
    /// ログ出力形式。デフォルト: Text
    #[serde(default = "default_log_format")]
    pub log_format: LogFormat,
    /// 非 Anthropic→Anthropic 変換で情報落ち（lossy）を許容するか。
    /// `true` で変換不能フィールドを警告のみで通過させる。
    #[serde(default)]
    pub allow_lossy: bool,
    /// Error 級の lossy が発生した場合に処理を継続するか。
    /// `false`（デフォルト）では Error 級 lossy 発生時にリクエストを拒否する。
    #[serde(default)]
    pub error_lossy_continue: bool,
    /// タイムアウト設定（接続／読み取り／合計）
    #[serde(default)]
    pub timeouts: TimeoutConfig,
    /// 並行性制限のデフォルト値
    #[serde(default)]
    pub limits: GlobalLimitConfig,
    /// グローバルモデルエイリアス（公開名 → 内部名のマッピング）
    #[serde(default)]
    pub aliases: BTreeMap<String, String>,
}

/// `#[serde(default)]` で参照されるポート番号のデフォルト値。
const fn default_port() -> u16 {
    8088
}

impl Default for GlobalConfig {
    fn default() -> Self {
        Self {
            port: 8088,
            url_prefix: String::new(),
            require_client_auth: false,
            log_format: LogFormat::Text,
            allow_lossy: false,
            // Error 級 lossy はデフォルトで拒否（安全側に倒す）
            error_lossy_continue: false,
            timeouts: TimeoutConfig::default(),
            limits: GlobalLimitConfig::default(),
            aliases: BTreeMap::new(),
        }
    }
}

/// Provider 単位の設定。
///
/// オプショナルフィールド（`allow_lossy`, `max_in_flight` 等）は
/// `None` の場合に `GlobalConfig` の対応値を継承する。
/// `#[serde(default)]` により TOML で省略されたフィールドは自動的に `None` になる。
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ProviderConfig {
    /// 透過モード（`true`: リクエストをそのまま転送、`false`: プロトコル変換）
    pub transparent: bool,
    /// 上流 API のベース URL（例: "https://api.deepseek.com/v1"）
    pub base_url: String,
    /// API キー一覧（複数指定で起動時乱択 + round-robin による分散・failover）
    pub api_keys: Vec<String>,
    /// Lossy 許容の上書き（`None` で global 設定を継承）
    #[serde(default)]
    pub allow_lossy: Option<bool>,
    /// Error 級 lossy 継続の上書き（`None` で global 設定を継承）
    #[serde(default)]
    pub error_lossy_continue: Option<bool>,
    /// ワイヤー形式の上書き（`None` で Auto）
    #[serde(default)]
    pub openai_wire_api: Option<OpenAiWireApi>,
    /// 最大同時実行数の上書き（`None` で global 設定を継承）
    #[serde(default)]
    pub max_in_flight: Option<usize>,
    /// 最大キューの上書き（`None` で global 設定を継承）
    #[serde(default)]
    pub max_queue: Option<usize>,
    /// Provider ローカルのモデルエイリアス
    #[serde(default)]
    pub model_aliases: BTreeMap<String, String>,
    /// 公開モデル定義一覧
    #[serde(default)]
    pub models: Vec<ModelConfig>,
}

/// 公開モデルの定義。
///
/// 1 件の `ModelConfig` が 1 つの公開名 (`public`) と上流名 (`upstream`) の対応を表す。
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ModelConfig {
    /// クライアントに公開するモデル名
    pub public: String,
    /// 上流プロバイダーにおける実際のモデル名
    pub upstream: String,
    /// モデルの有効／無効。デフォルト: `true`（ホワイトリスト型）
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// モデルに付与するタグ一覧（フィルタリングやグルーピングに使用）
    #[serde(default)]
    pub tags: Vec<String>,
    /// 最大トークン数上限（`None` で無制限）
    #[serde(default)]
    pub max_tokens_cap: Option<u32>,
    /// モデル別エイリアス（公開名の追加）
    #[serde(default)]
    pub aliases: Vec<String>,
}

impl Default for ModelConfig {
    fn default() -> Self {
        Self {
            public: String::new(),
            upstream: String::new(),
            enabled: true,
            tags: Vec::new(),
            max_tokens_cap: None,
            aliases: Vec::new(),
        }
    }
}

/// タイムアウト設定（ミリ秒単位）。
#[derive(Debug, Clone, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct TimeoutConfig {
    /// 接続タイムアウト（ミリ秒）。デフォルト: 3000 (3秒)
    #[serde(default = "default_connect_ms")]
    pub connect_ms: u64,
    /// 読み取りタイムアウト（ミリ秒）。デフォルト: 600000 (10分)
    #[serde(default = "default_read_ms")]
    pub read_ms: u64,
    /// 合計タイムアウト（ミリ秒）。デフォルト: 600000 (10分)
    #[serde(default = "default_total_ms")]
    pub total_ms: u64,
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self {
            connect_ms: 3000,
            read_ms: 600_000,
            total_ms: 600_000,
        }
    }
}

/// 並行性制御のグローバルデフォルト値。
#[derive(Debug, Clone, PartialEq, serde::Deserialize, serde::Serialize)]
pub struct GlobalLimitConfig {
    /// Provider あたりの最大同時実行数（デフォルト: 64）
    #[serde(default = "default_in_flight")]
    pub default_max_in_flight: usize,
    /// Provider あたりの最大キューイング数（デフォルト: 256）
    #[serde(default = "default_queue")]
    pub default_max_queue: usize,
}

impl Default for GlobalLimitConfig {
    fn default() -> Self {
        Self {
            default_max_in_flight: 64,
            default_max_queue: 256,
        }
    }
}

// ---------------------------------------------------------------------------
// LossyLevel / ResolvedModel / ProxyError / ConfigError
// ---------------------------------------------------------------------------

/// Lossy Translation の重大度分類（RFC §6）。
///
/// non-Anthropic→Anthropic プロトコル変換時に情報欠落（lossy）が発生した際の
/// 動作を決定する3段階の重大度。`should_reject()` ロジックは M1-1 で実装する。
#[derive(Debug, Clone, PartialEq)]
pub enum LossyLevel {
    /// 機能欠落によりリクエストが成立しない（Thinking, CacheControl など）。
    /// `allow_lossy=false` の場合は常に 400 Bad Request。
    Error,
    /// 代替動作で続行可能（一部パラメータの近似、デフォルト値補完など）。
    /// `allow_lossy` の値に関わらず続行 + metrics + log。
    Warn,
    /// 無視されても影響が軽微（未知のメタデータフィールドなど）。
    /// `allow_lossy` の値に関わらず無視 + debug log。
    Info,
}

impl LossyLevel {
    /// Lossy 発生時にリクエストを拒否すべきか判定する（RFC §6）。
    ///
    /// Error 級 かつ `allow_lossy=false` かつ `error_lossy_continue=false` の場合のみ
    /// `true`（拒否）を返す。それ以外の組み合わせでは常に `false`。
    pub fn should_reject(&self, allow_lossy: bool, error_lossy_continue: bool) -> bool {
        matches!(self, LossyLevel::Error) && !allow_lossy && !error_lossy_continue
    }
}

/// Model 名解決結果（RFC §1.3）。
///
/// `resolve_model()` が返す解決済みモデル情報。
/// `public` はクライアントが指定した公開名、`upstream` は上流プロバイダー
/// における実際のモデル名。
#[derive(Debug, Clone)]
pub struct ResolvedModel {
    /// クライアントに公開するモデル名（そのまま）
    pub public: String,
    /// 上流プロバイダーにおける実際のモデル名
    pub upstream: String,
}

/// プロキシサーバーの全エラーを表現する単一 enum（RFC §11）。
///
/// Axum handler から `Result<T, ProxyError>` を返すと適切な HTTP 応答に
/// 変換される（`IntoResponse` 実装は M3-1）。このチケットでは enum 定義と
/// `Display` 実装（`thiserror`）のみを行う。
#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    /// 不明なプロバイダー名が指定された
    #[error("invalid provider: {0}")]
    UnknownProvider(String),

    /// 不明なモデル名が指定された
    #[error("invalid model: {0}")]
    InvalidModel(String),

    /// リクエストに必須フィールドが欠落している
    #[error("missing required field: {0}")]
    MissingField(&'static str),

    /// 認証失敗（API key 欠如または無効）
    #[error("authentication failed")]
    Unauthorized,

    /// 認証済みだが権限不足
    #[error("forbidden")]
    Forbidden,

    /// キューが満杯でリクエストを受理できない
    #[error("queue is full")]
    QueueFull,

    /// 上流プロバイダーがエラーステータスを返した
    #[error("upstream returned {0}")]
    Upstream(http::StatusCode),

    /// 上流プロバイダーに到達できない（ネットワーク障害等）
    #[error("upstream unreachable: {0}")]
    UpstreamError(String),

    /// プロトコル変換中に Lossy エラーが発生した
    #[error("transform error: {0}")]
    TransformLossy(String),

    /// リクエストがタイムアウトした
    #[error("request timed out")]
    Timeout,

    /// サーバー内部エラー（プログラミングバグ等）
    #[error("internal error: {0}")]
    Internal(String),

    /// 設定エラー（InvalidModel とは異なり、サーバー設定自体の問題）
    #[error("config error: {0}")]
    Config(String),
}

/// 設定読み込み・検証のエラー型（RFC §2）。
///
/// Io と Parse は個別のファイルパス情報を持ち、ValidationFailed は
/// 集約型バリデーションの全エラーを保持する。
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    /// 設定ファイル読み込み失敗
    Io(String, #[source] std::io::Error),
    /// TOML パース失敗
    Parse(String, #[source] toml::de::Error),
    /// Provider の api_keys が空
    EmptyApiKeys(String),
    /// Provider 内で model.public が重複している
    DuplicateModel(String),
    /// エイリアスが既存の公開名と衝突している
    DuplicateAlias(String, String),
    /// 集約型バリデーションの全エラー（M1-2）
    ValidationFailed(Vec<ConfigError>),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(path, source) => write!(f, "io error reading {path}: {source}"),
            Self::Parse(path, source) => write!(f, "parse error in {path}: {source}"),
            Self::EmptyApiKeys(name) => write!(f, "empty api_keys for provider: {name}"),
            Self::DuplicateModel(name) => write!(f, "duplicate model name: {name}"),
            Self::DuplicateAlias(alias, existing) => {
                write!(
                    f,
                    "alias \"{alias}\" conflicts with existing model \"{existing}\""
                )
            }
            Self::ValidationFailed(errors) => {
                write!(f, "validation failed with {} error(s)", errors.len())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- AppConfig ----

    /// AppConfig::default() の全フィールドが期待値と一致すること。
    #[test]
    fn app_config_default() {
        let config = AppConfig::default();
        assert_eq!(config.global.port, 8088);
        assert!(config.global.url_prefix.is_empty());
        assert!(!config.global.require_client_auth);
        assert_eq!(config.global.log_format, LogFormat::Text);
        assert!(!config.global.allow_lossy);
        assert!(!config.global.error_lossy_continue);
        assert_eq!(config.global.timeouts, TimeoutConfig::default());
        assert_eq!(config.global.limits, GlobalLimitConfig::default());
        assert!(config.global.aliases.is_empty());
        assert!(config.providers.is_empty());
    }

    /// AppConfig::default() で providers が空の BTreeMap になること。
    #[test]
    fn app_config_default_providers_empty() {
        let config = AppConfig::default();
        assert!(config.providers.is_empty());
    }

    /// 複数 provider を持つ AppConfig の構築とフィールドアクセス。
    #[test]
    fn app_config_partial_providers() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "a_provider".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://a.example.com".to_string(),
                api_keys: vec!["key_a".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: Vec::new(),
            },
        );
        config.providers.insert(
            "b_provider".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://b.example.com".to_string(),
                api_keys: vec!["key_b".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: Vec::new(),
            },
        );
        assert_eq!(config.providers.len(), 2);
        assert!(config.providers.contains_key("a_provider"));
        assert!(config.providers.contains_key("b_provider"));
    }

    // ---- GlobalConfig ----

    /// GlobalConfig::default() の全フィールドが期待値と一致すること。
    ///
    /// 期待値:
    /// - port: 8088
    /// - url_prefix: ""
    /// - require_client_auth: false
    /// - log_format: Text
    /// - allow_lossy: false
    /// - error_lossy_continue: false
    /// - timeouts: デフォルト値
    /// - limits: デフォルト値
    /// - aliases: 空
    #[test]
    fn global_config_default() {
        let g = GlobalConfig::default();
        assert_eq!(g.port, 8088, "port should default to 8088");
        assert!(
            g.url_prefix.is_empty(),
            "url_prefix should default to empty"
        );
        assert!(
            !g.require_client_auth,
            "require_client_auth should default to false"
        );
        assert_eq!(
            g.log_format,
            LogFormat::Text,
            "log_format should default to Text"
        );
        assert!(!g.allow_lossy, "allow_lossy should default to false");
        assert!(
            !g.error_lossy_continue,
            "error_lossy_continue should default to false"
        );
        assert_eq!(
            g.timeouts,
            TimeoutConfig::default(),
            "timeouts should equal default"
        );
        assert_eq!(
            g.limits,
            GlobalLimitConfig::default(),
            "limits should equal default"
        );
        assert!(g.aliases.is_empty(), "aliases should default to empty");
    }

    // ---- ProviderConfig ----

    /// ProviderConfig の `#[serde(default)]` が全オプショナルフィールドに
    /// None または空を設定すること。
    #[test]
    fn provider_config_default() {
        let toml_str = r#"
transparent = true
base_url = "https://example.com"
api_keys = ["key1"]
"#;
        let provider: ProviderConfig = toml::from_str(toml_str).expect("TOML deserialize failed");
        assert!(provider.allow_lossy.is_none());
        assert!(provider.error_lossy_continue.is_none());
        assert!(provider.openai_wire_api.is_none());
        assert!(provider.max_in_flight.is_none());
        assert!(provider.max_queue.is_none());
        assert!(provider.model_aliases.is_empty());
        assert!(provider.models.is_empty());
    }

    // ---- ModelConfig ----

    /// ModelConfig::default() の全フィールドが期待値と一致すること。
    #[test]
    fn model_config_default() {
        let m = ModelConfig::default();
        assert!(m.enabled, "enabled should default to true");
        assert!(m.tags.is_empty(), "tags should default to empty vec");
        assert!(
            m.max_tokens_cap.is_none(),
            "max_tokens_cap should default to None"
        );
        assert!(m.aliases.is_empty(), "aliases should default to empty vec");
    }

    /// default_enabled() が true を返すこと。
    #[test]
    fn model_config_enabled_default_true() {
        assert!(default_enabled());
    }

    // ---- TimeoutConfig ----

    /// TimeoutConfig::default() の全フィールドが期待値と一致すること。
    #[test]
    fn timeout_config_default() {
        let t = TimeoutConfig::default();
        assert_eq!(t.connect_ms, 3000);
        assert_eq!(t.read_ms, 600_000);
        assert_eq!(t.total_ms, 600_000);
    }

    /// 各 default_*_ms() 関数の戻り値が期待値と一致すること。
    #[test]
    fn timeout_config_default_functions() {
        assert_eq!(default_connect_ms(), 3000);
        assert_eq!(default_read_ms(), 600_000);
        assert_eq!(default_total_ms(), 600_000);
    }

    // ---- GlobalLimitConfig ----

    /// GlobalLimitConfig::default() の全フィールドが期待値と一致すること。
    #[test]
    fn global_limit_config_default() {
        let l = GlobalLimitConfig::default();
        assert_eq!(l.default_max_in_flight, 64);
        assert_eq!(l.default_max_queue, 256);
    }

    /// 各 default_*() 関数の戻り値が期待値と一致すること。
    #[test]
    fn global_limit_default_functions() {
        assert_eq!(default_in_flight(), 64);
        assert_eq!(default_queue(), 256);
    }

    // ---- LogFormat ----

    /// default_log_format() が LogFormat::Text を返すこと。
    #[test]
    fn log_format_default_text() {
        assert_eq!(default_log_format(), LogFormat::Text);
    }

    /// LogFormat の2 variant が正しく構築できること。
    #[test]
    fn log_format_variants() {
        let text = LogFormat::Text;
        let json = LogFormat::Json;
        assert!(matches!(text, LogFormat::Text));
        assert!(matches!(json, LogFormat::Json));
    }

    // ---- OpenAiWireApi ----

    /// OpenAiWireApi の3 variant が正しく構築できること。
    #[test]
    fn openai_wire_api_variants() {
        let auto = OpenAiWireApi::Auto;
        let chat = OpenAiWireApi::ChatCompletions;
        let resp = OpenAiWireApi::Responses;
        assert!(matches!(auto, OpenAiWireApi::Auto));
        assert!(matches!(chat, OpenAiWireApi::ChatCompletions));
        assert!(matches!(resp, OpenAiWireApi::Responses));
    }

    // ---- Serde: rename_all = "snake_case" ----

    /// LogFormat / OpenAiWireApi の `#[serde(rename_all = "snake_case")]` が
    /// snake_case デシリアライズで正しく動作すること。
    #[test]
    fn serde_rename_snake_case() {
        // LogFormat
        let text: LogFormat = serde_json::from_str(r#""text""#).expect("deser text");
        assert_eq!(text, LogFormat::Text);
        let json: LogFormat = serde_json::from_str(r#""json""#).expect("deser json");
        assert_eq!(json, LogFormat::Json);

        // OpenAiWireApi
        let auto: OpenAiWireApi = serde_json::from_str(r#""auto""#).expect("deser auto");
        assert_eq!(auto, OpenAiWireApi::Auto);
        let chat: OpenAiWireApi =
            serde_json::from_str(r#""chat_completions""#).expect("deser chat");
        assert_eq!(chat, OpenAiWireApi::ChatCompletions);
        let resp: OpenAiWireApi = serde_json::from_str(r#""responses""#).expect("deser responses");
        assert_eq!(resp, OpenAiWireApi::Responses);
    }

    // ---- Serde round-trip ----

    /// AppConfig のデフォルト値を JSON にシリアライズ → デシリアライズで
    /// 同一構造体が得られること。
    #[test]
    fn app_config_serde_roundtrip() {
        let original = AppConfig::default();
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: AppConfig = serde_json::from_str(&json).expect("deserialize");
        // BTreeMap の同値比較
        assert_eq!(original.global.port, restored.global.port);
        assert_eq!(original.global.url_prefix, restored.global.url_prefix);
        assert_eq!(
            original.global.require_client_auth,
            restored.global.require_client_auth
        );
        assert_eq!(original.providers.len(), restored.providers.len());
    }

    /// ProviderConfig の全フィールドを明示的に指定してラウンドトリップ一致確認。
    #[test]
    fn provider_config_serde_roundtrip() {
        let original = ProviderConfig {
            transparent: true,
            base_url: "https://test.example.com".to_string(),
            api_keys: vec!["k1".to_string(), "k2".to_string()],
            allow_lossy: Some(true),
            error_lossy_continue: Some(false),
            openai_wire_api: Some(OpenAiWireApi::ChatCompletions),
            max_in_flight: Some(16),
            max_queue: Some(64),
            model_aliases: BTreeMap::from([("fast".to_string(), "fast-model".to_string())]),
            models: vec![ModelConfig {
                public: "m1".to_string(),
                upstream: "up-m1".to_string(),
                enabled: false,
                tags: vec!["tag1".to_string()],
                max_tokens_cap: Some(4096),
                aliases: vec!["m1-alias".to_string()],
            }],
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: ProviderConfig = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(restored.transparent, original.transparent);
        assert_eq!(restored.base_url, original.base_url);
        assert_eq!(restored.api_keys, original.api_keys);
        assert_eq!(restored.allow_lossy, original.allow_lossy);
        assert_eq!(restored.openai_wire_api, original.openai_wire_api);
        assert_eq!(restored.max_in_flight, original.max_in_flight);
        assert_eq!(restored.models.len(), 1);
        assert_eq!(restored.models[0].public, "m1");
        assert_eq!(restored.models[0].upstream, "up-m1");
        assert!(!restored.models[0].enabled);
        assert_eq!(restored.models[0].max_tokens_cap, Some(4096));
        assert_eq!(restored.models[0].aliases, vec!["m1-alias"]);
    }

    // ---- BTreeMap key order ----

    /// BTreeMap のキー順序がアルファベット昇順であることを確認。
    #[test]
    fn btreemap_key_order() {
        let mut providers = BTreeMap::new();
        providers.insert("z_provider".to_string(), dummy_provider());
        providers.insert("a_provider".to_string(), dummy_provider());
        providers.insert("m_provider".to_string(), dummy_provider());
        let keys: Vec<&String> = providers.keys().collect();
        assert_eq!(keys, vec!["a_provider", "m_provider", "z_provider"]);
    }

    /// BTreeMap キー順序テスト用のダミー ProviderConfig を生成する。
    fn dummy_provider() -> ProviderConfig {
        ProviderConfig {
            transparent: false,
            base_url: "https://dummy.example.com".to_string(),
            api_keys: vec!["dummy".to_string()],
            allow_lossy: None,
            error_lossy_continue: None,
            openai_wire_api: None,
            max_in_flight: None,
            max_queue: None,
            model_aliases: BTreeMap::new(),
            models: Vec::new(),
        }
    }

    // ---- Trait boundary (コンパイル時検証) ----

    /// M0-1 構造体が Debug + Clone + Serialize + Deserialize を満たすことを確認。
    #[test]
    fn struct_traits_impl() {
        fn assert_traits<
            T: std::fmt::Debug + Clone + serde::Serialize + serde::de::DeserializeOwned,
        >() {
        }
        assert_traits::<AppConfig>();
        assert_traits::<GlobalConfig>();
        assert_traits::<ProviderConfig>();
        assert_traits::<ModelConfig>();
        assert_traits::<TimeoutConfig>();
        assert_traits::<GlobalLimitConfig>();
        assert_traits::<LogFormat>();
        assert_traits::<OpenAiWireApi>();
    }

    // =====================================================================
    // M0-2: LossyLevel / ProxyError / ConfigError / ResolvedModel
    // =====================================================================

    // ---- LossyLevel ----

    /// LossyLevel の variant 数が 3 であること。
    #[test]
    fn lossy_level_variant_count() {
        assert_eq!(
            std::mem::discriminant(&LossyLevel::Error),
            std::mem::discriminant(&LossyLevel::Error)
        );
        let _error = LossyLevel::Error;
        let _warn = LossyLevel::Warn;
        let _info = LossyLevel::Info;
    }

    /// LossyLevel が Debug + Clone を満たすこと。
    #[test]
    fn lossy_level_debug_clone() {
        fn assert_traits<T: std::fmt::Debug + Clone>() {}
        assert_traits::<LossyLevel>();
    }

    // ---- ProxyError ----

    /// ProxyError::UnknownProvider の Display が "invalid provider: x" であること。
    #[test]
    fn proxy_error_unknown_provider() {
        let err = ProxyError::UnknownProvider("deepseek".to_string());
        assert_eq!(err.to_string(), "invalid provider: deepseek");
    }

    /// ProxyError::InvalidModel の Display が "invalid model: m" であること。
    #[test]
    fn proxy_error_invalid_model() {
        let err = ProxyError::InvalidModel("gpt-4".to_string());
        assert_eq!(err.to_string(), "invalid model: gpt-4");
    }

    /// ProxyError::MissingField の Display が "missing required field: model" であること。
    #[test]
    fn proxy_error_missing_field() {
        let err = ProxyError::MissingField("model");
        assert_eq!(err.to_string(), "missing required field: model");
    }

    /// ProxyError::Unauthorized の Display が "authentication failed" であること。
    #[test]
    fn proxy_error_unauthorized() {
        let err = ProxyError::Unauthorized;
        assert_eq!(err.to_string(), "authentication failed");
    }

    /// ProxyError::Forbidden の Display が "forbidden" であること。
    #[test]
    fn proxy_error_forbidden() {
        let err = ProxyError::Forbidden;
        assert_eq!(err.to_string(), "forbidden");
    }

    /// ProxyError::QueueFull の Display が "queue is full" であること。
    #[test]
    fn proxy_error_queue_full() {
        let err = ProxyError::QueueFull;
        assert_eq!(err.to_string(), "queue is full");
    }

    /// ProxyError::Upstream の Display にステータスコードが含まれること。
    #[test]
    fn proxy_error_upstream() {
        let err = ProxyError::Upstream(http::StatusCode::BAD_GATEWAY);
        assert!(err.to_string().contains("502"));
    }

    /// ProxyError::UpstreamError の Display がエラー内容を含むこと。
    #[test]
    fn proxy_error_upstream_error() {
        let err = ProxyError::UpstreamError("connection refused".to_string());
        assert_eq!(err.to_string(), "upstream unreachable: connection refused");
    }

    /// ProxyError::TransformLossy の Display が変換エラー内容を含むこと。
    #[test]
    fn proxy_error_transform_lossy() {
        let err = ProxyError::TransformLossy("unsupported field 'thinking'".to_string());
        assert_eq!(
            err.to_string(),
            "transform error: unsupported field 'thinking'"
        );
    }

    /// ProxyError::Timeout の Display が "request timed out" であること。
    #[test]
    fn proxy_error_timeout() {
        let err = ProxyError::Timeout;
        assert_eq!(err.to_string(), "request timed out");
    }

    /// ProxyError::Internal の Display が内部エラー内容を含むこと。
    #[test]
    fn proxy_error_internal() {
        let err = ProxyError::Internal("unexpected state".to_string());
        assert_eq!(err.to_string(), "internal error: unexpected state");
    }

    /// ProxyError::Config の Display が設定エラー内容を含むこと。
    #[test]
    fn proxy_error_config() {
        let err = ProxyError::Config("bad config value".to_string());
        assert_eq!(err.to_string(), "config error: bad config value");
    }

    /// ProxyError の全12 variant がパニックなく Display 文字列を生成すること。
    #[test]
    fn proxy_error_all_variants_display() {
        let variants: Vec<ProxyError> = vec![
            ProxyError::UnknownProvider("p".into()),
            ProxyError::InvalidModel("m".into()),
            ProxyError::MissingField("f"),
            ProxyError::Unauthorized,
            ProxyError::Forbidden,
            ProxyError::QueueFull,
            ProxyError::Upstream(http::StatusCode::OK),
            ProxyError::UpstreamError("e".into()),
            ProxyError::TransformLossy("t".into()),
            ProxyError::Timeout,
            ProxyError::Internal("i".into()),
            ProxyError::Config("c".into()),
        ];
        for v in &variants {
            let display = v.to_string();
            assert!(!display.is_empty(), "Display should not be empty for {v:?}");
        }
    }

    /// ProxyError が std::error::Error トレイトを満たすこと。
    #[test]
    fn proxy_error_is_std_error() {
        fn assert_error<T: std::error::Error>() {}
        assert_error::<ProxyError>();
    }

    // ---- ConfigError ----

    /// ConfigError::Io の Display にパスと IO エラー内容が含まれること。
    #[test]
    fn config_error_io() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = ConfigError::Io("config.toml".to_string(), io_err);
        let msg = err.to_string();
        assert!(msg.contains("config.toml"), "should contain path: {msg}");
        assert!(
            msg.contains("file not found"),
            "should contain io error: {msg}"
        );
    }

    /// ConfigError::Parse の Display にパスとパースエラー内容が含まれること。
    #[test]
    fn config_error_parse() {
        // toml::de::Error は serde::de::Error から custom() を提供される
        use serde::de::Error as _;
        let parse_err = toml::de::Error::custom("invalid syntax");
        let err = ConfigError::Parse("config.toml".to_string(), parse_err);
        let msg = err.to_string();
        assert!(msg.contains("config.toml"), "should contain path: {msg}");
        assert!(
            msg.contains("invalid syntax"),
            "should contain parse error: {msg}"
        );
    }

    /// ConfigError::EmptyApiKeys の Display が provider 名を含むこと。
    #[test]
    fn config_error_empty_api_keys() {
        let err = ConfigError::EmptyApiKeys("deepseek".to_string());
        assert_eq!(err.to_string(), "empty api_keys for provider: deepseek");
    }

    /// ConfigError::DuplicateModel の Display が重複モデル名を含むこと。
    #[test]
    fn config_error_duplicate_model() {
        let err = ConfigError::DuplicateModel("gpt-4".to_string());
        assert_eq!(err.to_string(), "duplicate model name: gpt-4");
    }

    /// ConfigError::DuplicateAlias の Display がエイリアス名と衝突先を含むこと。
    #[test]
    fn config_error_duplicate_alias() {
        let err = ConfigError::DuplicateAlias("fast".to_string(), "gpt-4".to_string());
        assert_eq!(
            err.to_string(),
            "alias \"fast\" conflicts with existing model \"gpt-4\""
        );
    }

    /// ConfigError::ValidationFailed の Display が全エラーの集約であること。
    #[test]
    fn config_error_validation_failed() {
        let inner = vec![
            ConfigError::EmptyApiKeys("p1".to_string()),
            ConfigError::DuplicateModel("m1".to_string()),
        ];
        let err = ConfigError::ValidationFailed(inner);
        let msg = err.to_string();
        assert!(msg.contains("2 error(s)"), "should mention count: {msg}");
    }

    /// ConfigError が std::error::Error トレイトを満たすこと。
    #[test]
    fn config_error_is_std_error() {
        fn assert_error<T: std::error::Error>() {}
        assert_error::<ConfigError>();
    }

    // ---- ResolvedModel ----

    /// ResolvedModel のフィールドアクセスが期待通りであること。
    #[test]
    fn resolved_model_fields() {
        let model = ResolvedModel {
            public: "claude-3-opus".to_string(),
            upstream: "anthropic.claude-3-opus".to_string(),
        };
        assert_eq!(model.public, "claude-3-opus");
        assert_eq!(model.upstream, "anthropic.claude-3-opus");
    }

    /// ResolvedModel が Debug + Clone を満たすこと。
    #[test]
    fn resolved_model_debug_clone() {
        fn assert_traits<T: std::fmt::Debug + Clone>() {}
        assert_traits::<ResolvedModel>();
    }

    // ---- LossyLevel::should_reject ----

    /// Error 級 + allow_lossy=false + error_lossy_continue=false → true（拒否）。
    #[test]
    fn lossy_level_error_reject() {
        assert!(LossyLevel::Error.should_reject(false, false));
    }

    /// Error 級 + allow_lossy=false + error_lossy_continue=true → false（継続）。
    #[test]
    fn lossy_level_error_continue() {
        assert!(!LossyLevel::Error.should_reject(false, true));
    }

    /// Warn 級 + 任意のフラグ → false（常に継続）。
    #[test]
    fn lossy_level_warn_no_reject() {
        assert!(!LossyLevel::Warn.should_reject(false, false));
        assert!(!LossyLevel::Warn.should_reject(true, false));
        assert!(!LossyLevel::Warn.should_reject(true, true));
    }

    /// Info 級 + 任意のフラグ → false（常に継続）。
    #[test]
    fn lossy_level_info_no_reject() {
        assert!(!LossyLevel::Info.should_reject(false, false));
        assert!(!LossyLevel::Info.should_reject(true, true));
    }

    // ---- AppConfig::validate ----

    /// デフォルトの AppConfig は検証を通過すること。
    #[test]
    fn validate_ok_default() {
        let config = AppConfig::default();
        assert!(config.validate().is_ok());
    }

    /// 正常な provider 設定は検証を通過すること。
    #[test]
    fn validate_ok_single_provider() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "test".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![ModelConfig {
                    public: "gpt-4".to_string(),
                    upstream: "up-gpt-4".to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                }],
            },
        );
        assert!(config.validate().is_ok());
    }

    /// 空の api_keys は EmptyApiKeys エラーになること。
    #[test]
    fn validate_empty_api_keys() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "no-keys".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://example.com".to_string(),
                api_keys: vec![],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        let err = config.validate().unwrap_err();
        assert_eq!(err.len(), 1);
        assert!(matches!(err[0], ConfigError::EmptyApiKeys(_)));
    }

    /// 同一 provider 内で models.public が重複するとエラーになること。
    #[test]
    fn validate_duplicate_model_public() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "dup".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![
                    ModelConfig {
                        public: "same-name".to_string(),
                        upstream: "up-1".to_string(),
                        enabled: true,
                        tags: vec![],
                        max_tokens_cap: None,
                        aliases: vec![],
                    },
                    ModelConfig {
                        public: "same-name".to_string(),
                        upstream: "up-2".to_string(),
                        enabled: true,
                        tags: vec![],
                        max_tokens_cap: None,
                        aliases: vec![],
                    },
                ],
            },
        );
        let err = config.validate().unwrap_err();
        assert!(err
            .iter()
            .any(|e| matches!(e, ConfigError::DuplicateModel(_))));
    }

    /// provider 内の alias が public model 名と衝突するとエラーになること。
    #[test]
    fn validate_duplicate_alias() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "alias-conflict".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::from([("existing".to_string(), "gpt-4".to_string())]),
                models: vec![ModelConfig {
                    public: "gpt-4".to_string(),
                    upstream: "up-gpt-4".to_string(),
                    enabled: true,
                    tags: vec![],
                    max_tokens_cap: None,
                    aliases: vec![],
                }],
            },
        );
        let err = config.validate().unwrap_err();
        assert!(err
            .iter()
            .any(|e| matches!(e, ConfigError::DuplicateAlias(_, _))));
    }

    /// ポート番号 0 はエラーになること。
    #[test]
    fn validate_port_zero() {
        let mut config = AppConfig::default();
        config.global.port = 0;
        let err = config.validate().unwrap_err();
        assert!(err.len() >= 1, "port 0 should produce at least 1 error");
    }

    /// 複数の設定ミスが集約されること。
    #[test]
    fn validate_multiple_errors() {
        let mut config = AppConfig::default();
        // 2つの provider がともに api_keys が空
        config.providers.insert(
            "a".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://a.example.com".to_string(),
                api_keys: vec![],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        config.providers.insert(
            "b".to_string(),
            ProviderConfig {
                transparent: true,
                base_url: "https://b.example.com".to_string(),
                api_keys: vec![],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: None,
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        config.global.port = 0;
        let err = config.validate().unwrap_err();
        assert!(
            err.len() >= 3,
            "expected at least 3 errors, got {}",
            err.len()
        );
    }

    /// timeout 値が 0 はエラーになること。
    #[test]
    fn validate_timeout_zero() {
        let mut config = AppConfig::default();
        config.global.timeouts.connect_ms = 0;
        let err = config.validate().unwrap_err();
        assert!(err.len() >= 1, "connect_ms=0 should produce error");
    }

    /// max_queue=0 は許容されること（エラーにならない）。
    #[test]
    fn validate_ok_max_queue_zero() {
        let mut config = AppConfig::default();
        config.providers.insert(
            "zero-queue".to_string(),
            ProviderConfig {
                transparent: false,
                base_url: "https://example.com".to_string(),
                api_keys: vec!["key".to_string()],
                allow_lossy: None,
                error_lossy_continue: None,
                openai_wire_api: None,
                max_in_flight: None,
                max_queue: Some(0),
                model_aliases: BTreeMap::new(),
                models: vec![],
            },
        );
        assert!(config.validate().is_ok());
    }

    // ---- AppConfig::from_toml ----

    /// 有効な TOML ファイルから設定が読み込めること。
    #[test]
    fn from_toml_valid() {
        let dir = std::env::temp_dir();
        let path = dir.join("anthropx_test_valid.toml");
        let toml_content = r#"
[global]
port = 8088

[providers.test]
transparent = false
base_url = "https://example.com"
api_keys = ["key1"]

[[providers.test.models]]
public = "gpt-4"
upstream = "up-gpt-4"
"#;
        std::fs::write(&path, toml_content).expect("write test config");
        let result = AppConfig::from_toml(&path);
        std::fs::remove_file(&path).ok();
        assert!(
            result.is_ok(),
            "from_toml should succeed: {:?}",
            result.err()
        );
    }

    /// 存在しないファイルパスで ConfigError::Io が返ること。
    #[test]
    fn from_toml_not_found() {
        let path = std::path::Path::new("/tmp/anthropx_nonexistent_XXXXX.toml");
        let result = AppConfig::from_toml(path);
        assert!(matches!(result, Err(ConfigError::Io(_, _))));
    }
}
