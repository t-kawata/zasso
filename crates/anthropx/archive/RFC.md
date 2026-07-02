---
merge-history:
  -
    date: 2026-07-01
    source: /Users/kawata/shyme/zasso/crates/anthropx/RFC02.md
    resolved:
      - M#1
      - M#2/M#5
      - M#3
      - M#4/m#12
      - m#6
      - m#7/m#11
      - m#8
      - m#9/m#10
      - コード品質改善
---
# LLM Bridge Proxy Server — RFC

**Status:** Proposed  
**Date:** 2026-06-19  
**Version:** 1.0  

---

## Abstract

本ドキュメントは `anthropx` crate の設計を定義する。`anthropx` は Rust で実装された Anthropic 互換 API プロキシサーバーであり、単一バイナリとして独立稼働するだけでなく、他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用する。

外向きの API 面は Anthropic Messages API (`/v1/messages`) を公開し、内部では provider ごとに **透過転送（transparent）** または **Anthropic→OpenAI 互換翻訳（translate）** を切り替えて upstream LLM provider へ中継する。プロトコル変換の中核は `llm-bridge-core` crate が担い、本 crate はルーティング・認証・スケジューリング・並行性制御・可観測性を担当する。

---

## Motivation

### 背景

Claude Code は `ANTHROPIC_BASE_URL` 環境変数で任意の Anthropic 互換エンドポイントを指定できる。しかし、複数の LLM provider（DeepSeek、Qwen、OpenAI互換など）を同時に利用する場合、Claude Code は単一のエンドポイントしか指定できないため、provider ごとにプロキシを切り替える必要があった。また、各 provider の API key 管理や model 名の差異を吸収する仕組みが欠如していた。

### 目的

1. Claude Code が単一のエンドポイントを指すだけで複数 provider を透過的に利用できるようにする
2. provider ごとの API key を起動時乱択＋round-robin で分散し、failover を提供する
3. Anthropic と OpenAI 互換 API のプロトコル差を `llm-bridge-core` で吸収する
4. **サーバーバイナリとしても、他の Rust プロジェクトに埋め込めるライブラリとしても動作する** デュアルモードを実現する

### 非目的

- モデル推論そのものは行わない
- 外部 DB・Redis・永続ジョブキューは使用しない
- 単一プロセス・メモリ内状態のみで動作する

---

## Design

### 1. 全体アーキテクチャ

#### 1.1 デュアルモード構成

`anthropx` は単一の Cargo パッケージ内に `[lib]` と `[[bin]]` を両方定義する。これにより、依存追加によるライブラリ利用と `cargo install` によるバイナリ利用の両方を単一 crate で実現する。

```rust
// Cargo.toml（要旨）
[package]
name = "anthropx"
version = "0.1.0"
edition = "2021"

[lib]
name = "anthropx"
path = "src/lib.rs"

[[bin]]
name = "anthropx"
path = "src/main.rs"

[features]
default = ["server"]
server = [
    "dep:clap",
    "dep:futures",
    "dep:http",
    "dep:tokio-util",
    "dep:tokio-stream",
    "dep:tracing-subscriber",
    "dep:metrics-exporter-prometheus",
]
integration-test = []

[dependencies]
# unconditional（library 用途でも必要）
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
toml = "0.8"
reqwest = { version = "0.12", default-features = false, features = ["json", "stream"] }
tokio = { version = "1", features = ["sync", "macros"] }
tracing = "0.1"
metrics = "0.24"
llm-bridge-core = "0.7"
sea-orm = { workspace = true }
proxmox-sortable-macro = "0.2"

# optional（server feature でのみ有効化）
clap = { version = "4", features = ["derive"], optional = true }
axum = { version = "0.8", optional = true }
futures = { version = "0.3", optional = true }
http = { version = "1", optional = true }
tokio-util = { version = "0.7", features = ["sync"], optional = true }
tokio-stream = { version = "0.1", optional = true }
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"], optional = true }
metrics-exporter-prometheus = { version = "0.16", optional = true }

[dev-dependencies]
axum-test = "16"
```

`features = ["server"]`（デフォルト有効）が Axum 以下の HTTP 依存を有効化する。server feature を無効化すると設定型とメモリ内完結ロジックのみの軽量ライブラリとして動作する。

`reqwest` と `tokio` は unconditional 依存とした。`reqwest` は `util/headers.rs` の `HeaderMap` 利用のために、`tokio` は非同期ランタイムの基本機能として library モードでも必要である。

各モジュールの feature 依存関係：

| モジュール | 依存性 | feature 要件 |
|-----------|--------|-------------|
| `config/` | serde, toml | unconditional |
| `routing/` | なし（純粋関数） | unconditional |
| `util/` | reqwest::http (HeaderMap) | unconditional |
| `provider/` | reqwest, tokio | unconditional |
| `observability/` | metrics | unconditional |
| `http/` | axum, tower | server feature |
| `lifecycle.rs` | axum | server feature |
| `main.rs` | clap, tokio(full), tracing-subscriber | server feature |

#### 1.2 モジュール構成

```
src/
├── lib.rs              # 公開API: ProxyServer, AppConfig
├── main.rs             # [[bin]] エントリポイント（CLI + 起動）
├── cli.rs              # clap 定義、-c 引数パース
├── config/
│   ├── mod.rs          # AppConfig / GlobalConfig / ProviderConfig 型定義
│   ├── parse.rs        # TOML 読み込み + Deserialize
│   └── validate.rs     # 起動時バリデーション（集約型）
├── app_state.rs        # #[cfg(feature = "server")] AppState
├── http/
│   ├── mod.rs          # Router 組立
│   ├── routes.rs       # /v1/messages, /v1/models, /healthz, /metrics
│   ├── auth.rs         # Tower middleware: クライアント認証 + upstream 認証
│   └── errors.rs       # ProxyError enum + IntoResponse
├── routing/
│   ├── mod.rs          # ProviderResolver（model 解決 + alias 解決）
│   └── scheduler.rs    # KeyScheduler（起動時乱択 + round-robin）
├── provider/
│   ├── mod.rs          # ProviderClient（transparent / translate 分岐）
│   ├── transparent.rs  # transparent mode 実装
│   ├── translate.rs    # translate mode 実装 + llm-bridge-core アダプタ
│   └── limiter.rs      # Semaphore-based concurrency limiter
├── lifecycle.rs        # #[cfg(feature = "server")] ServerHandle
├── observability/
│   ├── mod.rs          # tracing / metrics 出力（subscriber設定は行わない）
│   └── metrics.rs      # メトリクス定義（llm_bridge_* カウンタ）
└── util/
    ├── mod.rs
    ├── headers.rs      # hop-by-hop header フィルタ
    └── ids.rs          # request_id 生成
    ```

`config/` モジュールの内部構成：

- **`mod.rs`**: 型定義のみ（`AppConfig`, `GlobalConfig`, `ProviderConfig`, `ModelConfig`, `TimeoutConfig`, `GlobalLimitConfig`）を保持する。`mod parse; mod validate;` 宣言と `pub use parse::*; pub use validate::*;` による再公開を行う。
- **`parse.rs`**: TOML 読込（`AppConfig::from_toml`）。ファイル読み込み → toml デシリアライズ → `validate()` 呼び出し を実行する。
- **`validate.rs`**: 設定検証（`AppConfig::validate`, `url_prefix` 正規化, alias チェック）を集約する。

`util/` モジュールの内部構成：

- **`mod.rs`**: モジュール宣言 + 汎用ユーティリティの再公開。
- **`headers.rs`**: `build_upstream_headers()` 関数と `HOP_BY_HOP_HEADERS` 定数を保持する。

#### 1.3 システム境界

`anthropx` と `llm-bridge-core` の責務分離は以下の通り：

| レイヤー | 責務 | crate |
|----------|------|-------|
| プロトコル変換 | Anthropic↔OpenAI request/response 変換、SSE event 変換 | `llm-bridge-core` |
| HTTP ゲートウェイ | ルーティング、認証、key 選択、並行性制御、observability | `anthropx` (本crate) |

