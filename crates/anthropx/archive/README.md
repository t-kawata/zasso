# anthropx — LLM Bridge Proxy Server

`anthropx` は Rust 実装の Anthropic 互換 API プロキシサーバーです。OpenAI 互換 API を提供する LLM プロバイダーに対して、Anthropic 互換のインターフェースを提供します。単一バイナリとして独立稼働するだけでなく、他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用しています。

**プロトコル変換** は `llm-bridge-core` クレートに委譲し、本 crate はルーティング、認証、API キースケジューリング、並行性制御、可観測性を担当します。

---

## 目次

1. [アーキテクチャ概要](#1-アーキテクチャ概要)
2. [モジュール構成](#2-モジュール構成)
3. [ビルド方法](#3-ビルド方法)
4. [使用方法（プロキシサーバー）](#4-使用方法プロキシサーバー)
5. [使用方法（ライブラリ）](#5-使用方法ライブラリ)
6. [TOML 設定リファレンス](#6-toml-設定リファレンス)
7. [エンドポイント一覧](#7-エンドポイント一覧)
8. [動作モード](#8-動作モード)
9. [メトリクス](#9-メトリクス)
10. [エラー応答形式](#10-エラー応答形式)
11. [テスト](#11-テスト)
12. [Feature 一覧](#12-feature-一覧)

---

## 1. アーキテクチャ概要

```
Client (Claude Code、その他 Anthropic SDK)
    │ POST /v1/messages { model: "provider/name", ... }
    ▼
┌────────────────────────────────────────────┐
│              anthropx proxy                 │
│  ┌──────────┐  ┌──────────────────────┐    │
│  │  Auth    │  │  Router              │    │
│  │  Layer   │──▶│  /v1/messages       │    │
│  │ (Tower)  │  │  /v1/models          │    │
│  └──────────┘  │  /healthz            │    │
│                │  /metrics             │    │
│                └──────────┬────────────┘    │
│                           │                 │
│              ┌────────────┴──────┐          │
│              ▼                   ▼          │
│  ┌──────────────────┐  ┌──────────────────┐ │
│  │  Transparent     │  │  Translate       │ │
│  │  (reverse proxy) │  │  (llm-bridge-core│ │
│  │                  │  │   変換)          │ │
│  └──────┬───────────┘  └──────┬───────────┘ │
│         │                     │              │
└─────────┼─────────────────────┼──────────────┘
          ▼                     ▼
     Anthropic 互換 API    OpenAI 互換 API
     (DeepSeek 等)         (Groq、Ollama 等)
```

**2つの動作モード:**

| モード | 対象 upstream | 動作 |
|--------|--------------|------|
| **Transparent** | Anthropic 互換 API（DeepSeek 等） | HTTP 的に透過中継。リクエスト/レスポンスの変換は行わず、認証・ルーティング・レート制限のみ |
| **Translate** | OpenAI 互換 API（Groq、Ollama 等） | リクエストを `llm-bridge-core` で Anthropic 形式→OpenAI 形式に変換して送信し、応答を逆変換 |

**クライアントから見ると**: 常に Anthropic 互換 API として見えます。モデル名は `provider/model` 形式で指定します（例: `deepseek/deepseek-chat`）。

---

## 2. モジュール構成

```
src/
├── lib.rs              # クレートルート。公開APIの再公開
├── main.rs             # バイナリエントリポイント（server feature 時のみ）
├── cli.rs              # CLI 引数解析（server feature 時のみ）
├── config/
│   ├── mod.rs          # 型定義（AppConfig, GlobalConfig, ProviderConfig,
│   │                   #   ModelConfig, ProxyError 等）
│   ├── parse.rs        # TOML 設定読込（AppConfig::from_toml）
│   └── validate.rs     # 設定検証（AppConfig::validate）
├── app_state.rs        # サーバー実行時状態（AppState, server feature 時のみ）
├── http/
│   ├── mod.rs          # モジュール宣言
│   ├── router.rs       # Router 定義（エンドポイント登録）
│   ├── routes.rs       # 4 つのエンドポイントハンドラ
│   ├── auth.rs         # Tower middleware 認証レイヤ
│   └── errors.rs       # ProxyError → HTTP 応答（IntoResponse 実装）
├── routing/
│   ├── mod.rs          # ルーティング純粋関数（parse_provider_model,
│   │                   #   resolve_model, resolve_api_format 等）
│   └── scheduler.rs    # API Key ラウンドロビンスケジューラ（KeyScheduler）
├── provider/
│   ├── mod.rs          # ProviderClient 構造体
│   ├── transparent.rs  # Transparent モード（透過中継 + SSE proxy）
│   ├── translate.rs    # Translate モード（プロトコル変換 + lossy 検出）
│   └── limiter.rs      # 並行性制限器（ConcurrencyLimiter, Semaphore-based）
├── lifecycle.rs        # サーバー起動・停止（ProxyServer, ServerHandle, server feature 時のみ）
├── observability/
│   ├── mod.rs          # モジュール宣言
│   └── metrics.rs      # Prometheus メトリクスカウンタ
└── util/
    ├── mod.rs          # モジュール宣言
    ├── headers.rs      # upstream ヘッダー構築（build_upstream_headers）
    └── ids.rs          # リクエスト ID 生成（generate_request_id, UUID v4）
tests/
├── mock_server.rs      # Mock upstream による統合テスト（18 テスト）
└── real_provider.rs    # 実プロバイダー結合テスト（手動実行、--features integration-test）
```

---

## 3. ビルド方法

### 3.1 前提条件

- Rust 2021 edition（Rust 1.75 以上）
- Cargo（Rust に同梱）

### 3.2 プロキシサーバーとしてビルド（デフォルト）

```bash
# プロジェクトルートに移動
cd /path/to/zasso/crates/anthropx

# デバッグビルド
cargo build

# リリースビルド（最適化有効）
cargo build --release

# 生成されるバイナリ
# ./target/debug/anthropx     （デバッグ）
# ./target/release/anthropx   （リリース）
```

`Cargo.toml` の `default = ["server"]` により、デフォルトで `server` feature が有効になります。HTTP サーバー機能（Axum、reqwest、clap 等）を含む完全なバイナリがビルドされます。

### 3.3 ライブラリとしてビルド（server feature なし）

設定型と純粋ロジック関数のみを含む軽量ライブラリとしてビルドする場合：

```bash
cargo build --no-default-features
```

このモードでは以下が利用可能です:
- 全設定型（`AppConfig`, `GlobalConfig`, `ProviderConfig` 等）
- ルーティング純粋関数（`parse_provider_model`, `resolve_model` 等）
- エラー型（`ProxyError`, `ConfigError`）
- `util/` モジュール（ヘッダー構築、ID 生成）
- `provider/limiter.rs`（並行性制限ロジックのみ）

このモードでは以下は利用不可です:
- `main.rs`（バイナリエントリポイント）
- HTTP サーバー（Axum、Router、エンドポイント）
- プロトコル変換（llm-bridge-core）
- Prometheus メトリクスエクスポーター
- CLI 引数解析（clap）
- `cli`, `app_state`, `http`, `lifecycle`, `observability` モジュール

### 3.4 Makefile 経由のビルド検証

Makefile が存在するプロジェクトルート（`/path/to/zasso`）から実行します:

```bash
# Rust（バックエンド）のみ編集時
make check-be

# フロントエンドとバックエンド両方に変更がある場合
make check-all

# 全テスト実行
make test
```

Makefile が参照できない特殊な状況でのみ、直接 `cargo check` / `cargo test` を使用します。

### 3.5 Feature gate の確認

```bash
# server feature 有効（デフォルト）— 完全なプロキシサーバー
cargo build

# server feature なし — ライブラリモード
cargo build --no-default-features

# 実プロバイダーテスト有効
cargo build --features integration-test

# 明示的に server feature を指定
cargo build --features server
```

---

## 4. 使用方法（プロキシサーバー）

### 4.1 クイックスタート

**ステップ1: 設定ファイルを作成します。**

```toml
# config.toml
[global]
port = 3910

[providers.deepseek]
transparent = true
base_url = "https://api.deepseek.com"
api_keys = ["sk-your-deepseek-api-key"]

[[providers.deepseek.models]]
public = "deepseek-chat"
upstream = "deepseek-chat"
enabled = true
```

**ステップ2: サーバーを起動します。**

```bash
./target/release/anthropx -c config.toml
```

正常に起動すると以下のようなログが出力されます:

```
2026-06-22T12:34:56.789Z  INFO anthropx: starting server on 0.0.0.0:3910
```

**ステップ3: Anthropic SDK または HTTP クライアントからリクエストを送信します。**

```bash
curl http://localhost:3910/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

または Claude Code から:

```bash
claude --proxy http://localhost:3910
```

### 4.2 CLI 引数

```
anthropx — Anthropic compatible API proxy server

Usage: anthropx -c <CONFIG>

Options:
  -c, --config <CONFIG>  設定ファイルへのパス（TOML 形式）[必須]
  -h, --help             ヘルプを表示
  -V, --version          バージョンを表示
```

`-c` は必須引数です。省略すると clap がヘルプを表示してエラー終了します。

### 4.3 起動シーケンス

`main.rs` の起動シーケンスは以下の 6 ステップで構成されます:

1. **CLI 引数解析**: `cli::parse_args()` で `-c` で指定された設定ファイルのパスを取得します。

2. **設定読み込み**: `AppConfig::from_toml(&cli.config)` を呼び出します。
   - `std::fs::read_to_string` でファイル内容を読み込みます。
   - `toml::from_str` で TOML をデシリアライズします。
   - `self.validate()` で設定の整合性を検証します。
   - エラー時は `ConfigError` として報告され、プロセスが終了します。

3. **tracing subscriber 初期化**: `config.global.log_format` に従ってログ出力形式を設定します。
   - `"json"`: 構造化 JSON 形式で出力します。本番環境のログ集約システム（Datadog、Loki 等）向けです。
   - `"text"`: 人間可読なプレーンテキスト形式で出力します。開発環境向けです。

4. **サーバー起動**: `ProxyServer::start(config)` を呼び出します。内部では以下が順次実行されます:
   a. `metrics::register_metrics()` — Prometheus メトリクスカウンタを初期化します。
   b. `config.validate()` — 設定の整合性を再検証します（`from_toml` で既に実行済みですが、プログラム的構築のケースを考慮して二重に検証します。`url_prefix` 正規化は冪等なため問題ありません）。
   c. `CancellationToken` を生成します — graceful shutdown のシグナル伝達に使用します。
   d. `build_provider_clients(&config)` で provider ごとに以下を一括生成します:
      - `reqwest::Client`（HTTP クライアント）
      - `KeyScheduler`（API キーラウンドロビンスケジューラ）
      - `ConcurrencyLimiter`（セマフォベースの並行性制限器）
   e. `AppState::new(config, providers, cancel)` で実行時状態を構築します。
   f. `build_router(state)` で Axum Router を構築します。4 つのエンドポイント（`/healthz`, `/metrics`, `/v1/models`, `/v1/messages`）が登録されます。`url_prefix` が設定されている場合は、Router の `nest()` で prefix 配下にマウントされます。
   g. `TcpListener::bind()` で指定ポートにバインドし、`axum::serve()` で HTTP サーバーを起動します。

5. **Ctrl+C 待機**: `tokio::signal::ctrl_c()` でシャットダウンシグナルを待機します。

6. **Graceful shutdown**: `handle.shutdown()` を呼び出します。
   - `CancellationToken` を発火し、全 in-flight リクエストに中断シグナルを送信します。
   - 最大 30 秒間待機して全タスクの完了を確認します。
   - タイムアウトした場合は強制終了します。

---

## 5. 使用方法（ライブラリ）

### 5.1 Cargo.toml への追加

```toml
[dependencies]
anthropx = { path = "/path/to/zasso/crates/anthropx" }
```

HTTP サーバー機能を利用する場合:

```toml
[dependencies]
anthropx = { path = "/path/to/zasso/crates/anthropx", features = ["server"] }
```

### 5.2 設定をプログラム的に構築する（server feature 不要）

```rust
use std::collections::BTreeMap;
use anthropx::{AppConfig, ConfigError, LossyLevel, ProxyError};

let mut config = AppConfig::default();

// サーバー全体設定
config.global.port = 3910;
config.global.allow_lossy = true;
config.global.error_lossy_continue = false;

// タイムアウトのカスタマイズ
config.global.timeouts.connect_ms = 5000;
config.global.timeouts.read_ms = 300_000;
config.global.timeouts.total_ms = 600_000;

// プロバイダー設定
config.providers.insert(
    "deepseek".to_string(),
    anthropx::config::ProviderConfig {
        transparent: true,
        base_url: "https://api.deepseek.com".to_string(),
        api_keys: vec!["sk-xxx".to_string()],
        allow_lossy: None,                 // None で global 設定を継承
        error_lossy_continue: None,        // None で global 設定を継承
        openai_wire_api: None,             // None で Auto
        max_in_flight: None,               // None で global.limits.default_max_in_flight を継承
        max_queue: None,                   // None で global.limits.default_max_queue を継承
        model_aliases: BTreeMap::new(),
        models: vec![
            anthropx::config::ModelConfig {
                public: "deepseek-chat".to_string(),
                upstream: "deepseek-chat".to_string(),
                enabled: true,
                tags: vec!["chat".to_string()],
                max_tokens_cap: None,
                aliases: vec![],
            },
        ],
    },
);

// 設定検証（全エラーを収集して一度に報告）
if let Err(errors) = config.validate() {
    for e in &errors {
        eprintln!("設定エラー: {e}");
    }
}
```

### 5.3 設定を TOML ファイルから読み込む（server feature 不要）

```rust
use anthropx::AppConfig;
use std::path::Path;

let config = AppConfig::from_toml(Path::new("config.toml"))
    .expect("設定ファイルの読み込みに失敗しました");
```

`from_toml` は内部で自動的に `validate()` を呼び出します。エラー時は `ConfigError` が返されます:
- `ConfigError::Io(path, source)` — ファイル読み込み失敗
- `ConfigError::Parse(path, source)` — TOML パース失敗
- `ConfigError::ValidationFailed(errors)` — 設定値の検証エラー（全エラーを含む）

### 5.4 プロキシサーバーを crate として埋め込む（server feature 必須）

```rust
use anthropx::{AppConfig, ProxyServer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // 設定を読み込む
    let config = AppConfig::from_toml(&std::path::Path::new("config.toml"))?;

    // サーバーを起動（この中で validate, build_provider_clients, AppState, Router 構築が行われる）
    let handle = ProxyServer::start(config).await?;

    // Ctrl+C で graceful shutdown
    tokio::signal::ctrl_c().await?;
    handle.shutdown().await;
    Ok(())
}
```

### 5.5 ルーティング関数を直接利用する（server feature 不要）

```rust
use anthropx::routing::parse_provider_model;
use anthropx::config::{ResolvedModel, ProxyError};
use std::collections::BTreeMap;

// "deepseek/deepseek-chat" → ("deepseek", "deepseek-chat")
let (provider_name, model_name) = parse_provider_model("deepseek/deepseek-chat")?;
assert_eq!(provider_name, "deepseek");
assert_eq!(model_name, "deepseek-chat");

// "no-slash" → Err(ProxyError::InvalidModel)
let result = parse_provider_model("no-slash");
assert!(result.is_err());

// "litellm/openai/gpt-4.1" → ("litellm", "openai/gpt-4.1") 最初のスラッシュのみで分割
let (provider, model) = parse_provider_model("litellm/openai/gpt-4.1")?;
assert_eq!(provider, "litellm");
assert_eq!(model, "openai/gpt-4.1");
```

### 5.6 型定義の直接利用（server feature 不要）

```rust
use anthropx::{
    LossyLevel,
    ProxyError,
    AppConfig,
    ConfigError,
    OpenAiWireApi,
    LogFormat,
    ResolvedModel,
};

// LossyLevel の拒否判定
assert!(LossyLevel::Error.should_reject(false, false));   // Error + 厳格設定 → true
assert!(!LossyLevel::Error.should_reject(true, false));   // Error + 許容 → false
assert!(!LossyLevel::Warn.should_reject(false, false));   // Warn + 厳格設定 → false
assert!(!LossyLevel::Info.should_reject(false, false));   // Info + 厳格設定 → false

// ProxyError のステータスコード
let err = ProxyError::InvalidModel("unknown".to_string());
assert_eq!(err.status_code(), 400);
assert_eq!(err.error_type(), "invalid_request_error");

// ProxyError の Display
let err = ProxyError::TransformLossy("image block skipped".to_string());
assert!(err.to_string().contains("transform error"));
assert!(err.to_string().contains("image block"));
```

---

## 6. TOML 設定リファレンス

設定ファイルは TOML 形式です。全フィールドにデフォルト値が設定されており、記述が必要な部分のみを記述できます。
以下のセクションでは **すべての設定項目** を網羅し、それぞれに日本語で説明を付与します。

### 6.1 トップレベル構造

```toml
[global]                            # サーバー全体設定（省略可能）
[global.timeouts]                   # タイムアウト設定
[global.limits]                     # 並行性制限デフォルト値
[global.aliases]                    # グローバルモデルエイリアス
[providers.<名前>]                  # プロバイダー設定（<名前> は任意の文字列）
[providers.<名前>.model_aliases]    # プロバイダー内モデルエイリアス
[[providers.<名前>.models]]         # モデル定義（配列。複数記述可能）
```

### 6.2 [global] — サーバー全体設定

`[global]` セクション全体を省略できます。その場合はすべてのフィールドにデフォルト値が適用されます。

```toml
[global]
```

#### `port` — リッスンポート番号

- **型**: `u16`（0〜65535 の整数）
- **デフォルト値**: `8088`
- **この項目の説明**: プロキシサーバーが HTTP リクエストを待ち受ける TCP ポート番号を指定します。
- **制約**: 0 を指定すると設定検証（`AppConfig::validate()`）でエラーになります。1 以上 65535 以下の値を指定してください。
- **補足**: 1024 未満のポート（いわゆる特権ポート）を指定する場合、プロセスを root 権限で実行するか、`CAP_NET_BIND_SERVICE` ケーパビリティを付与する必要があります。Linux の場合は `sudo setcap cap_net_bind_service=+ep ./anthropx` で付与できます。
- **設定例**:

```
port = 3910
```

#### `url_prefix` — URL プレフィックス

- **型**: `String`（文字列）
- **デフォルト値**: `""`（空文字列、プレフィックスなし）
- **この項目の説明**: リバースプロキシ（nginx、Apache 等）の背後で anthropx を運用する場合に使用します。この値を設定すると、すべてのエンドポイントが `/{url_prefix}/healthz`、`/{url_prefix}/v1/models` のようにプレフィックス付きのパスでアクセス可能になります。
- **正規化ルール**（`validate()` 内で自動的に正規化されます）:
  - 空文字列 `""` → `""`（変更なし）
  - 先頭に `/` がない場合 → 先頭に `/` が自動付与される（例: `"proxy"` → `"/proxy"`）
  - 末尾に `/` がある場合 → 末尾の `/` が自動除去される（例: `"/prefix/"` → `"/prefix"`）
  - スラッシュのみの場合 → 空文字列に正規化される（例: `"/"` → `""`、`"//"` → `""`）
- **設定例**:
  - `url_prefix = ""` — プレフィックスなし。全エンドポイントは `/healthz`、`/v1/models` 等でアクセス
  - `url_prefix = "anthropx"` — 正規化後 `"/anthropx"`。`/anthropx/healthz`、`/anthropx/v1/models` でアクセス
  - `url_prefix = "/proxy/"` — 正規化後 `"/proxy"`。`/proxy/healthz` でアクセス

```
url_prefix = ""
```

#### `require_client_auth` — クライアント認証の要否

- **型**: `bool`（`true` または `false`）
- **デフォルト値**: `false`
- **この項目の説明**: `true` に設定すると、すべての API リクエストに対して認証情報を必須にします。認証方式は以下の 2 つに対応しています:
  - `Authorization: Bearer <任意の文字列>` ヘッダー
  - `x-api-key: <任意の文字列>` ヘッダー
- **認証の検証方法**: 現時点の実装では、トークンの値そのものは検証しません。ヘッダーの有無と空でないことのみを確認します。実際の認証は upstream プロバイダーが行います。
- **認証失敗時の動作**:
  | 状態 | HTTP ステータス | error.type |
  |------|:--------------:|------------|
  | 認証ヘッダーなし | 401 | `authentication_error` |
  | ヘッダーはあるが値が空 | 401 | `authentication_error` |
  | Bearer トークンのフォーマットが不正 | 401 | `authentication_error` |
- **補足**: `false` の場合でも、upstream への認証（API キーの注入）は常に動作します。この設定はクライアント→プロキシ間の認証のみを制御します。
- **設定例**: 認証を有効にする場合:

```
require_client_auth = true
```

#### `log_format` — ログ出力形式

- **型**: `String`（`"text"` または `"json"` のいずれか）
- **デフォルト値**: `"text"`
- **この項目の説明**: tracing サブスクライバーがログを出力する形式を指定します。
- **`"text"` を指定した場合**: 人間可読なプレーンテキスト形式でログが出力されます。タイムスタンプ、ログレベル、メッセージが色付きで表示され、開発環境でのデバッグに適しています。
- **`"json"` を指定した場合**: 構造化 JSON 形式でログが出力されます。各ログ行が 1 つの JSON オブジェクトとして出力され、Datadog、Loki、Splunk 等のログ集約システムでパースして使用できます。
- **制約**: `"text"` と `"json"` 以外の値を指定すると、TOML デシリアライズ時に serde エラーになります。
- **設定例**:

```
log_format = "text"
```

#### `allow_lossy` — Lossy 変換の許容

- **型**: `bool`（`true` または `false`）
- **デフォルト値**: `false`
- **この項目の説明**: Anthropic ↔ OpenAI 間のプロトコル変換時に情報欠落（lossy）が発生する可能性があるリクエストを許容するかどうかを制御します。
- **`false`（デフォルト）に設定した場合**: 画像ブロックやツール数超過など、変換時にデータ欠落が発生するリクエストを 400 Bad Request（`invalid_request_error`）で拒否します。pre-scan 方式により、リクエストを upstream に送信する前に検出され、遮断されます。
- **`true` に設定した場合**: データ欠落が発生してもリクエストを続行します。欠落した情報は以下の方法で記録されます:
  - `tracing::warn!` ログに警告として出力
  - `anthropx_lossy_total` メトリクスカウンタが増加
  - 現在の tracing span の `lossy_applied` フィールドが `true` に設定
- **lossy 検出の対象**: `scan_anthropic_request()` による pre-scan で以下の特徴を検出します:
  | 検出対象 | 重大度 | 検出方法 |
  |---------|--------|---------|
  | `image` content block | Error | `messages[].content[].type == "image"` |
  | `tools` 配列が 128 を超過 | Error | `tools` 配列の `len()` が 128 超過 |
  | `thinking` 設定の存在 | Warn | `body["thinking"]` が `Some` |
  | 未知の content block type | Warn | `type` が既知リスト（`text`, `image`, `tool_use`, `tool_result`）にない |
- **補足**: 応答（OpenAI → Anthropic）の逆変換パスで発生する lossy イベント（未知の role の `"user"` へのマッピング等）は、llm-bridge-core の内部で `tracing::debug!` として出力されますが、anthropx の pre-scan では検出できません。これらは機能的に影響が軽微であり、許容範囲としています。
- **設定例**:

```
allow_lossy = false
```

#### `error_lossy_continue` — Error 級 lossy の継続

- **型**: `bool`（`true` または `false`）
- **デフォルト値**: `false`
- **この項目の説明**: `allow_lossy` と組み合わせて使用します。Error 級（画像ブロックのスキップ、ツール数の超過等）の lossy が検出された場合に処理を継続するかどうかを制御します。
- **`false`（デフォルト）に設定した場合**: Error 級 lossy 発生時にリクエストを拒否します。
- **`true` に設定した場合**: Error 級 lossy が発生しても続行します。
- **注意**: `allow_lossy = false` かつ `error_lossy_continue = true` の場合、`error_lossy_continue` が優先され Error 級 lossy でも続行します。つまり `error_lossy_continue` は `allow_lossy` よりも優先度の高い「強制継続」フラグとして動作します。
- **`allow_lossy` との組み合わせによる動作一覧**:

| allow_lossy | error_lossy_continue | Error 級 lossy 発生時の動作 |
|:-----------:|:-------------------:|--------------------------------|
| `false` | `false` | **リクエストを拒否**（400 Bad Request）。デフォルトの安全な設定 |
| `false` | `true` | **続行**。`error_lossy_continue` が優先される |
| `true` | `false` | **続行**。`allow_lossy` が許容する |
| `true` | `true` | **続行**。両方の設定が継続を許可する |

- **Warn 級 / Info 級の lossy**: これらの設定の影響を受けません。常に続行され、メトリクスのみ記録されます。
- **設定例**:

```
error_lossy_continue = false
```

#### `timeouts` — タイムアウト設定（ネストテーブル）

```toml
[global.timeouts]
```

##### `connect_ms` — 接続タイムアウト（ミリ秒）

- **型**: `u64`（64 ビット符号なし整数、ミリ秒単位）
- **デフォルト値**: `3000`（3 秒 = 3000 ミリ秒）
- **この項目の説明**: upstream プロバイダーへの TCP 接続確立の最大待機時間をミリ秒単位で指定します。通常のクラウド API は 1〜2 秒以内に接続が確立するため、3 秒はネットワークの一時的な不安定時も含めて十分な余裕を持たせた値です。
- **制約**: `0` を指定すると設定検証でエラーになります。
- **設定例**: 接続タイムアウトを 5 秒に延長する場合:

```
connect_ms = 5000
```

##### `read_ms` — 読み取りタイムアウト（ミリ秒）

- **型**: `u64`（64 ビット符号なし整数、ミリ秒単位）
- **デフォルト値**: `600000`（10 分 = 600,000 ミリ秒）
- **この項目の説明**: upstream プロバイダーからの応答受信の最大待機時間をミリ秒単位で指定します。LLM は長文生成時に数分かかる場合があるため、デフォルト値を長めに設定しています。ストリーミング応答の場合は、各チャンク到着間の無応答時間に対してこのタイムアウトが適用されます。
- **制約**: `0` を指定すると設定検証でエラーになります。
- **補足**: ストリーミング応答でのチャンク間隔は通常 100ms 未満ですが、極端に長い思考を行うモデル（DeepSeek-R1 等）では数分の無応答期間が発生する可能性があります。そのようなモデルを使用する場合は、`read_ms` を適宜延長してください。
- **設定例**: 読み取りタイムアウトを 5 分に短縮する場合:

```
read_ms = 300000
```

##### `total_ms` — 合計タイムアウト（ミリ秒）

- **型**: `u64`（64 ビット符号なし整数、ミリ秒単位）
- **デフォルト値**: `600000`（10 分 = 600,000 ミリ秒）
- **この項目の説明**: 接続確立から応答完全受信までの合計最大待機時間をミリ秒単位で指定します。`connect_ms + read_ms` がこの値を超える場合は、接続または読み取りのいずれかのフェーズでタイムアウトが発生します。
- **制約**: `0` を指定すると設定検証でエラーになります。
- **補足**: `read_ms` と同じ値（600000）をデフォルトとすることで、ストリーミング中に無応答状態が続いた場合のみタイムアウトが発生し、正常なストリーミング中の切断を防ぎます。
- **設定例**:

```
total_ms = 600000
```

#### `limits` — 並行性制限デフォルト値（ネストテーブル）

```toml
[global.limits]
```

##### `default_max_in_flight` — Provider あたりの最大同時実行数

- **型**: `usize`（ポインタ幅の符号なし整数。64 ビット環境では 64 ビット）
- **デフォルト値**: `64`
- **この項目の説明**: 各 provider において同時に処理可能なリクエスト数のデフォルト値を指定します。この値を超えるリクエストは内部キューの末尾で待機します。64 は小さなチームの利用には十分なスループットを提供する値です。provider 設定の `max_in_flight` で個別に上書き可能です。
- **内部実装**: `tokio::sync::Semaphore` を使用しています。`ConcurrencyLimiter::acquire()` は in-flight 上限に達すると、キューで空きを待機します。キューも満杯の場合は即座に 429 Rate Limited エラーを返します。
- **permit の自動解放**: 取得された Semaphore permit は、Future の drop 時に自動的に解放されます。クライアント切断時もカウントがリークすることはありません。
- **設定例**: 同時実行数を 16 に制限する場合:

```
default_max_in_flight = 16
```

##### `default_max_queue` — Provider あたりの最大キューイング数

- **型**: `usize`（ポインタ幅の符号なし整数）
- **デフォルト値**: `256`
- **この項目の説明**: in-flight 上限超過時にキューイング可能な最大リクエスト数を指定します。256 はバーストトラフィックを吸収しつつ、メモリ枯渇を防ぐ値です。
- **`0` を指定した場合**: キューイングを完全に無効化します。in-flight 上限に達している場合は即座に 429 Rate Limited エラーを返します。`max_queue = 0` は設定検証で許容されます（エラーになりません）。
- **キューイングの動作**: キューは楽観的カウンタ（`AtomicUsize`）で管理されます。`current_queue >= max_queue` の場合は、permit を取得せずに即座に拒否します（キューイングによるリソース枯渇を防止するため、`fetch_add` の前に `load(Acquire)` で満杯チェックを行います）。
- **設定例**: キューイングを無効化する場合:

```
default_max_queue = 0
```

#### `aliases` — グローバルモデルエイリアス（テーブル）

- **型**: テーブル（キー＝文字列、値＝文字列のマップ）
- **デフォルト値**: `{}`（空のマップ）
- **この項目の説明**: モデル名のグローバルエイリアスを定義します。値が `provider/model` 形式の場合は再帰的に解決されます。
- **解決順序**: `provider.model_aliases` → `global.aliases` → 登録済み public model 名。エイリアスの名前解決はこの順序で行われ、最初にマッチしたものが使用されます。
- **再帰的解決**: グローバルエイリアスの値が `provider/model` 形式の場合、その `model` 部分に対して再度エイリアス解決が行われます。これにより、エイリアスのチェーンを構築できます。
- **使用例**: `my-model` を `deepseek/deepseek-chat` のエイリアスとして定義する場合:

```toml
[global.aliases]
my-model = "deepseek/deepseek-chat"
```

より複雑な使用例（再帰的解決）:

```toml
[global.aliases]
best-model = "deepseek/my-best"
my-best = "deepseek-chat"     # → deepseek/deepseek-chat に解決される
```

### 6.3 [providers.\<名前\>] — プロバイダー設定

`<名前>` の部分は任意の文字列です。この名前は以下の場所で使用されます:
- `/v1/models` エンドポイントの応答における `owned_by` フィールド
- クライアントがリクエストで指定する `model` パラメータの `provider/model` 形式における provider 部分

```toml
[providers.<名前>]
```

#### `transparent` — 透過モードフラグ

- **型**: `bool`（`true` または `false`）
- **この項目は必須です**: デフォルト値はありません。必ず指定する必要があります。
- **この項目の説明**: プロキシの動作モードを指定します。
- **`true`（Transparent モード）**: リクエスト/レスポンスのプロトコル変換を行わず、HTTP 的に透過中継します。upstream が Anthropic 互換 API（DeepSeek、OpenRouter の Anthropic ルート等）を提供している場合に使用します。リクエストボディの `model` フィールドのみ、解決された `upstream` 名に書き換えられます。
- **`false`（Translate モード）**: リクエストを `llm-bridge-core` で OpenAI 形式に変換して送信し、upstream からの応答を Anthropic 形式に逆変換します。upstream が OpenAI 互換 API（Groq、Ollama、OpenAI 自身等）を提供している場合に使用します。
- **設定例**:

```
transparent = true
```

#### `base_url` — 上流 API のベース URL

- **型**: `String`（文字列、URL 形式）
- **この項目は必須です**: デフォルト値はありません。必ず指定する必要があります。
- **この項目の説明**: upstream プロバイダーの API エンドポイントのベース URL を指定します。
- **transparent モード（`transparent = true`）の場合**: この URL の末尾に `/v1/messages` を付加したパスにリクエストが転送されます。例: `base_url = "https://api.deepseek.com"` の場合、転送先は `https://api.deepseek.com/v1/messages` となります。
- **translate モード（`transparent = false`）の場合**: この URL のパス末尾から API 形式（Chat Completions または Responses）が自動判定されます。`/v1` の重複は自動的に除去されます。
- **設定例**:
  - DeepSeek（Anthropic 互換）:

```
base_url = "https://api.deepseek.com"
```
  - Groq（OpenAI 互換、Chat Completions）:

```
base_url = "https://api.groq.com/openai/v1"
```
  - Ollama（ローカル、OpenAI 互換）:

```
base_url = "http://localhost:11434/v1"
```

#### `api_keys` — API キー一覧（配列）

- **型**: `Vec<String>`（文字列の配列）
- **この項目は必須です**: デフォルト値はありません。1 件以上を指定する必要があります。空の配列は設定検証でエラーになります。
- **この項目の説明**: upstream プロバイダーの API キーを指定します。複数のキーを指定することで、以下の機能が自動的に有効になります:
  - **起動時乱択**: サーバー起動時に `SystemTime::now().duration_since(UNIX_EPOCH).as_nanos() % keys.len()` でランダムな開始インデックスが選択されます。これにより、サーバー再起動ごとにキーの使用開始位置が変わります。
  - **ラウンドロビン巡回**: `std::sync::atomic::AtomicUsize` によるアトミックなインクリメントで、各リクエストごとに順番にキーが選択されます。`fetch_add(1, Ordering::Relaxed) % keys.len()` により、キャッシュコヒーレンシトラフィックを最小化しています。
  - **Failover（non-stream リクエストのみ）**: upstream が 5xx ステータスコードを返した場合、自動的に次のキーでリクエストを再試行します。最大 3 回（キー数が不足している場合はキー数まで）再試行します。各試行はラウンドロビンの次のキーを使用します。
  - **Failover を行わないケース（stream リクエスト）**: ストリーミング応答の一貫性を保証するため、最初のキーで失敗した場合は即座にエラー終端します。キーの切り替えによるストリームの不整合を防止します。
- **制約**: 空の配列を指定すると、バリデーションエラー `ConfigError::EmptyApiKeys(provider_name)` になります。最低 1 件のキーが必要です。
- **設定例**: 単一キーの場合:

```
api_keys = ["sk-your-api-key"]
```

複数キーによる failover 設定:

```
api_keys = ["sk-primary", "sk-backup-1", "sk-backup-2"]
```

#### `allow_lossy` — Lossy 許容のプロバイダー別上書き（オプショナル）

- **型**: `Option<bool>`（`true`、`false`、または未指定）
- **デフォルト値**: `None`（未指定時は `[global]` の `allow_lossy` 設定を継承します）
- **この項目の説明**: provider 単位で `allow_lossy` 設定を上書きします。`None`（TOML でキーを省略）の場合は `[global]` セクションの値が適用されます。provider ごとに lossy 許容ポリシーを変えたい場合に使用します。
- **補足**: `allow_lossy` が `true` でも、`error_lossy_continue` が `false` の場合は、Error 級 lossy のうち拒否条件を満たすものは拒否されます。両方の設定値を組み合わせて意図したポリシーを実現してください。
- **設定例**:

```
allow_lossy = true
```

#### `error_lossy_continue` — Error 級 lossy 継続のプロバイダー別上書き（オプショナル）

- **型**: `Option<bool>`（`true`、`false`、または未指定）
- **デフォルト値**: `None`（未指定時は `[global]` の `error_lossy_continue` 設定を継承します）
- **この項目の説明**: provider 単位で `error_lossy_continue` 設定を上書きします。
- **設定例**:

```
error_lossy_continue = false
```

#### `openai_wire_api` — ワイヤー形式のプロバイダー別指定（オプショナル）

- **型**: `Option<String>`（`"Auto"`、`"ChatCompletions"`、`"Responses"` のいずれか、または未指定）
- **デフォルト値**: `None`（未指定時は `"Auto"` として動作します）
- **この項目の説明**: upstream プロバイダーの API ワイヤー形式を明示的に指定します。通常は `"Auto"` で問題ありませんが、自動判定が正しく動作しない場合に明示的に指定します。
- **各値の動作**:
  - `"Auto"`: `base_url` のパス末尾から自動判定します。`/chat/completions` を含む URL の場合は `ChatCompletions`、`/responses` を含む URL の場合は `Responses`、それ以外の場合は `ChatCompletions` として扱います。
  - `"ChatCompletions"`: OpenAI Chat Completions API（`/v1/chat/completions`）のワイヤー形式を使用します。ほとんどの OpenAI 互換プロバイダーはこの形式を採用しています。
  - `"Responses"`: OpenAI Responses API（`/v1/responses`）のワイヤー形式を使用します。
- **補足**: この設定は **translate モード（`transparent = false`）でのみ有効**です。transparent モードでは無視されます（プロトコル変換を行わないため）。
- **設定例**: Groq は Chat Completions 形式:

```
openai_wire_api = "ChatCompletions"
```

#### `max_in_flight` — 最大同時実行数のプロバイダー別上書き（オプショナル）

- **型**: `Option<usize>`（正の整数、または未指定）
- **デフォルト値**: `None`（未指定時は `[global.limits]` の `default_max_in_flight` を継承します）
- **この項目の説明**: provider 単位で最大同時実行数を上書きします。特定のプロバイダーにレート制限が厳しい場合や、逆に高スループットが求められる場合に使用します。
- **設定例**: レート制限の厳しいプロバイダーで同時実行数を 4 に制限:

```
max_in_flight = 4
```

#### `max_queue` — 最大キューのプロバイダー別上書き（オプショナル）

- **型**: `Option<usize>`（非負の整数、または未指定）
- **デフォルト値**: `None`（未指定時は `[global.limits]` の `default_max_queue` を継承します）
- **この項目の説明**: provider 単位で最大キューイング数を上書きします。`0` を指定するとキューイングを完全に無効化します（in-flight 上限超過時は即座に 429 QueueFull エラー）。
- **設定例**: キューイングを無効化する場合:

```
max_queue = 0
```

#### `model_aliases` — プロバイダー内モデルエイリアス（テーブル、オプショナル）

- **型**: テーブル（キー＝文字列、値＝文字列のマップ）
- **デフォルト値**: `{}`（空のマップ）
- **この項目の説明**: provider 内でモデル名の短縮エイリアスを定義します。エイリアス解決は、`resolve_model()` 内で以下の順序で行われます:
  1. まず `provider.model_aliases` でキーを検索
  2. 見つからない場合は `global.aliases` でキーを検索
  3. 見つからない場合は登録済みの `public` 名と一致するか検索
- **`[global.aliases]` との優先順位**: provider ローカルのエイリアスがグローバルエイリアスより優先されます。両方に同じキーが存在する場合、provider ローカルの値が使用されます。これは設定検証でエラーにはならず、許容される競合です。
- **設定例**: `dc` と入力すると `deepseek-chat` として解決される:

```toml
[providers.deepseek.model_aliases]
dc = "deepseek-chat"
```

### 6.4 [[providers.\<名前\>.models]] — モデル定義（配列）

このセクションは TOML の配列テーブル（`[[...]]`）です。同じ構造を繰り返し記述することで、複数のモデルを定義できます。

```toml
[[providers.<名前>.models]]
```

#### `public` — 公開モデル名

- **型**: `String`（文字列）
- **この項目は必須です**: デフォルト値はありません。必ず指定する必要があります。
- **この項目の説明**: クライアントに対して公開するモデル名です。クライアントは `provider/public` の形式でこの値を `model` パラメータに指定します。
- **重複の禁止**: 同一 provider 内で `public` の値が重複すると、設定検証で `ConfigError::DuplicateModel` エラーになります（`BTreeMap` のキーとは異なり独自の重複チェックが必要です）。
- **`/v1/models` での表示**: `/v1/models` エンドポイントの応答では `id` フィールドが `{provider名}/{public}` の形式で返されます。
- **設定例**:

```
public = "deepseek-chat"
```

#### `upstream` — 上流プロバイダーにおける実際のモデル名

- **型**: `String`（文字列）
- **この項目は必須です**: デフォルト値はありません。必ず指定する必要があります。
- **この項目の説明**: upstream プロバイダーに送信するリクエストで使用される実際のモデル名です。ルーティング解決後、リクエストボディの `model` フィールドがこの値に書き換えられます。
- **`parse_provider_model` での注意**: この値に `/`（スラッシュ）が含まれていても問題ありません。例えば `upstream = "openai/gpt-4.1"` のような値も有効です。
- **設定例**: 公開名と上流名が同じ場合:

```
upstream = "deepseek-chat"
```

異なる場合:

```
public = "fast-model"
upstream = "deepseek-chat"     # クライアントは "fast-model" と指定するが、実際は deepseek-chat が呼ばれる
```

#### `enabled` — モデルの有効／無効

- **型**: `bool`（`true` または `false`）
- **デフォルト値**: `true`
- **この項目の説明**: モデルの公開状態を制御します。`false` を指定すると:
  - `/v1/models` エンドポイントの応答に含まれなくなります
  - ルーティング解決時にはじかれます（`resolve_model()` が存在しないモデルとして扱います）
- **用途**: 一時的に特定のモデルを無効化したい場合や、実験段階のモデルを隠したい場合に使用します（ホワイトリスト型のモデル公開）。
- **設定例**: モデルを無効化する場合:

```
enabled = false
```

#### `tags` — モデルタグ一覧（配列）

- **型**: `Vec<String>`（文字列の配列）
- **デフォルト値**: `[]`（空の配列）
- **この項目の説明**: モデルに付与する自由文字列のタグのリストです。`/v1/models` の応答に拡張フィールドとして含まれ、クライアント側でのフィルタリングやグルーピングに使用できます。anthropx 自体はタグに対するフィルタリング処理を行いません。
- **用途**: `"chat"`、`"fast"`、`"reasoning"`、`"vision"` などのカテゴリタグや、バージョン情報タグ等、自由な用途に使用できます。
- **設定例**:

```
tags = ["chat", "fast"]
```

#### `max_tokens_cap` — 最大トークン数上限（オプショナル）

- **型**: `Option<u32>`（32 ビット符号なし整数、または未指定）
- **デフォルト値**: 未指定（`None`、トークン数無制限）
- **この項目の説明**: このモデルが受け付ける最大トークン数の上限を指定します。`None`（未指定）の場合は無制限（upstream の制限に従います）。
- **現在の実装**: `/v1/models` の拡張フィールドとして公開されますが、リクエスト時の強制キャップ（クライアントから指定された `max_tokens` がこの値を超えている場合に自動的に引き下げる処理）は現在のバージョンでは行われません。将来の機能拡張のために用意されているフィールドです。
- **設定例**: 最大 4096 トークンに制限する場合:

```
max_tokens_cap = 4096
```

#### `aliases` — モデル別エイリアス（配列、オプショナル）

- **型**: `Vec<String>`（文字列の配列）
- **デフォルト値**: `[]`（空の配列）
- **この項目の説明**: このモデルに追加のエイリアス（別名）を設定します。`model_aliases`（キー→値のマップ、エイリアス名をキーとして検索）とは異なり、こちらはモデル自身に複数の別名を持たせます。`/v1/models` の拡張フィールドとして公開されます。
- **設定例**: `deepseek-chat` モデルに `dc` と `ds` の別名を設定:

```
aliases = ["dc", "ds"]
```

### 6.5 設定検証ルール一覧

`AppConfig::validate()` は以下の全チェックを実行し、**すべてのエラーを収集してから一度に報告**します（集約型バリデーション）。これにより、ユーザーは 1 回の anthropx 起動で全ての設定ミスを把握できます。

| # | チェック内容 | エラー種別 | エラーメッセージ例 |
|---|-------------|-----------|-------------------|
| 1 | 各 provider の `api_keys` が空でない | `EmptyApiKeys(provider名)` | `empty api_keys for provider: deepseek` |
| 2 | provider 内の `models.public` に重複がない | `DuplicateModel(public名)` | `duplicate model name: deepseek-chat` |
| 3 | provider 内の `model_aliases` のキーが public model 名と衝突していない | `DuplicateAlias(alias, public名)` | `alias "dc" conflicts with existing model "deepseek-chat"` |
| 4 | 各 provider 内の `aliases`（モデル別エイリアス配列）に重複がない | `DuplicateAlias(alias, ...)` | 同上 |
| 5 | alias key 同士の重複がない | `DuplicateAlias(alias, ...)` | 同上 |
| 6 | `global.aliases` と provider alias の競合は許容（警告ログのみ） | エラーにはならない | — |
| 7 | `port` が 0 でない（1〜65535 の範囲） | `InvalidValue` | `invalid value: port must be between 1 and 65535` |
| 8 | `connect_ms` が 0 でない | `InvalidValue` | `invalid value: connect_ms must not be 0` |
| 9 | `read_ms` が 0 でない | `InvalidValue` | `invalid value: read_ms must not be 0` |
| 10 | `total_ms` が 0 でない | `InvalidValue` | `invalid value: total_ms must not be 0` |
| 11 | `url_prefix` の正規化（先頭 `/` 付与、末尾 `/` 除去、`/` のみは空文字列に） | 自動修正 | — |
| 12 | `max_queue = 0` は許容（エラーにしない） | エラーにならない | — |

---

## 7. エンドポイント一覧

anthropx は 4 つの HTTP エンドポイントを提供します。`url_prefix` が設定されている場合は、全エンドポイントの先頭に `/{url_prefix}` が自動的に付与されます（例: `url_prefix = "anthropx"` の場合、`POST /anthropx/v1/messages` でアクセス）。

### 7.1 GET /healthz — ヘルスチェックエンドポイント

- **目的**: サーバーが生きているかどうかを簡易的に確認するための liveness プローブエンドポイントです。Kubernetes や AWS ECS などのコンテナオーケストレーション環境におけるヘルスチェック、またはロードバランサーによる稼働確認に使用します。
- **認証の要否**: 不要。`require_client_auth` の設定に関わらず、このエンドポイントは常に認証なしでアクセス可能です。
- **レスポンスボディ**: `{"status": "ok"}`（固定）
- **HTTP ステータスコード**: 常に 200 OK
- **使用例**:

```bash
curl http://localhost:3910/healthz
# → {"status": "ok"}
```

### 7.2 GET /metrics — Prometheus メトリクスエンドポイント

- **目的**: Prometheus 互換フォーマットでメトリクスデータを公開するエンドポイントです。Prometheus サーバーによるスクレイピングや、Datadog Agent の OpenMetrics チェックによるメトリクス収集に使用します。
- **認証の要否**: 不要。`require_client_auth` の設定に関わらず、常に認証なしでアクセス可能です。
- **レスポンスの Content-Type**: `text/plain; charset=utf-8`
- **レスポンス形式**: Prometheus text exposition format（`metrics-exporter-prometheus` の `METRICS_HANDLE.render()` による出力）
- **HTTP ステータスコード**: 常に 200 OK
- **利用可能なメトリクス**:
  - `anthropx_requests_total` — リクエスト数（ラベル: provider, mode, stream, status）
  - `anthropx_failover_total` — failover 回数（ラベル: provider）
  - `anthropx_lossy_total` — lossy イベント数（ラベル: level）
  - `anthropx_request_latency_ms` — レイテンシヒストグラム（ラベル: provider, mode, stream, status）
- **使用例**:

```bash
curl http://localhost:3910/metrics
# 出力例:
# HELP anthropx_requests_total Total number of proxy requests by provider, mode, stream, status
# TYPE anthropx_requests_total counter
# anthropx_requests_total{provider="deepseek",mode="transparent",stream="false",status="200"} 42
# anthropx_failover_total{provider="deepseek"} 0
# anthropx_lossy_total{level="Error"} 0
# anthropx_lossy_total{level="Warn"} 0
# anthropx_lossy_total{level="Info"} 0
# HELP anthropx_request_latency_ms Request latency in milliseconds by provider and mode
# TYPE anthropx_request_latency_ms histogram
```

各メトリクスの詳細な説明は「9. メトリクス」セクションを参照してください。

### 7.3 GET /v1/models — モデル一覧エンドポイント

- **目的**: 全 provider の有効な（`enabled = true`）モデル一覧を返します。Anthropic `list models` API と互換性のある JSON 形式で応答します。Claude Code 等の Anthropic SDK はプロキシ経由でこのエンドポイントを呼び出し、利用可能なモデル一覧を取得します。
- **認証の要否**: 不要。`require_client_auth` の設定に関わらず、常に認証なしでアクセス可能です。
- **レスポンス形式**: JSON オブジェクト（`data` フィールドにモデル配列を含む）
- **HTTP ステータスコード**: 常に 200 OK
- **ソート順**: モデル ID（`"{provider名}/{public名}"`）のアルファベット昇順。`BTreeMap` による provider のソートとベクターの安定ソートにより保証されます。
- **レスポンスに含まれるモデル**: 全 provider のうち `enabled = true` のモデルのみ。`enabled = false` のモデルは含まれません。
- **レスポンスの標準フィールド**:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | string | `"{provider名}/{public名}"` 形式。クライアントが `model` パラメータに指定する値 |
| `object` | string | 固定値 `"model"`（Anthropic API 互換） |
| `created` | integer | 常に `0`（互換性のためのプレースホルダフィールド） |
| `owned_by` | string | プロバイダー名（TOML の `[providers.<名前>]` の `<名前>` 部分） |

- **レスポンスの拡張フィールド**:

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `display_name` | string | `public` と同じ値 |
| `upstream` | string | 上流プロバイダーにおける実際のモデル名 |
| `enabled` | boolean | モデルの有効状態（常に `true`、無効なモデルはレスポンスに含まれないため） |
| `tags` | string[] | モデルに付与されたタグの配列 |
| `aliases` | string[] | モデル別エイリアスの配列 |
| `max_tokens_cap` | number or null | 最大トークン数上限。未設定の場合は `null` |

- **使用例**:

```bash
curl http://localhost:3910/v1/models | jq .
```

応答例:

```json
{
  "data": [
    {
      "id": "deepseek/deepseek-chat",
      "object": "model",
      "created": 0,
      "owned_by": "deepseek",
      "display_name": "deepseek-chat",
      "upstream": "deepseek-chat",
      "enabled": true,
      "tags": ["chat", "fast"],
      "aliases": [],
      "max_tokens_cap": null
    },
    {
      "id": "deepseek/deepseek-reasoner",
      "object": "model",
      "created": 0,
      "owned_by": "deepseek",
      "display_name": "deepseek-reasoner",
      "upstream": "deepseek-reasoner",
      "enabled": true,
      "tags": ["reasoning"],
      "aliases": [],
      "max_tokens_cap": null
    }
  ]
}
```

### 7.4 POST /v1/messages — メッセージ処理エンドポイント（LLM チャット補完）

- **目的**: LLM（大規模言語モデル）に対するチャット補完リクエストを受け付け、認証検証、ルーティング、レート制限、API キー選択、プロトコル変換（必要に応じて）を適用した上で upstream に中継します。
- **認証の要否**: `require_client_auth = true` の場合は必須。`false`（デフォルト）の場合は不要。
- **リクエストボディ**: Anthropic Messages API 互換の JSON
- **レスポンス**: Anthropic Messages API 互換の JSON（non-stream 時）または SSE ストリーム（stream 時）
- **リクエスト例（non-stream）**:

```bash
curl http://localhost:3910/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek/deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

- **リクエスト例（stream）**: `stream: true` をボディに含めるか、`Accept: text/event-stream` ヘッダーを付与します:

```bash
curl http://localhost:3910/v1/messages \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "model": "deepseek/deepseek-chat",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100,
    "stream": true
  }'
```

- **内部処理フロー（詳細）**:

```text
POST /v1/messages
  │
  ├─▶ [認証 Layer] require_client_auth=true の場合、Bearer Token または x-api-key を検証
  │    失敗 → 401 Unauthorized
  │    成功 → 続行
  │
  ├─▶ [handle_messages]
  │     1. リクエストボディから "model" フィールドを抽出
  │     2. parse_provider_model() で "provider/model" を分割
  │        失敗 → 400 UnknownProvider / InvalidModel
  │     3. state.resolve_provider() で provider の存在確認
  │        失敗 → 400 UnknownProvider
  │     4. resolve_model() でエイリアス・public名解決
  │        失敗 → 400 InvalidModel
  │     5. provider.transparent に応じて Transparent / Translate を分岐
  │
  ├─▶ [ConcurrencyLimiter::acquire()]
  │     キュー満杯 → 429 QueueFull
  │     空きあり → permit 取得、続行
  │
  ├─▶ [KeyScheduler::select_key()]
  │     API キーをラウンドロビンで選択
  │
  ├─▶ Transparent モードの場合
  │     1. リクエストボディの model を upstream 名に書き換え
  │     2. クライアント由来の Authorization / x-api-key を除去
  │     3. Bearer {api_key} で認証ヘッダーを上書き
  │     4. Hop-by-hop ヘッダーを除去
  │     5. non-stream: execute_with_failover() で送信（5xx 時は別キーで再試行、最大3回）
  │     5. stream: execute_stream() で SSE 接続（failover なし）
  │     6. proxy_sse_stream() でチャンク単位の透過中継
  │
  ├─▶ Translate モードの場合
  │     1. [NEW] scan_anthropic_request() でリクエストボディを pre-scan
  │        lossy 検出 → process_lossy_events() でログ/メトリクス/拒否判定
  │        拒否 → 400 TransformLossy
  │     2. anthropic_to_openai() で Anthropic 形式 → OpenAI 形式に変換
  │        失敗 → 400/500 ProxyError
  │     3. non-stream: upstream に送信 → openai_response_to_anthropic_message() で逆変換
  │     3. stream: upstream SSE → transform_chunk() でチャンク単位逐次変換 + 即時送信
  │
  └─▶ [record_request()]
        provider / mode / stream / status / latency_ms をメトリクスに記録
```

---

## 8. 動作モード

### 8.1 Transparent モード（透過中継）

`transparent = true` を設定したプロバイダーは、HTTP リバースプロキシとして動作します。リクエスト/レスポンスのプロトコル変換は行わず、認証・ルーティング・レート制限・API キー管理のみを担当します。

**対象 upstream**: Anthropic 互換 API を提供するすべてのプロバイダー（DeepSeek、OpenRouter の Anthropic ルート、独自ホストの Anthropic 互換エンドポイント等）

**処理フロー**:

```
Client ──POST /v1/messages──▶ anthropx ──POST /v1/messages──▶ upstream (Anthropic 互換)
  │                            │                                  │
  │                            │ ① 認証検証（require_client_auth）    │
  │                            │ ② ルーティング解決（provider/model）│
  │                            │ ③ ConcurrencyLimiter でレート制限   │
  │                            │ ④ KeyScheduler で API キー選択     │
  │                            │ ⑤ リクエスト転送                  │
  │                            │ ⑥ レスポンス中継（SSE 対応）      │
  │◀───────────────────────────┤◀──────────────────────────────────┤
```

**特徴**:
- プロトコル変換は一切行いません
- リクエストボディの `model` フィールドのみ、ルーティング解決後の `upstream` 名に書き換えられます
- クライアント由来の `Authorization` / `x-api-key` ヘッダーは常に除去され、provider の API キーで上書きされます
- Hop-by-hop ヘッダー（`connection`, `keep-alive`, `proxy-authenticate`, `proxy-authorization`, `te`, `trailers`, `transfer-encoding`, `upgrade`）は転送前に除去されます
- その他のヘッダーは維持されます

**Non-stream リクエストの failover**:
- upstream が 5xx ステータスコードを返した場合、`execute_with_failover()` が自動的に次の API キーでリクエストを再試行します
- 最大 3 回（またはキー数まで）再試行します
- 各試行は `KeyScheduler.select_key()` でラウンドロビンの次のキーを使用します
- 4xx 応答の場合は failover を行わず、そのままクライアントにエラーを返します
- failover が発生するたびに `anthropx_failover_total` カウンタが増加します

**Stream リクエストの動作**:
- failover は行いません。最初のエラーでストリームを終端します
- `proxy_sse_stream()` でチャンク単位の透過中継を行います:
  - `axum::body::Body::new_channel()` でチャネルペアを作成
  - `tokio::spawn` 内で `tokio::select!` ループ
  - upstream の SSE チャンクを受信→そのままチャネルに送信
  - クライアント切断 → `tx.send()` の `Err` で検出 → break
  - upstream エラー → break（`tracing::error!` でログ出力）
  - ServerHandle の `CancellationToken` → shutdown 時に中断
- 応答ヘッダー: `Content-Type: text/event-stream`, `Cache-Control: no-cache`

### 8.2 Translate モード（プロトコル変換）

`transparent = false` を設定したプロバイダーは、`llm-bridge-core` クレートを使用して Anthropic Messages API ↔ OpenAI 互換 API 間のプロトコル変換を行います。

**対象 upstream**: OpenAI Chat Completions API または OpenAI Responses API を提供するすべてのプロバイダー（OpenAI、Groq、Ollama 等）

**Non-stream 処理フロー（3 段変換）**:

```
Client（Anthropic 形式）
  │ POST /v1/messages { model: "groq/groq-llama", ... }
  ▼
[Step 1] anthropic_to_openai()
  ├── リクエストボディを Anthropic Messages 形式から OpenAI Chat 形式に変換
  ├── システムプロンプト → 最初の system メッセージ
  ├── メッセージ配列の content ブロックを変換
  ├── tool_use / tool_result → OpenAI function calling 形式
  ├── tool_choice を OpenAI 形式にマッピング（any → required 等）
  └── Lossy 検出: image ブロックのスキップ、tools > 128 の切り捨て等
  ▼
[Step 2] Upstream 送信
  ├── 変換後の OpenAI 形式リクエストを POST
  ├── 応答ヘッダー・ステータスコードを検証
  └── 5xx → failover（non-stream のみ）
  ▼
[Step 3] openai_response_to_anthropic_message()
  ├── OpenAI Chat 応答を Anthropic Messages 形式に逆変換
  ├── choices[].message → role + content
  ├── tool_calls → tool_use ブロック
  ├── finish_reason → stop_reason（stop → end_turn 等）
  └── usage → トークン使用量のマッピング
  ▼
Client（Anthropic 形式）
```

**Stream 処理フロー（チャンク単位逐次変換 + 即時送信）**:

```
Client（Anthropic SSE）
  ▲
  │ SSE: event: message_start, data: {...}
  │ SSE: event: content_block_delta, data: {...}
  │ SSE: event: message_stop, data: {...}
  │
  │ （逐次変換 + 即時送信）
  │
[anthropx: transform_chunk() + mpsc channel]
  │
  │ step 1b: anthropic_to_openai()（リクエストのみ）
  │ step 2:  upstream SSE 接続
  │ step 3:  tokio::select! ループ:
  │            ├── upstream からチャンク受信
  │            ├── transform_stream_events() → events_to_sse()
  │            └── mpsc::tx 経由で即時クライアント送信
  │
  │ チャンク受信ごとに即時変換、蓄積なし
  │
  ▼
anthropx ←── upstream（OpenAI SSE）
           SSE: data: {"choices":[{"delta":{"content":"Hello"}}]}
           SSE: data: {"choices":[{"delta":{"content":"!"}}]}
           SSE: data: {"choices":[{"delta":{}}]}
           SSE: data: [DONE]
```

**Stream 変換のリアルタイム性**: チャンクは蓄積せず、受信ごとに即時変換されてクライアントに送信されます。これにより、TTFU（Time To First Token）が最小化されます。`tokio::select!` による制御により、upstream の受信待機中も `CancellationToken` による shutdown シグナルを監視可能です。

**Transform 関数の選択**: `openai_wire_api` の設定値と `base_url` のパスに基づいて、使用する変換関数が自動的に選択されます。

| openai_wire_api | base_url のパス | 使用される変換関数 |
|----------------|----------------|-------------------|
| Auto | `/chat/completions` を含む | `anthropic_to_openai()` / `openai_response_to_anthropic_message()` |
| Auto | `/responses` を含む | `anthropic_to_openai_responses()` / `responses_to_anthropic()` |
| Auto | 上記以外 | `anthropic_to_openai()`（Chat Completions として扱う） |
| ChatCompletions | 任意 | `anthropic_to_openai()` / `openai_response_to_anthropic_message()` |
| Responses | 任意 | `anthropic_to_openai_responses()` / `responses_to_anthropic()` |

**Lossy 変換の詳細**: 「6.2 [global] — サーバー全体設定」の `allow_lossy` / `error_lossy_continue` セクション、および「8.4 Lossy 検出（pre-scan 方式）」セクションを参照してください。

### 8.3 API キー管理（KeyScheduler）

各 provider の API キーは `KeyScheduler` によって管理されます。

**起動時**: `KeyScheduler::new(keys, provider_name)` で初期化されます。開始インデックスは `SystemTime::now().duration_since(UNIX_EPOCH).as_nanos() % keys.len()` によってランダムに決定され、サーバー再起動ごとに異なる開始位置からキーが使用されます。

**リクエスト毎**: `KeyScheduler::select_key()` が呼ばれるたびに、`current.fetch_add(1, Ordering::Relaxed) % keys.len()` でアトミックに次のキーを選択します。`Relaxed` メモリオーダリングを使用することで、正確な順序よりパフォーマンスを優先しています（キーの使用頻度は統計的に均等に分散します）。

**Failover**: non-stream リクエストでは、upstream が 5xx ステータスコードを返した場合に `execute_with_failover()` が自動的に次のキーでリクエストを再試行します。最大 3 回の再試行が行われ、試行ごとに `KeyScheduler.select_key()` で新しいキーが選択されます。再試行回数は `KeyScheduler` ではなく、`execute_with_failover()` 関数内のループカウンタで管理されます。

### 8.4 Lossy 検出（pre-scan 方式）

Translate モードでは、リクエストを upstream に送信する前に `scan_anthropic_request()` 関数でリクエストボディを走査（pre-scan）します。

**検出ルール**:

```rust
// scan_anthropic_request() の内部動作（擬似コード）
// 実際の実装は src/provider/translate.rs にあります

// 1. messages[].content[] ブロックの走査
for msg in body.messages {
    for content_block in msg.content {
        match content_block.type {
            "image"   → LossyEvent::Error("content_block.image")
            "text" | "tool_use" | "tool_result" → OK（安全）
            unknown   → LossyEvent::Warn("content_block.unknown_type")
        }
    }
}

// 2. thinking config の検出
if body.thinking.is_some() {
    LossyEvent::Warn("thinking")
}

// 3. tool count の超過チェック
if body.tools.len() > 128 {
    LossyEvent::Error("tools.overflow")
}
```

**検出後の処理フロー**:

```
scan_anthropic_request(&body)
  │
  └──▶ Vec<LossyEvent>
         │
         └──▶ process_lossy_events(events, allow_lossy, error_lossy_continue)
                │
                ├── 各 event に対して:
                │   ├── metrics::record_lossy(level) — カウンタ増加
                │   ├── Span::current().record("lossy_applied", true) — span 記録
                │   └── tracing::warn!(lossy_level, lossy_field, lossy_detail)
                │
                ├── Error 級 + should_reject() == true
                │   └── Err(ProxyError::TransformLossy) → 400 Bad Request
                │
                └── それ以外
                    └── Ok(()) → 変換処理を続行
```

---

## 9. メトリクス

anthropx は `metrics` crate（v0.24）+ `metrics-exporter-prometheus`（v0.16）を使用して、以下の Prometheus 互換メトリクスを提供します。`GET /metrics` エンドポイントで Prometheus text exposition format として取得できます。

### 9.1 anthropx_requests_total — リクエスト数カウンタ

リクエスト完了時に 1 ずつ増加するカウンタです。プロバイダー・モード・ストリーム有無・ステータスコードの 4 次元で分類されます。

```
# HELP anthropx_requests_total Total number of proxy requests by provider, mode, stream, status
# TYPE anthropx_requests_total counter
anthropx_requests_total{provider="deepseek",mode="transparent",stream="false",status="200"} 42
anthropx_requests_total{provider="deepseek",mode="transparent",stream="false",status="502"} 1
```

**ラベル**:

| ラベル名 | 取りうる値の例 | 説明 |
|---------|---------------|------|
| `provider` | `"deepseek"`, `"groq"`, `"openai"` | TOML 設定の `[providers.<名前>]` で指定した名前 |
| `mode` | `"transparent"`, `"translate"` | 動作モード。`provider.transparent` に基づく |
| `stream` | `"true"`, `"false"` | ストリーミングリクエストかどうか。リクエストボディの `stream` フィールドから判定 |
| `status` | `"200"`, `"400"`, `"502"` | HTTP ステータスコード（文字列として記録） |

### 9.2 anthropx_failover_total — Failover 回数カウンタ

API キーの failover（5xx エラー時の別キー再試行）が発生するたびに 1 ずつ増加するカウンタです。プロバイダー別に分類されます。

```
# HELP anthropx_failover_total Total number of key failover events by provider
# TYPE anthropx_failover_total counter
anthropx_failover_total{provider="deepseek"} 0
```

**ラベル**:

| ラベル名 | 取りうる値の例 | 説明 |
|---------|---------------|------|
| `provider` | `"deepseek"`, `"groq"` | failover が発生したプロバイダー名 |

### 9.3 anthropx_lossy_total — Lossy イベント数カウンタ

Lossy 変換イベントが発生するたびに 1 ずつ増加するカウンタです。lossy の重大度（Error / Warn / Info）別に分類されます。

```
# HELP anthropx_lossy_total Total number of lossy translation events by level
# TYPE anthropx_lossy_total counter
anthropx_lossy_total{level="Error"} 0
anthropx_lossy_total{level="Warn"} 0
anthropx_lossy_total{level="Info"} 0
```

**ラベル**:

| ラベル名 | 取りうる値の例 | 説明 |
|---------|---------------|------|
| `level` | `"Error"`, `"Warn"`, `"Info"` | Lossy イベントの重大度。`LossyLevel` enum の variant 名 |

### 9.4 anthropx_request_latency_ms — レイテンシヒストグラム

リクエスト処理時間（ミリ秒単位）のヒストグラムです。`metrics` crate のデフォルトバケットが使用されます（指数関数的に増加するバケット境界）。

```
# HELP anthropx_request_latency_ms Request latency in milliseconds by provider and mode
# TYPE anthropx_request_latency_ms histogram
anthropx_request_latency_ms_bucket{provider="deepseek",mode="transparent",stream="false",status="200",le="0.005"} 0
anthropx_request_latency_ms_bucket{provider="deepseek",mode="transparent",stream="false",status="200",le="0.01"} 0
anthropx_request_latency_ms_bucket{provider="deepseek",mode="transparent",stream="false",status="200",le="0.025"} 0
...
anthropx_request_latency_ms_bucket{provider="deepseek",mode="transparent",stream="false",status="200",le="+Inf"} 42
anthropx_request_latency_ms_sum{provider="deepseek",mode="transparent",stream="false",status="200"} 12345
anthropx_request_latency_ms_count{provider="deepseek",mode="transparent",stream="false",status="200"} 42
```

**ラベル**: `anthropx_requests_total` と同じ 4 つのラベル（`provider`, `mode`, `stream`, `status`）を持ちます。

---

## 10. エラー応答形式

すべてのエラー応答は Anthropic API 互換の JSON 形式で返されます。Axum handler から `Result<T, ProxyError>` を返すと、`IntoResponse` 実装（`http/errors.rs`）によって自動的に適切な HTTP 応答に変換されます。

### 10.1 エラーレスポンスの JSON 構造

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "具体的なエラーの説明"
  }
}
```

`Content-Type`: `application/json`

### 10.2 HTTP ステータスコードとエラータイプ対応表

| HTTP ステータス | error.type | ProxyError variant | 発生条件 |
|:--------------:|-----------|-------------------|---------|
| 400 Bad Request | `invalid_request_error` | `UnknownProvider` | リクエストの `model` に指定された provider 名が設定に存在しない |
| 400 Bad Request | `invalid_request_error` | `InvalidModel` | リクエストの `model` にスラッシュがない、または unknown provider にモデルが見つからない |
| 400 Bad Request | `invalid_request_error` | `MissingField` | リクエストボディに必須フィールドが欠落している |
| 400 Bad Request | `invalid_request_error` | `TransformLossy` | Pre-scan で Error 級 lossy が検出され、`allow_lossy=false + error_lossy_continue=false` |
| 401 Unauthorized | `authentication_error` | `Unauthorized` | `require_client_auth=true` で認証ヘッダーがないか無効 |
| 403 Forbidden | `permission_error` | `Forbidden` | 認証済みだが権限不足（現在の実装では未使用） |
| 429 Rate Limited | `rate_limit_error` | `QueueFull` | `ConcurrencyLimiter` のキューが満杯でリクエストを受理できない |
| 502 Bad Gateway | `upstream_error` | `Upstream(status)` | upstream プロバイダーがエラーステータスコード（4xx/5xx）を返した |
| 502 Bad Gateway | `upstream_error` | `UpstreamError` | upstream プロバイダーにネットワーク障害等で到達できない |
| 504 Gateway Timeout | `timeout_error` | `Timeout` | リクエストが接続タイムアウトまたは読み取りタイムアウトに達した |
| 500 Internal Server Error | `internal_error` | `Internal` | サーバー内部エラー（プログラミングバグ、シリアライズ失敗等） |
| 500 Internal Server Error | `internal_error` | `Config` | サーバー起動時の設定エラー（実行中は発生しない） |

### 10.3 エラーレスポンス例

**400 Bad Request — 不明なプロバイダー**:

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "invalid provider: unknown-provider"
  }
}
```

**400 Bad Request — Lossy 変換エラー**:

```json
{
  "error": {
    "type": "invalid_request_error",
    "message": "transform error: messages[].content[0].type=image: image content blocks are not supported by the upstream API and will be silently dropped"
  }
}
```

**401 Unauthorized**:

```json
{
  "error": {
    "type": "authentication_error",
    "message": "authentication failed"
  }
}
```

**502 Bad Gateway — upstream エラー**:

```json
{
  "error": {
    "type": "upstream_error",
    "message": "upstream returned 429: {\"error\":{\"message\":\"Rate limit exceeded\"}}"
  }
}
```

---

## 11. テスト

### 11.1 テストの実行

```bash
# 全テスト実行（Makefile 経由、推奨）
cd /path/to/zasso
make test

# 直接実行（crates/anthropx ディレクトリでは --manifest-path が必要）
cargo test -p anthropx --manifest-path crates/anthropx/Cargo.toml

# 特定のテストのみ実行
cargo test -p anthropx --manifest-path crates/anthropx/Cargo.toml -- translate
cargo test -p anthropx --manifest-path crates/anthropx/Cargo.toml -- lossy

# 設定系テストのみ
cargo test -p anthropx --manifest-path crates/anthropx/Cargo.toml -- config

# library モードのテスト（server feature なしでも実行可能なテストのみ）
cargo test -p anthropx --no-default-features --manifest-path crates/anthropx/Cargo.toml
```

### 11.2 テスト構成

| テスト種別 | 配置場所 | テスト数 | 内容 |
|-----------|---------|:--------:|------|
| Unit tests（単体テスト） | 各モジュール内 `#[cfg(test)] mod tests` | 197 | 設定（config）、ルーティング（routing）、スケジューラ（scheduler）、並行性制限（limiter）、プロトコル変換（translate）、メトリクス（metrics）の各関数を個別に検証 |
| Integration tests（統合テスト） | `tests/mock_server.rs` | 18 | `axum_test` を用いた mock upstream サーバーに対する結合テスト。全 4 エンドポイントの動作と受け入れ基準 10 項目をカバー |
| Real provider tests（実プロバイダーテスト） | `tests/real_provider.rs` | 1 | 実際の upstream プロバイダー（DeepSeek）に対する E2E テスト。`--features integration-test` で有効化 |
| Doc tests（ドキュメントテスト） | 各モジュールの doc comments | 2 | `cargo test` で自動実行されるコードサンプルの検証 |

### 11.3 統合テストの受け入れ基準（Acceptance Criteria）

`tests/mock_server.rs` は 18 のテストで構成され、RFC §12 で定義された全受け入れ基準をカバーします:

| AC# | テスト名 | 検証内容 | 期待結果 |
|:---:|---------|---------|:-------:|
| 10 | `healthz_metrics_return_200` | GET /healthz と GET /metrics が 200 を返す | ✅ Pass |
| 7 | `models_sorted_by_provider_public` | /v1/models の応答が provider/public の昇順でソートされている | ✅ Pass |
| 7 | `models_endpoint_returns_models_from_all_providers` | 複数 provider の全 enabled モデルが含まれる | ✅ Pass |
| - | `request_to_proxy_returns_response` | 基本的なリクエストルーティングが機能する | ✅ Pass |
| 8 | `model_without_slash_returns_400` | スラッシュなしの model 名で 400 | ✅ Pass |
| - | `authentication_rejects_missing_credentials` | require_client_auth=true + 認証なし → 401 | ✅ Pass |
| 9 | `concurrency_limiter_rejects_queue_overflow` | キュー満杯 → 429 | ✅ Pass |
| - | `concurrency_limiter_blocks_in_flight` | 同時実行数制限が機能する | ✅ Pass |
| 1 | `transparent_non_stream_proxies_to_upstream` | Transparent non-stream 中継 | ✅ Pass |
| 1 | `transparent_non_stream_accepts_request` | Transparent non-stream 応答受信 | ✅ Pass |
| 2 | `transparent_stream_proxies_sse_from_upstream` | Transparent stream SSE 中継 | ✅ Pass |
| 3 | `translate_non_stream_proxies_via_openai_wire` | Translate non-stream 変換 + 中継 | ✅ Pass |
| 3 | `translate_non_stream_response_format` | Translate non-stream 応答形式確認（type=message, role=assistant 等） | ✅ Pass |
| 4 | `translate_stream_proxies_via_openai_wire` | Translate stream SSE ストリーム変換 | ✅ Pass |
| 5 | `non_stream_key_failover_recovers_from_503` | 503 → failover → 成功 | ✅ Pass |
| - | `non_stream_key_failover_handles_error` | failover 後のエラーハンドリング | ✅ Pass |
| 6 | `stream_no_failover_returns_error` | stream 503 → failover せずエラー | ✅ Pass |
| EXT-1 | `translate_rejects_image_block_when_lossy_not_allowed` | allow_lossy=false + 画像ブロック → 400 拒否 | ✅ Pass |

### 11.4 実プロバイダーテスト（手動実行）

実際の upstream プロバイダー（DeepSeek）に対して anthropx を通した E2E テストを実行します。CI ではスキップされ、手動実行のみ可能です。

```bash
# DeepSeek API キーを環境変数で設定
export DEEPSEEK_API_KEY=sk-your-deepseek-api-key

# テスト実行
cargo test --features integration-test --test real_provider -- --nocapture
```

環境変数が設定されていない場合はテストは自動的にスキップされます（`#[ignore]`）。

---

## 12. Feature 一覧

```toml
[features]
default = ["server"]
server = ["dep:axum", "dep:reqwest", "dep:uuid", "dep:llm-bridge-core",
          "tokio/full", "dep:clap", "dep:futures", "dep:http",
          "dep:tokio-util", "dep:tokio-stream", "dep:tracing-subscriber",
          "dep:metrics-exporter-prometheus"]
integration-test = []
```

### 12.1 default

- **値**: `["server"]`
- **説明**: デフォルトで有効になる feature です。`cargo build` または `cargo build --release` で自動的に `server` feature が有効になり、完全なプロキシサーバーバイナリがビルドされます。`--no-default-features` を指定するとこの feature は無効になります。

### 12.2 server

- **値**: `["dep:axum", "dep:reqwest", "dep:uuid", "dep:llm-bridge-core", "tokio/full", "dep:clap", "dep:futures", "dep:http", "dep:tokio-util", "dep:tokio-stream", "dep:tracing-subscriber", "dep:metrics-exporter-prometheus"]`
- **説明**: HTTP サーバー機能のすべてを有効化します。この feature が有効な場合のみ、以下のモジュールと依存関係がコンパイルされます:
  - `main.rs`（バイナリエントリポイント）— `#![cfg(feature = "server")]` でガード
  - `cli` モジュール — `clap` を使用した CLI 引数解析
  - `app_state` モジュール — `AppState` 実行時状態
  - `http` モジュール — Axum Router、エンドポイントハンドラ、認証 middleware、エラー応答
  - `lifecycle` モジュール — `ProxyServer`、`ServerHandle`、`build_provider_clients`
  - `observability` モジュール — Prometheus メトリクスエクスポーター
  - `provider/transparent.rs` — Transparent モード（透過中継）
  - `provider/translate.rs` — Translate モード（プロトコル変換）
- **必須依存クレート**: axum, reqwest, uuid, llm-bridge-core, clap, futures, http, tokio-util, tokio-stream, tracing-subscriber, metrics-exporter-prometheus
- **補足**: `tokio/full` により Tokio ランタイムの全機能（rt-multi-thread, macros, sync, signal, io-util 等）が有効になります。

### 12.3 integration-test

- **値**: `[]`（追加依存なし）
- **説明**: 実プロバイダーテスト用の feature です。`cargo test --features integration-test` で有効化します。この feature 自体に追加の依存関係はなく、`tests/real_provider.rs` の `#[cfg(feature = "integration-test")]` ガードを通過させるためだけに存在します。CI ではこの feature なしで全テストが成功し、手動実行時のみ有効化します。

### 12.4 Feature ごとの利用可能モジュール対応表

| モジュール | `--no-default-features`（library） | `--features server`（デフォルト） |
|-----------|:---:|:---:|
| `config`（型定義、TOML 読込、設定検証） | ✅ 利用可 | ✅ 利用可 |
| `routing`（ルーティング純粋関数） | ✅ 利用可 | ✅ 利用可 |
| `util`（ヘッダー構築、ID 生成） | ✅ 利用可 | ✅ 利用可 |
| `provider`（ProviderClient、limiter） | ✅ limiter のみ利用可 | ✅ 全機能利用可 |
| `cli`（CLI 引数解析） | ❌ 利用不可 | ✅ 利用可 |
| `app_state`（AppState） | ❌ 利用不可 | ✅ 利用可 |
| `http`（Router、ハンドラ、認証、エラー応答） | ❌ 利用不可 | ✅ 利用可 |
| `lifecycle`（ProxyServer、ServerHandle） | ❌ 利用不可 | ✅ 利用可 |
| `observability`（Prometheus メトリクス） | ❌ 利用不可 | ✅ 利用可 |
| `provider/transparent`（透過中継） | ❌ 利用不可 | ✅ 利用可 |
| `provider/translate`（プロトコル変換） | ❌ 利用不可 | ✅ 利用可 |
| `main.rs`（バイナリエントリポイント） | ❌ 利用不可 | ✅ 利用可 |

### 12.5 ライブラリとして利用する場合の最小依存

`--no-default-features` でビルドする場合の最小依存クレート:

- serde (derive)
- toml
- thiserror
- tokio (sync — ConcurrencyLimiter の Semaphore 用)
- serde_json
- tracing
- metrics（no-op モードで動作）

これにより、設定型やルーティングロジックのみを利用するユースケースで、余分な依存関係を一切含まない軽量なビルドが可能です。

---

## 付録: 設定ファイル完全版（config.example.toml）

`config.example.toml` に、全設定項目を網羅したコメント付きのサンプル設定ファイルが同梱されています。実際の運用を始める際のテンプレートとして使用してください。

```bash
# 設定ファイルをコピーして編集
cp crates/anthropx/config.example.toml my-config.toml
# 設定を編集したら起動
./anthropx -c my-config.toml
```

同梱されている `config.example.toml` には、以下の設定例が含まれています:
- Transparent モード（DeepSeek）
- Translate モード（Groq）
- 単一 API キーの設定
- 複数 API キーによる failover の設定
- モデルエイリアスの設定
- タイムアウトや並行性制限のカスタマイズ例
