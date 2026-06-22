//! # 設定システム
//!
//! `anthropx` プロキシサーバーの設定システム。
//!
//! ## モジュール構成
//!
//! - [`mod.rs`](self) — 型定義（構造体・enum の宣言）
//! - [`parse`] — TOML ファイルからの設定読込（`AppConfig::from_toml()`）
//! - [`validate`] — 設定検証（`AppConfig::validate()`）
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
    #[serde(default)]
    pub global: GlobalConfig,
    /// Provider 名 → 設定 のマップ。BTreeMap によりキーがアルファベット昇順に整列する。
    #[serde(default)]
    pub providers: BTreeMap<String, ProviderConfig>,
}

// impl AppConfig のメソッドは parse.rs（from_toml）および validate.rs（validate）に分割。
// メソッドは AppConfig 型の impl ブロックとして自動的に可視となるため、
// 明示的な pub use は不要。
mod parse;
mod validate;

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
    Upstream(u16),

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

impl ProxyError {
    /// このエラーに対応する HTTP ステータスコードを返す。
    ///
    /// `IntoResponse`（`http/errors.rs`）と同じマッピングルールに従う。
    pub fn status_code(&self) -> u16 {
        match self {
            ProxyError::UnknownProvider(_)
            | ProxyError::InvalidModel(_)
            | ProxyError::MissingField(_)
            | ProxyError::TransformLossy(_) => 400,
            ProxyError::Unauthorized => 401,
            ProxyError::Forbidden => 403,
            ProxyError::QueueFull => 429,
            ProxyError::Upstream(_) | ProxyError::UpstreamError(_) => 502,
            ProxyError::Timeout => 504,
            ProxyError::Internal(_) | ProxyError::Config(_) => 500,
        }
    }

    /// このエラーに対応する Anthropic 互換エラータイプ文字列を返す。
    ///
    /// `IntoResponse`（`http/errors.rs`）で JSON body の `error.type` に使用する。
    pub fn error_type(&self) -> &'static str {
        match self {
            ProxyError::UnknownProvider(_)
            | ProxyError::InvalidModel(_)
            | ProxyError::MissingField(_)
            | ProxyError::TransformLossy(_) => "invalid_request_error",
            ProxyError::Unauthorized => "authentication_error",
            ProxyError::Forbidden => "permission_error",
            ProxyError::QueueFull => "rate_limit_error",
            ProxyError::Upstream(_) | ProxyError::UpstreamError(_) => "upstream_error",
            ProxyError::Timeout => "timeout_error",
            ProxyError::Internal(_) | ProxyError::Config(_) => "internal_error",
        }
    }
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
    /// 設定値が無効（ポート番号、タイムアウト値など）
    InvalidValue(String),
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
            Self::InvalidValue(msg) => write!(f, "invalid value: {msg}"),
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
mod tests;