translate provider は `anthropx` 内の薄いアダプタ層を通じて `llm-bridge-core` の関数を直接呼び出す：

```rust
// provider/translate.rs — llm-bridge-core との結合インターフェース
use llm_bridge_core::{
    ApiFormat,
    transform::{
        anthropic_to_openai,
        openai_to_anthropic,
        anthropic_to_openai_responses,
        responses_to_anthropic,
        transform_stream,
    },
    model::{TransformRequest, TransformResponse, StreamState, ApiFormat},
};

/// OpenAiWireApi 設定に基づいて llm-bridge-core の ApiFormat を選択する
fn resolve_api_format(openai_wire_api: &OpenAiWireApi, base_url: &str) -> ApiFormat {
    match openai_wire_api {
        OpenAiWireApi::ChatCompletions => ApiFormat::OpenaiChat,
        OpenAiWireApi::Responses => ApiFormat::OpenaiResponses,
        OpenAiWireApi::Auto => {
            // base_url のパス末尾から自動判定
            if base_url.ends_with("/v1/chat/completions") || base_url.contains("/chat/completions") {
                ApiFormat::OpenaiChat
            } else if base_url.ends_with("/v1/responses") || base_url.contains("/responses") {
                ApiFormat::OpenaiResponses
            } else {
                // デフォルトは Chat Completions
                ApiFormat::OpenaiChat
            }
        }
    }
}
```

`lib.rs` は以下の再公開を行い、ライブラリ利用者が `anthropx::ProxyServer` としてアクセスできるようにする：

```rust
// lib.rs の再公開
pub use lifecycle::ProxyServer;
```

これにより以下の利用例が成立する：

```rust
use anthropx::{AppConfig, ProxyServer};

let config = AppConfig::default();
let handle = ProxyServer::start(config).await.unwrap();
```

### 2. 設定システム

設定は TOML ファイルとプログラム的構築の二刀流をサポートする。全フィールドは `pub` であり、利用者は構造体リテラルまたは `..Default::default()` で任意のフィールドだけを上書きできる。

```rust
// config/mod.rs
use std::collections::BTreeMap;

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct AppConfig {
    pub global: GlobalConfig,
    #[serde(default)]
    pub providers: BTreeMap<String, ProviderConfig>,
}

impl AppConfig {
    /// TOML ファイルから設定を読み込む
    pub fn from_toml(path: &std::path::Path) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| ConfigError::Io(path.to_string_lossy().to_string(), e))?;
        let config: Self = toml::from_str(&content)
            .map_err(|e| ConfigError::Parse(path.to_string_lossy().to_string(), e))?;
        Ok(config)
    }

    /// プログラム的に構築した設定を検証する（from_toml 内部でも呼ばれる）
    pub fn validate(&self) -> Result<(), Vec<ConfigError>> {
        let mut errors = Vec::new();
        // 集約型バリデーション: 全エラーを収集してから報告する
        // ... 検証ルール実装（§2.1 設定検証ルール）
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct GlobalConfig {
    pub port: u16,
    #[serde(default)]
    pub url_prefix: String,
    #[serde(default)]
    pub require_client_auth: bool,
    #[serde(default = "default_log_format")]
    pub log_format: LogFormat,
    #[serde(default)]
    pub allow_lossy: bool,
    #[serde(default)]
    pub error_lossy_continue: bool,  // Q17 決定: false がデフォルト
    #[serde(default)]
    pub timeouts: TimeoutConfig,
    #[serde(default)]
    pub limits: GlobalLimitConfig,
    #[serde(default)]
    pub aliases: BTreeMap<String, String>,
}

impl Default for GlobalConfig {
    fn default() -> Self {
        Self {
            port: 8088,
            url_prefix: String::new(),
            require_client_auth: false,
            log_format: LogFormat::Text,
            allow_lossy: false,
            error_lossy_continue: false,  // デフォルト false: Error級 lossy は拒否
            timeouts: TimeoutConfig::default(),
            limits: GlobalLimitConfig::default(),
            aliases: BTreeMap::new(),
        }
    }
}

/// provider ごとの設定。design draft の TOML 構造をそのまま型に写す。
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ProviderConfig {
    pub transparent: bool,
    pub base_url: String,
    pub api_keys: Vec<String>,
    #[serde(default)]
    pub allow_lossy: Option<bool>,
    #[serde(default)]
    pub error_lossy_continue: Option<bool>,
    #[serde(default)]
    pub openai_wire_api: Option<OpenAiWireApi>,
    #[serde(default)]
    pub max_in_flight: Option<usize>,
    #[serde(default)]
    pub max_queue: Option<usize>,
    #[serde(default)]
    pub model_aliases: BTreeMap<String, String>,
    #[serde(default)]
    pub models: Vec<ModelConfig>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct ModelConfig {
    pub public: String,
    pub upstream: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub max_tokens_cap: Option<u32>,
    #[serde(default)]
    pub aliases: Vec<String>,
}

fn default_enabled() -> bool { true }

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct TimeoutConfig {
    #[serde(default = "default_connect_ms")]
    pub connect_ms: u64,
    #[serde(default = "default_read_ms")]
    pub read_ms: u64,
    #[serde(default = "default_total_ms")]
    pub total_ms: u64,
}

impl Default for TimeoutConfig {
    fn default() -> Self {
        Self { connect_ms: 3000, read_ms: 600000, total_ms: 600000 }
    }
}

fn default_connect_ms() -> u64 { 3000 }
fn default_read_ms() -> u64 { 600000 }
fn default_total_ms() -> u64 { 600000 }

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
pub struct GlobalLimitConfig {
    #[serde(default = "default_in_flight")]
    pub default_max_in_flight: usize,
    #[serde(default = "default_queue")]
    pub default_max_queue: usize,
}

impl Default for GlobalLimitConfig {
    fn default() -> Self {
        Self { default_max_in_flight: 64, default_max_queue: 256 }
    }
}

fn default_in_flight() -> usize { 64 }
fn default_queue() -> usize { 256 }

#[derive(Debug, Clone, Copy, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OpenAiWireApi {
    Auto,
    ChatCompletions,
    Responses,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LogFormat {
    Text,
    Json,
}

fn default_log_format() -> LogFormat { LogFormat::Text }

/// model 解決結果（内部型）
pub struct ResolvedModel {
    pub public: String,
    pub upstream: String,
}
```

#### 2.1 設定検証ルール（集約型）

起動時バリデーションは全エラーを収集してから一度に報告する。これによりユーザーは1回の起動ですべての設定ミスを修正できる。

```rust
// config/validate.rs
impl AppConfig {
    /// 設定の整合性を検証する。全エラーを収集してから報告する（集約型）。
    pub fn validate(&self) -> Result<(), Vec<ConfigError>> {
        let mut errors = Vec::new();

        // 1. provider 名の一意性（BTreeMap が保証するが明示的にチェック）
        // 2. 各 provider の api_keys が 1 件以上
        for (name, provider) in &self.providers {
            if provider.api_keys.is_empty() {
                errors.push(ConfigError::EmptyApiKeys(name.clone()));
            }
        }

        // 3. models.public の provider 内一意性
        // 4. url_prefix の正規化
        self.normalize_url_prefix();
        // 5. alias key の衝突チェック（値ではなくキーが public model 名と重複しないこと）
        // 6. global alias と provider alias の競合は許容（provider優先）
        // 7. max_queue=0 は queue 無効として許容
        // 8. ポート番号範囲チェック
        // 9. timeout 値の整合性チェック

        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }
}
```

**url_prefix 正規化:**

```rust
/// url_prefix を正規化する。
///
/// - 空文字列 → 空文字列（変更なし）
/// - 先頭に `/` がない → 先頭に `/` を付与
/// - 末尾に `/` がある → 末尾の `/` を除去
///
/// # 例
///
/// | 入力 | 出力 |
/// |------|------|
/// | `""` | `""` |
/// | `"proxy"` | `"/proxy"` |
/// | `"/prefix/"` | `"/prefix"` |
/// | `"/"` | `""` |
/// | `"//"` | `""` |
fn normalize_url_prefix(prefix: &str) -> String {
    if prefix.is_empty() {
        return String::new();
    }
    let trimmed_end = prefix.trim_end_matches('/');
    if trimmed_end.is_empty() {
        return String::new();
    }
    if trimmed_end.starts_with('/') {
        trimmed_end.to_string()
    } else {
        format!("/{}", trimmed_end)
    }
}
```

**Alias Key 衝突チェック:**

alias の値（value）と public model 名を比較するのではなく、alias のキー（key）が public model 名と重複しないことをチェックする：

```rust
// 修正前（誤り）: alias_value と public_names を比較
for (alias_key, alias_value) in &provider.model_aliases {
    if public_names.contains(alias_value.as_str()) && alias_key != alias_value {
        errors.push(ConfigError::DuplicateAlias(...));
    }
}

// 修正後（正しい）: alias_key と public_names を比較
for alias_key in provider.model_aliases.keys() {
    if public_names.contains(alias_key.as_str()) {
        errors.push(ConfigError::DuplicateAlias(
            alias_key.clone(),
            format!("public model name '{}'", alias_key),
        ));
    }
}
```

**Alias 競合ログ出力:**

global alias と provider alias の競合は許容する（provider alias 優先）が、競合発生時は `tracing::info!` でのログ出力を行う。

### 3. HTTP サーバー

#### 3.1 フレームワーク

Axum 0.8 を採用する。`server` feature の下でのみ依存が有効化され、server 無効時は HTTP 依存がゼロになる。

アプリケーションの全状態を保持する `AppState` は以下の構造を持つ：

```rust
// app_state.rs
#[cfg(feature = "server")]
pub struct AppState {
    pub config: AppConfig,
    /// provider ごとの HTTP client（起動時一括生成）
    pub http_clients: HashMap<String, reqwest::Client>,
    /// provider ごとの key scheduler
    pub schedulers: HashMap<String, KeyScheduler>,
    /// provider ごとの concurrency limiter
    pub limiters: HashMap<String, ConcurrencyLimiter>,
}
```

#### 3.2 クライアント認証 + upstream 認証（Tower middleware）

クライアント認証と upstream 認証は独立した Tower Layer として実装する。

```rust
// http/auth.rs
use axum::{
    extract::Request,
    middleware::{self, Next},
    response::Response,
};
use http::header;

/// クライアント認証 Layer: require_client_auth=true の場合のみ有効
pub fn client_auth_layer(config: &GlobalConfig) -> Option<middleware::from_fn<()>> {
    if !config.require_client_auth {
        return None;  // Layer を積まない
    }
    // Bearer Token または x-api-key header を検証
    // 401（未認証）または 403（認証済みだが権限不足）を返す
}

/// upstream 認証 Layer: クライアント由来 Authorization をブロックし、
/// provider 設定の api_keys に差し替える。transparent mode では
/// さらに hop-by-hop header を除去する。
pub fn upstream_auth_layer() -> middleware::from_fn<()> {
    // provider 固有の api_key を reqwest::Client の default header として設定
    // クライアントから来た Authorization は常に削除
}
```

transparent mode の header ポリシー：

```rust
/// 転送が禁止される hop-by-hop header 一覧
const HOP_BY_HOP_HEADERS: &[&str] = &[
    "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailers",
    "transfer-encoding", "upgrade",
];

/// upstream へ送信する header を構築する（クライアント由来を安全にフィルタ）
fn build_upstream_headers(
    client_headers: &http::HeaderMap,
    provider_api_key: &str,
) -> http::HeaderMap {
    let mut headers = http::HeaderMap::new();
    for (name, value) in client_headers {
        let name_str = name.as_str().to_ascii_lowercase();
        // hop-by-hop header を除外
        if HOP_BY_HOP_HEADERS.contains(&name_str.as_str()) {
            continue;
        }
        // クライアント由来の認証 header は常に除外
        if name_str == "authorization" || name_str == "x-api-key" {
            continue;
        }
        headers.insert(name.clone(), value.clone());
    }
    // provider の認証情報で上書き
    headers.insert(
        header::AUTHORIZATION,
        format!("Bearer {}", provider_api_key).parse().unwrap(),
    );
    headers
}
```

#### 3.3 エンドポイント一覧

```rust
// http/mod.rs — Router 組立
use axum::Router;

pub fn build_router(state: Arc<AppState>) -> Router {
    let prefix = &state.config.global.url_prefix;
    Router::new()
        .route("/healthz", get(healthz))
        .route("/metrics", get(metrics_handler))
        .route("/v1/models", get(list_models))
        .route("/v1/messages", post(handle_messages))
        .layer(upstream_auth_layer())
        .layer(client_auth_layer(&state.config.global))
        .with_state(state)
        .nest(prefix, Router::new())  // url_prefix 対応
}
```

`/v1/models` は全 provider の enabled な実体 model を `provider/public` 名で列挙し、Anthropic 互換フィールドに加えて拡張情報を返す：

```rust
// http/routes.rs — /v1/models ハンドラ
/// Anthropic 互換の model 一覧を返す。拡張フィールドを含む。
async fn list_models(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let mut models = Vec::new();

    for (provider_name, provider) in &state.config.providers {
        for model in &provider.models {
            if !model.enabled {
                continue;
            }
            // Anthropic 互換の標準フィールド
            let entry = serde_json::json!({
                "id": format!("{}/{}", provider_name, model.public),
                "object": "model",
                "created": 0,  // 作成時刻情報がない場合
                "owned_by": provider_name,
                // 拡張フィールド（互換性維持のため追加）
                "display_name": model.public,
                "upstream": model.upstream,
                "enabled": model.enabled,
                "tags": model.tags,
                "aliases": model.aliases,
                "max_tokens_cap": model.max_tokens_cap,
            });
            models.push(entry);
        }
    }

    // provider 名 → public model 名で昇順ソート
    models.sort_by(|a, b| {
        let a_id = a["id"].as_str().unwrap_or("");
        let b_id = b["id"].as_str().unwrap_or("");
        a_id.cmp(b_id)
    });

    Json(serde_json::json!({
        "object": "list",
        "data": models,
    }))
}
```

`/v1/messages` のリクエスト処理フロー：

```rust
// http/routes.rs
async fn handle_messages(
    State(state): State<Arc<AppState>>,
    req: Json<serde_json::Value>,
) -> Result<Response, ProxyError> {
    // 0. request_id 生成（トレーサビリティ用）
    let request_id = generate_request_id();

    // 1. model フィールドを "provider/model" として解析
    let model_spec = req.get("model")
        .and_then(|m| m.as_str())
        .ok_or(ProxyError::MissingField("model"))?;
    let (provider_name, model_name) = parse_provider_model(model_spec)?;

    // 2. provider 解決
    let provider = state.resolve_provider(provider_name)?;

    // 3. alias 解決 → 実体 model の特定
    let resolved = state.resolve_model(provider_name, model_name)?;

    // 4. concurrency limit（Semaphore acquire）
    let _permit = provider.limiter.acquire().await
        .map_err(|_| ProxyError::QueueFull)?;

    // 5. key 選択（起動時乱択 + round-robin）
    let key_index = provider.scheduler.select_key();
    let api_key = &provider.config.api_keys[key_index];

    // 6. transparent or translate 分岐
    let is_stream = req.get("stream")
        .and_then(|s| s.as_bool())
        .unwrap_or(false);

    let span = tracing::info_span!(
        "proxy_request",
        request_id = %request_id,
        provider = %provider_name,
        public_model = %resolved.public,
        upstream_model = %resolved.upstream,
        mode = if provider.config.transparent { "transparent" } else { "translate" },
        stream = is_stream,
        key_index = key_index,
    );
    async {
        if provider.config.transparent {
            handle_transparent(state, provider, resolved, api_key, req, is_stream).await
        } else {
            handle_translate(state, provider, resolved, api_key, req, is_stream).await
        }
    }
    .instrument(span)
    .await
}
```

### 4. Provider ルーティング

#### 4.1 model 解析と alias 解決

model 指定は `provider/model` 形式を必須とする。解析は **最初の `/` のみ** で split する。

```rust
// routing/mod.rs
/// "provider/model" 文字列を最初の '/' のみで split する
/// "litellm/openai/gpt-4.1" → ("litellm", "openai/gpt-4.1")
fn parse_provider_model(spec: &str) -> Result<(&str, &str), ProxyError> {
    let slash_pos = spec.find('/')
        .ok_or_else(|| ProxyError::InvalidModel(spec.to_string()))?;
    Ok((&spec[..slash_pos], &spec[slash_pos + 1..]))
}

/// model 解決順序:
/// 1. provider 単位 alias
/// 2. global alias
/// 3. 登録済み public model 名
fn resolve_model(
    provider_name: &str,
    model_name: &str,
    provider_config: &ProviderConfig,
    global_aliases: &BTreeMap<String, String>,
) -> Result<ResolvedModel, ProxyError> {
    // 1. provider alias 解決
    if let Some(upstream) = provider_config.model_aliases.get(model_name) {
        return find_by_upstream(provider_config, upstream);
    }
    // 2. global alias 解決
    if let Some(target) = global_aliases.get(model_name) {
        // target 自体が provider/model 形式なら再帰的に解決
        if target.contains('/') {
            return resolve_full(target, global_aliases);
        }
        return find_by_upstream(provider_config, target);
    }
    // 3. public model 名で検索
    // 4. allow-list が空なら任意の文字列を許可（upstream にそのまま送信）
    // 5. それ以外は 400
}
```

#### 4.2 API key スケジューラ

起動時に provider ごとに開始 index を乱択し、以後は atomic な round-robin で進める。

```rust
// routing/scheduler.rs
use std::sync::atomic::{AtomicUsize, Ordering};

/// スレッドセーフな key スケジューラ
pub struct KeyScheduler {
    keys: Vec<String>,
    current: AtomicUsize,
}

impl KeyScheduler {
    /// 起動時にランダムな開始位置を選ぶ
    pub fn new(keys: Vec<String>) -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let start = (seed % keys.len() as u128) as usize;
        Self {
            keys,
            current: AtomicUsize::new(start),
        }
    }

    /// 次の key を round-robin で選択する
    pub fn select_key(&self) -> &str {
        // Relaxed ordering: 正確な順序よりもパフォーマンス優先
        let prev = self.current.fetch_add(1, Ordering::Relaxed);
        &self.keys[prev % self.keys.len()]
    }

    /// 利用可能な key の総数
    pub fn key_count(&self) -> usize {
        self.keys.len()
    }

    /// provider 識別子（debug / metrics 用、簡易実装）
    pub fn provider_name(&self) -> &str {
        "unknown"  // 実際は AppState から設定
    }
}
```

non-stream request の failover 動作：

```rust
/// key failover 付きリクエスト実行（non-stream のみ）
async fn execute_with_failover(
    client: &reqwest::Client,
    scheduler: &KeyScheduler,
    request: reqwest::RequestBuilder,
) -> Result<reqwest::Response, ProxyError> {
    let max_attempts = scheduler.key_count().min(3);  // 最大3回
    let mut last_error = None;

    for attempt in 0..max_attempts {
        let key = scheduler.select_key();
        let response = request
            .try_clone()
            .ok_or(ProxyError::Internal("request not cloneable".into()))?
            .bearer_auth(key)
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => return Ok(resp),
            Ok(resp) if resp.status().is_server_error() => {
                // 5xx は failover
                metrics::counter!("llm_bridge_key_failover_total",
                    "provider" => scheduler.provider_name(),
                ).increment(1);
                last_error = Some(ProxyError::Upstream(resp.status()));
            }
            Ok(resp) => return Ok(resp),  // 4xx は failover せず返す
            Err(e) => {
                last_error = Some(ProxyError::UpstreamError(e.to_string()));
            }
        }
    }
    Err(last_error.unwrap_or(ProxyError::UpstreamError("all keys failed".into())))
}
```

stream request では failover せず、最初のエラーで即座に終端する：

```rust
/// streaming の failover ポリシー: 一切の failover を行わない
async fn execute_stream(
    client: &reqwest::Client,
    scheduler: &KeyScheduler,
    request: reqwest::RequestBuilder,
) -> Result<reqwest::Response, ProxyError> {
    let key = scheduler.select_key();
    let response = request
        .bearer_auth(key)
        .send()
        .await
        .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;

    if !response.status().is_success() {
        return Err(ProxyError::Upstream(response.status()));
    }
    Ok(response)
}
```

### 5. Provider モード

#### 5.1 Transparent mode

upstream への HTTP リクエストを安全に透過中継する。hop-by-hop header の除去と認証情報の差し替えを行う。

```rust
// provider/transparent.rs
pub async fn handle_transparent(
    state: Arc<AppState>,
    provider: &ProviderClient,
    resolved: &ResolvedModel,
    api_key: &str,
    body: serde_json::Value,
    is_stream: bool,
) -> Result<Response, ProxyError> {
    let upstream_url = format!(
        "{}/v1/messages",
        provider.config.base_url.trim_end_matches('/')
    );

    let mut req_builder = provider.http_client
        .post(&upstream_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");

    // upstream model 名に書き換え
    let mut upstream_body = body;
    upstream_body["model"] = serde_json::json!(resolved.upstream);
    req_builder = req_builder.json(&upstream_body);

    if is_stream {
        req_builder = req_builder.header("Accept", "text/event-stream");
    }

    let upstream_resp = req_builder
        .send()
        .await
        .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;

    if is_stream {
        Ok(stream_response(upstream_resp).await)
    } else {
        Ok(json_response(upstream_resp).await)
    }
}
```

#### 5.2 Translate mode

`llm-bridge-core` を用いて Anthropic request を OpenAI 互換に変換し、upstream へ送出、応答を Anthropic 互換に戻す。

```rust
// provider/translate.rs
use axum::body::Body;
use tokio_util::sync::CancellationToken;

pub async fn handle_translate(
    state: &AppState,
    provider: &ProviderConfig,
    resolved: &ResolvedModel,
    api_key: &str,
    body: Value,
    is_stream: bool,
    cancel: CancellationToken,
) -> Result<Response<Body>, ProxyError> {
    let api_format = resolve_api_format(
        &provider.openai_wire_api.unwrap_or(OpenAiWireApi::Auto),
        &provider.base_url,
    );

    // Step 1: Anthropic request → OpenAI 互換 request に変換
    let transform_req = TransformRequest {
        headers: HashMap::new(),
        path: "/v1/messages".into(),
        body: serde_json::to_vec(&body)
            .map_err(|e| ProxyError::Internal(e.to_string()))?
            .into(),
    };

    let transformed = match api_format {
        ApiFormat::OpenaiChat => anthropic_to_openai(transform_req)
            .map_err(|e| ProxyError::TransformLossy(e.to_string()))?,
        ApiFormat::OpenaiResponses => anthropic_to_openai_responses(transform_req)
            .map_err(|e| ProxyError::TransformLossy(e.to_string()))?,
        ApiFormat::AnthropicMessages => unreachable!(),
    };

    // Step 2: 変換後の request を upstream に送信
    let upstream_url = format!("{}{}", provider.base_url.trim_end_matches('/'), transformed.path);
    let upstream_resp = send_upstream_request(&provider.http_client, &upstream_url, transformed.body, is_stream).await?;

    if is_stream {
        // Step 3 (stream): OpenAI SSE → Anthropic SSE にチャンク単位で変換（§8 translate_stream 参照）
        translate_stream(upstream_resp, &stream_state, cancel).await
    } else {
        // Step 3 (non-stream): OpenAI response → Anthropic response
        let upstream_body: serde_json::Value = upstream_resp.json().await?;
        let transform_resp = TransformResponse {
            headers: HashMap::new(),
            path: "/v1/messages".into(),
            body: serde_json::to_vec(&upstream_body)?.into(),
        };
        let anthropic_resp = match api_format {
            ApiFormat::OpenaiChat => openai_to_anthropic(transform_resp)
                .map_err(|e| ProxyError::TransformLossy(e.to_string()))?,
            ApiFormat::OpenaiResponses => responses_to_anthropic(transform_resp)
                .map_err(|e| ProxyError::TransformLossy(e.to_string()))?,
            ApiFormat::AnthropicMessages => unreachable!(),
        };
        // Anthropic 互換 JSON として返却
        let anthropic_body: serde_json::Value = serde_json::from_slice(&anthropic_resp.body)
            .map_err(|e| ProxyError::Internal(e.to_string()))?;
        Ok(Json(anthropic_body).into_response())
    }
}
```

### 6. Lossy Translation 制御

lossy downgrade は Error / Warn / Info の3段階に分類する。`allow_lossy` と `error_lossy_continue` の2つのフラグで動作を制御する。

```rust
/// Lossy downgrade の重大度
pub enum LossyLevel {
    /// 機能欠落によりリクエストが成立しない（Thinking, CacheControl など）
    /// allow_lossy=false → 400 Bad Request
    /// allow_lossy=true + error_lossy_continue=false → 400 Bad Request
    /// allow_lossy=true + error_lossy_continue=true → 続行（metrics + warn log）
    Error,
    /// 代替動作で続行可能（一部パラメータの近似、デフォルト値補完など）
    /// allow_lossy=false → 続行 + metrics + log
    /// allow_lossy=true → 続行 + metrics + log
    Warn,
    /// 無視されても影響が軽微（未知のメタデータフィールドなど）
    /// allow_lossy の値に関わらず無視 + debug log
    Info,
}
```

lossy 発生時の動作決定テーブル：

| allow_lossy | error_lossy_continue | Error級 | Warn級 | Info級 |
|-------------|---------------------|---------|--------|--------|
| false (default) | false | 400拒否 | 続行+metrics | 続行+debug |
| true | false | 400拒否 | 続行+metrics | 続行+debug |
| true | true | 続行+metrics | 続行+metrics | 続行+debug |

```rust
impl LossyLevel {
    pub fn should_reject(&self, allow_lossy: bool, error_lossy_continue: bool) -> bool {
        matches!(self, LossyLevel::Error)
            && !allow_lossy
            && !error_lossy_continue
    }
}
```

#### 6.1 現状の制約: `allow_lossy=true + error_lossy_continue=true` の未達

`allow_lossy` と `error_lossy_continue` の真理値表に基づく `LossyLevel::should_reject()` は正しく実装されている。問題は `allow_lossy=true + error_lossy_continue=true` の場合に Error 級 lossy が発生した際、`llm_bridge_core` の変換 API が部分的な変換結果を返せない設計にある。

| allow_lossy | error_lossy_continue | LossyLevel | 現状の動作 | 正しい動作 |
|-------------|---------------------|------------|-----------|-----------|
| false       | false               | Error      | 400 拒否 ✅ | 400 拒否 |
| false       | false               | Warn       | 続行 ✅ | 続行 |
| true        | false               | Error      | 400 拒否 ✅ | 400 拒否 |
| true        | true                | Error      | Err 返却 ❌ | 続行+metrics |

`allow_lossy=true + error_lossy_continue=true` の場合のみ契約未達であり、このケースで Error 級 lossy を続行できない原因は llm-bridge-core の API 制約によるものである。

#### 6.2 解決戦略: Lossy-Tolerant 変換 API（llm-bridge-core 側）

llm-bridge-core 側に「損失許容型」変換 API を追加する：

```rust
// llm-bridge-core に追加する API（設計案）
/// 変換結果。損失フィールドの情報を含む。
pub struct TransformResult<T> {
    /// 変換済みデータ（損失フィールドは省略または代替値で埋められる）
    pub data: T,
    /// 損失が発生したフィールドの一覧
    pub lossy_fields: Vec<LossyField>,
}

/// 損失が発生した個別フィールド
pub struct LossyField {
    pub name: String,
    pub level: LossyLevel,
    pub detail: String,
}

/// 損失許容型変換 — 損失フィールドは省略されるが、変換自体は成功する
pub fn anthropic_to_openai_lossy(
    request: TransformRequest,
) -> Result<TransformResult<TransformedRequest>, TransformError> {
    let transformed = anthropic_to_openai(request.clone())?;
    let lossy_fields = detect_lossy_fields(&request, &transformed);
    Ok(TransformResult { data: transformed, lossy_fields })
}
```

#### 6.3 anthropx 側の適応（将来対応）

llm-bridge-core の lossy-tolerant API が利用可能になった後、anthropx 側の lossy 処理を以下の方針で修正する：

- non-stream path: `anthropic_to_openai_lossy()` を呼び出し、損失フィールドをログとメトリクスに記録する
- stream path: 各チャンクの変換結果に損失フィールドが含まれる場合、続行＋メトリクス記録を行う

#### 6.4 移行期間中の動作

llm-bridge-core の lossy-tolerant API が利用可能になるまでの間、`allow_lossy=true + error_lossy_continue=true` の組み合わせでは Error 級 lossy 発生時に 400 エラーを返す（現状維持）。この制約は `allow_lossy` フィールドのドキュメントコメントで明示する。

```rust
/// allow_lossy フィールド
///
/// # 現状の制約
///
/// `allow_lossy=true + error_lossy_continue=true` の場合でも Error 級 lossy が
/// 発生した場合はエラーを返す。これは llm-bridge-core の変換 API が部分結果を
/// 返せない設計による制約である。llm-bridge-core の lossy-tolerant API が
/// 利用可能になり次第、本制約は解消される。
#[serde(default)]
pub allow_lossy: bool,
```

### 7. 並行性制御

provider ごとに `tokio::sync::Semaphore` を用いた backpressure 制御を行う。

```rust
// provider/limiter.rs
use tokio::sync::Semaphore;

/// 並行性制御: Semaphore-based limiter + bounded wait queue
pub struct ConcurrencyLimiter {
    semaphore: Arc<Semaphore>,
    max_queue: usize,
    current_queue: AtomicUsize,
}

impl ConcurrencyLimiter {
    pub fn new(max_in_flight: usize, max_queue: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_in_flight)),
            max_queue,
            current_queue: AtomicUsize::new(0),
        }
    }

    /// セマフォを取得する（非ブロッキング優先、ブロッキングフォールバック）。
    ///
    /// 1. try_acquire_owned() で非ブロッキング取得を試みる
    /// 2. 失敗時のみ queue 残容量チェック → fetch_add → acquire_owned().await
    ///
    /// try_acquire 成功時は current_queue を増加させないが、これは Semaphore
    /// の permits のみで in-flight 数が正確に管理されるため問題ない。
    pub async fn acquire(&self) -> Result<OwnedSemaphorePermit, LimiterError> {
        // 高速パス: 非ブロッキング
        if let Ok(permit) = self.semaphore.clone().try_acquire_owned() {
            return Ok(permit);
        }
        // 低速パス: queue 待機
        if self.current_queue.load(Ordering::Acquire) >= self.max_queue {
            return Err(LimiterError::QueueFull);
        }
        self.current_queue.fetch_add(1, Ordering::Release);
        let permit = self.semaphore.clone().acquire_owned().await
            .map_err(|_| LimiterError::Closed)?;
        self.current_queue.fetch_sub(1, Ordering::Release);
        Ok(permit)
    }
}
// acquire で取得した permit は drop 時に自動解放される。
// クライアント切断時は Future 全体が drop され permit も自動返却される。
```

### 8. Streaming SSE

SSE ストリームは `axum::body::Stream` として扱い、`tokio::select!` で client disconnect と upstream stream を多重待機する。client disconnect は Axum の `body::Body::from_stream` の receiver が drop されることで検出する（`tx.send()` が `Err` を返す）。追加のキャンセル信号として `CancellationToken` を受け取ることも可能。

```rust
// streaming SSE handler（provider/ 内で利用）
use axum::body::Body;
use futures::stream::StreamExt;
use tokio::select;

/// transparent mode の SSE ストリーム中継
///
/// `client_disconnected` は CancellationToken::cancelled() や
/// 呼び出し側が生成する Future で、外部からのキャンセル要求として機能する。
/// client disconnect は tx.send() の Err 返却でも検出されるため、
/// このパラメータを使わず None を渡しても動作する。
async fn proxy_sse_stream(
    mut upstream_stream: impl Stream<Item = Result<Bytes, reqwest::Error>> + Unpin,
    mut client_disconnected: Option<impl Future<Output = ()> + Unpin>,
) -> Response<Body> {
    let (tx, rx) = axum::body::Body::new_channel();

    tokio::spawn(async move {
        loop {
            // client disconnect 検出は主に tx.send() の Err で行う。
            // 追加のキャンセル信号（CancellationToken 等）がある場合は
            // select! で同時監視する（ここでは tx の drop 検出に絞る）。
            select! {
                chunk = upstream_stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            if tx.send(Ok(bytes)).is_err() {
                                break;  // client closed
                            }
                        }
                        Some(Err(e)) => {
                            tracing::warn!("upstream stream error: {}", e);
                            break;
                        }
                        None => break,  // upstream stream ended
                    }
                }
            }
        }
    });

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(rx))
        .unwrap()
}
```

translate mode では SSE の各 chunk を `transform_chunk()` でチャンク単位で変換し、即時送信する。

```rust
// provider/translate.rs — streaming 変換部分
use axum::body::Body;
use futures::stream::StreamExt;
use std::convert::Infallible;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// SSE チャンクを Anthropic 形式に変換する。
///
/// - `Ok(Some(bytes))`: 変換完了、クライアントに送信すべきデータあり
/// - `Ok(None)`: 変換不要（keepalive 等）、スキップ
/// - `Err(e)`: 変換エラー
fn transform_chunk(
    chunk: Bytes,
    state: &StreamState,
) -> Result<Option<Bytes>, ProxyError> {
    let transformed = state
        .transform_fn
        .as_ref()
        .ok_or(ProxyError::Internal("transform not initialized".into()))?
        .transform(chunk.as_ref())
        .map_err(|e| ProxyError::TransformLossy(e.to_string()))?;

    if transformed.is_empty() {
        return Ok(None);
    }

    let sse_event = format!("data: {}\n\n", serde_json::to_string(&transformed)?);
    Ok(Some(Bytes::from(sse_event)))
}

/// translate stream をチャンク単位で逐次変換する。
///
/// 従来の蓄積型（全チャンク受信後に一括変換）から、チャンク受信ごとに即時変換・送信する
/// リアルタイムアーキテクチャに改修する。これにより TTFU（Time To First Token）が改善される。
pub(crate) async fn translate_stream(
    upstream_response: reqwest::Response,
    stream_state: &StreamState,
    cancel: CancellationToken,
) -> Result<Response<Body>, ProxyError> {
    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(64);
    let mut upstream_stream = upstream_response.bytes_stream();
    let state = stream_state.clone();
    let cancel = cancel.clone();

    // 変換タスクを spawn
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // upstream からのチャンク受信
                chunk = upstream_stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            match transform_chunk(bytes, &state) {
                                Ok(Some(anthropic_event)) => {
                                    if tx.send(Ok(anthropic_event)).await.is_err() {
                                        break; // クライアント切断
                                    }
                                }
                                Ok(None) => continue, // 変換不要チャンク
                                Err(e) => {
                                    tracing::warn!("chunk transform error: {e}");
                                    if state.should_continue_on_lossy() {
                                        continue;
                                    }
                                    break;
                                }
                            }
                        }
                        Some(Err(e)) => {
                            tracing::error!("upstream stream error: {e}");
                            break;
                        }
                        None => break, // ストリーム正常終了
                    }
                }
                // キャンセル通知
                _ = cancel.cancelled() => {
                    tracing::info!("translate stream cancelled");
                    break;
                }
            }
        }
    });

    // SSE 応答を返す
    let body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    Ok(Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .body(body)
        .unwrap())
}
```

### 9. ライフサイクル管理

`ProxyServer::start()` は `ServerHandle` を返し、利用者はこれを介してサーバーの起動・停止を制御する。

```rust
// lifecycle.rs
use tokio_util::sync::CancellationToken;

/// サーバーライフサイクルを制御するハンドル
pub struct ServerHandle {
    cancel: CancellationToken,
    join_handle: JoinHandle<()>,
}

impl ServerHandle {
    /// サーバーに graceful shutdown を要求する
    pub async fn shutdown(self) {
        self.cancel.cancel();
        // 完了まで待機（タイムアウト付き）
        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            self.join_handle,
        ).await.ok();
    }

    /// サーバーの完了を待機する（Ctrl+C などの外部シグナル用）
    pub async fn join(self) -> Result<(), JoinError> {
        self.join_handle.await
    }
}

/// ライブラリ利用者向けエントリポイント
#[cfg(feature = "server")]
impl ProxyServer {
    /// 設定（または TOML パス）からサーバーを起動し、制御ハンドルを返す
    pub async fn start(config: AppConfig) -> Result<ServerHandle, Box<dyn std::error::Error>> {
        config.validate().map_err(|errors| {
            // 集約された全エラーを表示
            for e in &errors {
                tracing::error!("設定エラー: {}", e);
            }
            ConfigError::ValidationFailed(errors)
        })?;

        let cancel = CancellationToken::new();

        // provider ごとの Client を起動時に一括生成
        let clients = build_http_clients(&config);
        // key scheduler の初期化
        let schedulers = build_schedulers(&config);
        // concurrency limiter の初期化
        let limiters = build_limiters(&config);

        let state = Arc::new(AppState::new(config, clients, schedulers, limiters));
        let router = build_router(state.clone());

        let listener = tokio::net::TcpListener::bind((
            "0.0.0.0",
            state.config.global.port,
        )).await?;

        let join_handle = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown({
                    let cancel = cancel.clone();
                    async move { cancel.cancelled().await; }
                })
                .await
                .ok();
        });

        tracing::info!("anthropx server listening on port {}", state.config.global.port);
        Ok(ServerHandle { cancel, join_handle })
    }
}
```

バイナリモードでのエントリポイント：

```rust
// main.rs
#[cfg(feature = "server")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config_path = cli::parse_args();
    let config = AppConfig::from_toml(&config_path)?;

    // tracing subscriber の設定（バイナリ側の責務）
    tracing_subscriber::fmt()
        .with_target(true)
        .json()  // または text
        .init();

    let handle = ProxyServer::start(config).await?;

    // Ctrl+C で graceful shutdown
    handle.join().await?;
    Ok(())
}
```

### 10. 可観測性

lib crate は `tracing::info!` と `metrics::counter!` / `metrics::histogram!` を出力するのみ。subscriber や exporter の設定はバイナリ側（main.rs）の責務である。

#### 10.1 メトリクス命名規則

| 規則 | 例 |
|------|-----|
| プレフィックス: `anthropx_` | `anthropx_requests_total` |
| カウンタサフィックス: `_total` | `anthropx_requests_total` |
| ヒストグラムサフィックス: `_ms` | `anthropx_request_latency_ms` |
| ラベルは snake_case | `provider`, `mode`, `stream`, `status` |

#### 10.2 メトリクス定義

```rust
// observability/metrics.rs
use metrics::{counter, histogram, describe_counter, describe_histogram};

// server feature 時のみ Prometheus レコーダーをインストールする。
// library モードでは metrics マクロは no-op として動作する。
#[cfg(feature = "server")]
mod exporter {
    use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
    use once_cell::sync::Lazy;

    pub(crate) static METRICS_HANDLE: Lazy<PrometheusHandle> = Lazy::new(|| {
        PrometheusBuilder::new()
            .install_recorder()
            .expect("failed to install Prometheus recorder")
    });
}
#[cfg(feature = "server")]
pub(crate) use exporter::METRICS_HANDLE;

pub fn register_metrics() {
    describe_counter!(
        "anthropx_requests_total",
        "Total number of proxy requests by provider, mode, stream, status"
    );
    describe_counter!(
        "anthropx_failover_total",
        "Total number of key failover events by provider"
    );
    describe_counter!(
        "anthropx_lossy_total",
        "Total number of lossy translation events by level"
    );
    describe_histogram!(
        "anthropx_request_latency_ms",
        "Request latency in milliseconds by provider and mode"
    );
}

pub fn record_request(
    provider: &str,
    mode: &str,
    stream: bool,
    status: u16,
    latency_ms: u64,
) {
    let labels = [
        ("provider", provider),
        ("mode", mode),
        ("stream", stream.to_string().as_str()),
        ("status", status.to_string().as_str()),
    ];

    counter!("anthropx_requests_total", &labels).increment(1);
    histogram!("anthropx_request_latency_ms", &labels).record(latency_ms as f64);
}

pub fn record_failover(provider: &str) {
    counter!("anthropx_failover_total", "provider" => provider).increment(1);
}

pub fn record_lossy(level: &str) {
    counter!("anthropx_lossy_total", "level" => level).increment(1);
}
```

ヒストグラムは metrics crate のデフォルトバケット（`[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]` 秒）を使用する。カスタムバケット設定は行わない。

#### 10.3 `register_metrics` の呼び出し場所

`register_metrics()` は `ProxyServer::start` の先頭で呼び出す：

```rust
// lifecycle.rs — ProxyServer::start の先頭
pub async fn start(config: AppConfig) -> Result<ServerHandle, Box<dyn Error>> {
    register_metrics();  // メトリクス登録
    config.validate()?;
    // ...
}
```

#### 10.4 メトリクス記録の単一責任

`record_request()` は `handle_messages` の後処理で 1 度だけ呼ばれる。provider ハンドラ（`handle_transparent`, `handle_translate`）の内部では metrics 出力を行わないこと。二重計上を防ぐため、`record_request()` の呼び出しはこの 1 箇所に限定する。

#### 10.5 `/metrics` エンドポイント

```rust
// http/routes.rs
// server feature 時のみ /metrics エンドポイントで Prometheus 形式を出力
#[cfg(feature = "server")]
pub(crate) async fn metrics_handler() -> String {
    crate::observability::metrics::METRICS_HANDLE.render()
}
```

構造化ログの主要フィールド：

```rust
// プロキシリクエスト 1 件ごとの構造化ログ
tracing::info!(
    request_id = %request_id,
    provider = %provider_name,
    public_model = %resolved.public,
    upstream_model = %resolved.upstream,
    mode = "transparent",   // または "translate"
    stream = is_stream,
    selected_key_index = key_index,
    status_code = %status,
    latency_ms = %elapsed_ms,
    lossy_applied = lossy_applied,
    retry_count = retry_count,
    "proxy request completed"
);
```

### 11. エラー型

単一の `ProxyError` enum ですべてのエラーを表現し、`IntoResponse` を実装して Axum handler から `Result<T, ProxyError>` を返すだけで適切な HTTP 応答に変換する。

```rust
// http/errors.rs
use axum::response::{IntoResponse, Response};
use http::StatusCode;

#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    #[error("invalid provider: {0}")]
    UnknownProvider(String),

    #[error("invalid model: {0}")]
    InvalidModel(String),

    #[error("missing required field: {0}")]
    MissingField(&'static str),

    #[error("authentication failed")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("queue is full")]
    QueueFull,

    #[error("upstream returned {0}")]
    Upstream(StatusCode),

    #[error("upstream unreachable: {0}")]
    UpstreamError(String),

    #[error("transform error: {0}")]
    TransformLossy(String),

    #[error("request timed out")]
    Timeout,

    #[error("internal error: {0}")]
    Internal(String),

    #[error("config error: {0}")]
    Config(String),
}

impl ProxyError {
    /// HTTP ステータスコードを返す（単一の定義場所）
    pub fn status_code(&self) -> u16 {
        match self {
            Self::UnknownProvider(_)
            | Self::InvalidModel(_)
            | Self::MissingField(_)
            | Self::TransformLossy(_) => 400,
            Self::Unauthorized(_) => 401,
            Self::Forbidden(_) => 403,
            Self::QueueFull(_) => 429,
            Self::Upstream(_) | Self::UpstreamError(_) => 502,
            Self::Timeout(_) => 504,
            Self::Internal(_) | Self::Config(_) => 500,
        }
    }

    /// Anthropic 互換エラータイプ文字列を返す
    fn error_type(&self) -> &'static str {
        match self {
            Self::UnknownProvider(_) | Self::InvalidModel(_)
            | Self::MissingField(_) | Self::TransformLossy(_) => "invalid_request_error",
            Self::Unauthorized(_) => "authentication_error",
            Self::Forbidden(_) => "permission_error",
            Self::QueueFull(_) => "rate_limit_error",
            Self::Upstream(_) | Self::UpstreamError(_) => "upstream_error",
            Self::Timeout(_) => "timeout_error",
            Self::Internal(_) | Self::Config(_) => "internal_error",
        }
    }
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status_code())
            .expect("valid status code");
        let body = json!({
            "type": self.error_type(),
            "error": {
                "type": self.error_type(),
                "message": self.to_string(),
            }
        });
        (status, Json(body)).into_response()
    }
}
```

### 12. テスト戦略

テストは axum::test を用いた mock HTTP server と、実 provider 結合テストの二層構成とする。

```rust
// tests/mock_server.rs — CI で常時実行
use axum::{routing::get, Router};
use axum_test::TestServer;

async fn setup_mock_upstream() -> TestServer {
    let app = Router::new()
        .route("/v1/messages", post(mock_messages_handler))
        .route("/v1/models", get(mock_models_handler));
    TestServer::new(app).unwrap()
}

#[tokio::test]
async fn test_transparent_non_stream() {
    let mock = setup_mock_upstream().await;
    let config = AppConfig {
        // mock の URL を指す provider を設定
        // ...
    };
    let response = mock.post("/v1/messages")
        .json(&serde_json::json!({
            "model": "test-provider/test-model",
            "messages": [{"role": "user", "content": "hello"}]
        }))
        .await;
    assert_eq!(response.status_code(), 200);
}

#[tokio::test]
#[cfg_attr(not(feature = "integration-test"), ignore)]
async fn test_with_real_provider() {
    // 環境変数から API key を読み込む
    let api_key = std::env::var("ANTHROPX_TEST_DEEPSEEK_API_KEY")
        .expect("ANTHROPX_TEST_DEEPSEEK_API_KEY must be set");
    // 実プロバイダーに対する結合テスト
    // ...
}
```

#### 12.1 AC#3: Translate Non-Stream 応答形式検証

既存の `translate_non_stream_proxies_via_openai_wire` テストに応答形式の検証を追加する：

```rust
#[tokio::test]
async fn translate_non_stream_response_format() {
    let (upstream_app, _) = make_mock_upstream(true, true);
    let config = make_mock_config(upstream_app, true, vec![("m", "m")], None, None).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "translate/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(resp.status_code(), StatusCode::OK);
    let body: Value = resp.json();
    assert_eq!(body["type"], "message");
    assert!(body["content"].is_array());
    assert!(body["content"][0]["type"], "text");
    assert!(body["id"].as_str().unwrap().starts_with("msg_"));
    assert_eq!(body["model"], "translate/m");
    assert_eq!(body["role"], "assistant");
}
```

#### 12.2 AC#4: Translate Stream テスト

```rust
#[tokio::test]
async fn translate_stream_proxies_via_openai_wire() {
    let mock_sse_chunks = vec![
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
        "data: [DONE]\n\n",
    ];

    let upstream_app = axum::Router::new()
        .route("/v1/chat/completions", axum::routing::post(move || {
            let chunks = mock_sse_chunks.clone();
            async move {
                let stream = futures::stream::iter(
                    chunks.into_iter().map(|c| Ok::<_, Infallible>(Bytes::from(c)))
                );
                Response::builder()
                    .header("Content-Type", "text/event-stream")
                    .body(Body::from_stream(stream))
                    .unwrap()
            }
        }));

    let config = make_mock_config(upstream_app, false, vec![("m", "m")], None, None).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "translate/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true,
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(resp.status_code(), StatusCode::OK);
    let content_type = resp.headers().get("content-type").unwrap();
    assert!(content_type.to_str().unwrap().contains("text/event-stream"));
    let body = resp.text();
    assert!(body.contains("content_block_delta"));
}
```

#### 12.3 AC#5: Non-Stream Key Failover テスト

```rust
#[tokio::test]
async fn non_stream_key_failover_recovers_from_503() {
    let attempt = Arc::new(AtomicUsize::new(0));
    let attempt_clone = attempt.clone();

    let upstream_app = axum::Router::new()
        .route("/v1/messages", axum::routing::post(move || {
            let n = attempt_clone.fetch_add(1, Ordering::SeqCst);
            async move {
                if n == 0 {
                    (StatusCode::SERVICE_UNAVAILABLE, Json(json!({
                        "error": {"type": "overloaded", "message": "upstream busy"}
                    })))
                } else {
                    (StatusCode::OK, Json(json!({
                        "id": "msg_01", "type": "message", "role": "assistant",
                        "content": [{"type": "text", "text": "Hello"}], "model": "m",
                    })))
                }
            }
        }));

    let config = make_mock_config(
        upstream_app, true, vec![("m", "m")],
        Some(vec!["key1", "key2"]), None,
    ).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "transparent/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(resp.status_code(), StatusCode::OK);
    assert_eq!(attempt.load(Ordering::SeqCst), 2);
}
```

#### 12.4 AC#6: Stream No-Failover テスト

```rust
#[tokio::test]
async fn stream_no_failover_returns_error() {
    let upstream_app = axum::Router::new()
        .route("/v1/messages", axum::routing::post(move || {
            async move {
                (StatusCode::SERVICE_UNAVAILABLE, Json(json!({
                    "error": {"type": "overloaded", "message": "upstream busy"}
                })))
            }
        }));

    let config = make_mock_config(
        upstream_app, true, vec![("m", "m")],
        Some(vec!["key1", "key2"]), None,
    ).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "transparent/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true,
            "max_tokens": 100,
        }))
        .await;

    assert!(resp.status_code().is_server_error());
}
```

---

## Implementation

### 依存クレート

| クレート | バージョン | 用途 | feature 依存 |
|----------|-----------|------|-------------|
| `serde` / `serde_json` | 1.x | 設定・API のシリアライズ | 常時 |
| `toml` | 0.8 | 設定ファイルパース | 常時 |
| `thiserror` | 2.x | エラー型導出 | 常時 |
| `tracing` | 0.1 | 構造化ログ | 常時 |
| `metrics` | 0.24 | メトリクスカウンタ | 常時 |
| `llm-bridge-core` | 0.2 | プロトコル変換 | 常時 |
| `clap` | 4.x | CLI 引数パース | `server` |
| `axum` | 0.8 | HTTP サーバー | `server` |
| `reqwest` | 0.12 | HTTP クライアント | `server` |
| `tokio` | 1.x | 非同期ランタイム | `server` |
| `tokio-util` | 0.7 | CancellationToken | `server` |
| `futures` | 0.3 | Stream 拡張トレイト | `server` |
| `axum-test` | 16 | mock HTTP server（テスト用） | dev |

### 受け入れ基準と対応テスト

| # | 基準 | テスト方法 | CI |
|---|------|-----------|----|
| AC#1 | transparent non-stream /v1/messages | axum::test mock upstream | ✅ |
| AC#2 | transparent stream /v1/messages | axum::test mock upstream | ✅ |
| AC#3 | translate non-stream /v1/messages | axum::test mock upstream + llm-bridge-core | ✅ |
| AC#4 | translate stream /v1/messages | axum::test mock upstream + llm-bridge-core | ✅ |
| AC#5 | non-stream key failover | axum::test + 503 returning mock | ✅ |
| AC#6 | stream no-failover | axum::test + 503 returning mock | ✅ |
| AC#7 | /v1/models sorted | axum::test | ✅ |
| AC#8 | provider/model split | ユニットテスト | ✅ |
| AC#9 | queue overflow → 429 | axum::test + limit=0 config | ✅ |
| AC#10 | /metrics, /healthz 利用可能 | axum::test | ✅ |

---

## Appendix

### A. 完全な TOML 設定例

```toml
[global]
port = 8088
url_prefix = ""
require_client_auth = false
log_format = "json"
allow_lossy = true
error_lossy_continue = false

[global.timeouts]
connect_ms = 3000
read_ms = 600000
total_ms = 600000

[global.limits]
default_max_in_flight = 64
default_max_queue = 256

[global.aliases]
"claude-opus" = "deepseek/deepseek-v4-pro"
"claude-sonnet" = "deepseek/deepseek-v4-flash"

[providers.deepseek]
transparent = true
base_url = "https://api.deepseek.com/anthropic"
api_keys = ["sk-a", "sk-b"]
max_in_flight = 64
max_queue = 256

[[providers.deepseek.models]]
public = "deepseek-v4-pro"
upstream = "deepseek-v4-pro"
enabled = true
tags = ["reasoning", "premium"]
max_tokens_cap = 32000
aliases = ["opus"]
```

### B. ライブラリ利用例（crate としての埋め込み）

```rust
use anthropx::{AppConfig, ProxyServer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // プログラム的に設定を構築
    let config = AppConfig {
        providers: BTreeMap::from([
            ("my-provider".into(), ProviderConfig { /* ... */ }),
        ]),
        ..Default::default()
    };

    // サーバー起動（ServerHandle で制御）
    let handle = ProxyServer::start(config).await?;

    // 任意のタイミングで停止可能
    tokio::time::sleep(Duration::from_secs(3600)).await;
    handle.shutdown().await;

    Ok(())
}
```

### C. Crate レベル属性

`src/lib.rs` の冒頭に以下の 3 属性を設定する。これらは crate 全体に適用される不変条件である。

```rust
// lib.rs
#![forbid(unsafe_code)]
#![warn(rust_2024_compatibility)]
#![warn(missing_debug_implementations)]
```

| 属性 | 効果 | 根拠 |
|------|------|------|
| `forbid(unsafe_code)` | unsafe コードの混入をコンパイル時に禁止 | セキュリティ不変条件。例外なく全 crate で遵守 |
| `warn(rust_2024_compatibility)` | Edition 2024 移行時の互換性問題を警告 | 将来のエディション移行準備 |
| `warn(missing_debug_implementations)` | Debug 実装欠落を警告 | デバッグ容易性の確保 |

`#![warn(missing_docs)]` は本フェーズでは有効化しない。全公開アイテムへの doc コメント追加は別チケットで段階的に実施する。

### D. `error_lossy_continue` フラグの追加

Q17 の決定に基づき、`GlobalConfig` に `error_lossy_continue: bool` フィールドを追加する（デフォルト `false`）。`allow_lossy = true` かつ `error_lossy_continue = true` のときのみ、Error 級 lossy でもリクエストを続行する。

### E. 参考資料

- [llm-bridge-core docs](https://docs.rs/llm-bridge-core/latest/llm_bridge_core/)
- [llm-bridge-core repository](https://github.com/TokenFleet-AI/llm-bridge-rust)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Design Draft](docs/llm-bridge-proxy-design-draft.md)

---

*この RFC は `/grill-me-for-rfc-ja` セッションによる 18 ノードの設計判断に基づいて生成されました。*
