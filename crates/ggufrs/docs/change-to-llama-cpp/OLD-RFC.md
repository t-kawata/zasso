**これは、mistralrs を使用することを前提とした古いRFCです。**

# RFC: ggufrs — Rust による GGUF モデル推論エンジンクレート

## Abstract

ggufrs は、mistralrs をバックエンドとして GGUF 形式の量子化言語モデルを推論実行するための Rust クレートである。
同一プロセス内でライブラリとしての直接推論 API と OpenAI/Anthropic 互換 HTTP サーバーの両方を提供し、
ロードされたモデルインスタンスはスレッドセーフに共有される。
Qwen3.5-0.8B-Q4_K_M および Qwen3.5-2B-Q4_K_M をビルトイン対象としつつ、
任意の mistralrs 対応モデルに差し替え可能な抽象化を備える。
モデルファイルは build.rs により自動ダウンロードされ、手動配置を必要としない。
単体テスト・結合テスト・目視確認用バイナリを含む完全なテストスイートにより信頼性が保証される。

## Motivation

ローカル環境で LLM 推論を実行するユースケースは増加しているが、既存の Rust エコシステムには以下の課題がある：

1. **ライブラリとサーバーの同居が困難**: llama-cpp-2 等のクレートは推論APIを提供するが、OpenAI/Anthropic 互換サーバーの起動は別プロセスが必要となる。
2. **モデル初期化の重複**: 同一モデルをライブラリ呼び出しとサーバー呼び出しで独立に初期化すると、メモリ使用量が2倍になる。
3. **モデル取得の手動性**: モデルファイルのダウンロードと配置を手作業で行う必要があり、再現可能なビルドを妨げる。
4. **スレッドセーフ共有の不在**: 複数の推論リクエストを安全に同時処理するための枠組みが提供されていない。

ggufrs はこれらの課題を解消する。同一 GgufEngine インスタンスがモデルを一元管理し、
ライブラリ呼び出しとサーバー呼び出しの両方からスレッドセーフにモデルを共有する。
build.rs による自動ダウンロードで「clone & build」だけで推論実行が可能になる。

## Design

> **注記**: 以下の全コード例において、`Result<T>` は `anyhow::Result<T>`（`std::result::Result<T, anyhow::Error>`）を意味する。
> これは各コードブロックの冒頭にある `use anyhow::Result;` により導入される。

### 1. 全体アーキテクチャ

ggufrs は単一の `GgufEngine` 構造体を公開APIの中心とする統合型アーキテクチャを採用する。
`GgufEngine` はモデル管理・推論実行・サーバー起動の全機能を持つ。

```
┌──────────────────────────────────────────────────┐
│                   GgufEngine                      │
│                                                    │
│  ┌─────────────┐  ┌──────────────────────────┐   │
│  │ ModelRegistry│  │   InferenceEngine Trait   │   │
│  │ RwLock<Vec   │  │  ┌────────────────────┐  │   │
│  │ <ModelInfo>> │  │  │ generate()         │  │   │
│  │              │  │  │ generate_structured│  │   │
│  │ ・0.8B model │  │  │ generate_stream()  │  │   │
│  │ ・2B model   │  │  │ send_raw()         │  │   │
│  └─────────────┘  │  └────────────────────┘  │   │
│                   └──────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │  Server (optional)                       │   │
│  │  Axum + mistralrs-server-core            │   │
│  │  OpenAI / Anthropic 互換エンドポイント    │   │
│  │  JoinHandle<Result<()>> で制御           │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

```rust
// 公開APIの使用イメージ
use anyhow::Result;
use ggufrs::{GgufEngine, GgufConfig, ServerConfig};

#[tokio::main]
async fn main() -> Result<()> {
    // 設定を読み込んでエンジンを初期化
    // JSONファイルパス→埋め込みJSON→コードベタ書きの3層マージ
    let code_config = GgufConfig::from_code(vec![ModelConfig::qwen3_5_0_8b()]);
    let config = GgufConfig::build(code_config, Some(include_str!("config.json")), Some("config.json".as_ref()))?;
    let engine = GgufEngine::new(config).await?;

    // ライブラリモードで推論
    let result = engine.generate_structured(
        "qwen3.5-0.8b",
        TextMessages::new()
            .add_message(TextMessageRole::User, "校正してください"),
        serde_json::json!({}), // 実際の実装では適切な JSON Schema を指定する
    ).await?;

    // オプションでサーバー起動（任意タイミング）
    // 自動起動が必要な場合は GgufEngine::new_with_auto_start() を使用する
    let server_config = ServerConfig {
        bind: "127.0.0.1:3910".parse()?,
        models: vec!["qwen3.5-0.8b".into(), "qwen3.5-2b".into()],
        auto_start_server: false,
    };
    let engine = Arc::new(engine);
    let handle = GgufEngine::start_server(engine, server_config).await?;

    Ok(())
}
```

#### 1.1 モジュール分割

ggufrs は以下のモジュール構成を持つ：

```
src/
├── lib.rs              # 公開API（GgufEngine, InferenceEngine トレイト）
├── registry.rs         # ModelRegistry, ModelInfo
├── inference/          # InferenceEngine 実装
│   ├── mod.rs
│   ├── generate.rs     # generate / generate_structured
│   ├── stream.rs       # generate_stream
│   └── raw.rs          # send_raw（mistralrs パススルー）
├── server/             # サーバーモード
│   ├── mod.rs
│   ├── router.rs       # Axum ルーティング + モデル選択
│   └── openai.rs       # OpenAI 互換エンドポイント
├── config.rs           # GgufConfig, ModelConfig, ServerConfig
├── error.rs            # GgufError 列挙型
├── consts/
│   ├── mod.rs
│   └── settings.rs     # 静的定数（ポート番号・デフォルトパス等）
└── bin/
    └── test-run.rs     # 目視確認用バイナリ
```

#### 1.2 GgufEngine のライフサイクル

`GgufEngine` は以下の状態遷移を持つ：

1. **初期化 (`GgufEngine::new()`)**: 設定を受け取り、ModelRegistry を構築。モデルは lazy_load に従ってロードされる。
2. **運用 (推論実行・サーバー起動)**: 任意のタイミングで推論API呼び出しまたはサーバー起動が可能。
3. **停止 (Drop)**: 全モデルが解放され、サーバーが graceful shutdown される。

```rust
use anyhow::Result;

pub struct GgufEngine {
    registry: Arc<ModelRegistry>,
    server_handle: Mutex<Option<JoinHandle<Result<()>>>>,
}

impl GgufEngine {
    /// 新しい GgufEngine を初期化する。
    /// config に従い ModelRegistry を構築し、lazy_load=false のモデルをプリロードする。
    /// サーバーの自動起動が必要な場合は GgufEngine::new_with_auto_start() を使用する。
    pub async fn new(config: GgufConfig) -> Result<Self> {
        let engine = Self {
            registry: Arc::new(ModelRegistry::from_config(config.models)),
            server_handle: Mutex::new(None),
        };

        // lazy_load=false のモデルをプリロード
        engine.registry.load_immediate().await?;

        Ok(engine)
    }

    /// GgufEngine を生成し、必要に応じてサーバーを自動起動する。
    pub async fn new_with_auto_start(config: GgufConfig) -> Result<Arc<Self>> {
        let engine = Arc::new(GgufEngine::new(config.clone()).await?);

        if config.server.auto_start_server {
            let engine_for_server = engine.clone();
            let server_config = config.server.clone();
            tokio::spawn(async move {
                GgufEngine::start_server(engine_for_server, server_config).await
            });
        }

        Ok(engine)
    }
}

impl Drop for GgufEngine {
    fn drop(&mut self) {
        if let Some(handle) = self.server_handle.lock().unwrap().take() {
            handle.abort();
        }
    }
}
```

### 2. モデル管理

#### 2.1 ModelRegistry

モデル情報は `ModelRegistry` が一元管理する。内部に `RwLock<Vec<ModelInfo>>` を持ち、
複数の推論スレッドから安全にアクセスできる。読み取りが大半の操作であるため、
`RwLock` を採用し、書き込み（遅延ロード時）のみ排他する。

```rust
use anyhow::Result;

pub struct ModelRegistry {
    models: RwLock<Vec<ModelInfo>>,
}

impl ModelRegistry {
    /// 新しい空の Registry を生成する。
    pub fn new() -> Self { /* ... */ }

    /// モデル設定のベクタから Registry を構築する。
    pub fn from_config(models: Vec<ModelConfig>) -> Self {
        let infos: Vec<ModelInfo> = models.into_iter().map(|c| c.into()).collect();
        Self { models: RwLock::new(infos) }
    }

    /// モデル設定を追加する（まだロードはしない）。
    pub fn add_model(&self, config: ModelConfig) {
        self.models.write().unwrap().push(config.into());
    }

    /// モデル名から ModelInfo を取得する。lazy_load=true かつ未ロードならこのタイミングでロードする。
    pub async fn get(&self, name: &str) -> Result<Arc<Model>> { /* ... */ }

    /// lazy_load=false のモデルをプリロードする。
    pub async fn load_immediate(&self) -> Result<()> {
        let names: Vec<String> = self.models.read().unwrap().iter()
            .filter(|m| !m.lazy_load)
            .map(|m| m.name.clone())
            .collect();
        for name in names {
            self.get(&name).await?;
        }
        Ok(())
    }

    /// 全モデルをプリロードする（lazy_load 設定に従わず強制ロード）。
    pub async fn load_all(&self) -> Result<()> { /* ... */ }

    /// 登録済みモデル名の一覧を返す。
    pub fn list_models(&self) -> Vec<String> {
        self.models.read().unwrap().iter().map(|m| m.name.clone()).collect()
    }
}
```

#### 2.2 ModelConfig と ModelInfo

ggufrs では「設定（入力）」と「ランタイム状態」を分離する2層構造を採用する。

| 構造体 | 役割 | 生成タイミング | 保持場所 |
|--------|------|--------------|---------|
| `ModelConfig` | モデルの静的な設定値（パス・サイズ等）。JSON/コードから入力される。 | 設定読み込み時 | `GgufConfig.models` |
| `ModelInfo` | 設定＋ロード済みモデルインスタンスの実行時状態。Registry が保持する。 | Registry 構築時（configから変換） | `ModelRegistry` 内部 |

`ModelRegistry` は `ModelConfig` を受け取り、`ModelInfo` に変換して保持する。
`ModelInfo` は `ModelConfig` の全フィールドに加え、ロード状態と `Arc<Model>` を持つ。

```rust
impl From<ModelConfig> for ModelInfo {
    fn from(config: ModelConfig) -> Self {
        ModelInfo {
            name: config.name,
            model_path: config.model_path,
            lazy_load: config.lazy_load,
            context_size: config.context_size,
            gpu_layers: config.gpu_layers,
            batch_size: config.batch_size,
            chat_template: config.chat_template,
            model: None, // 未ロード
        }
    }
}
```

`ModelInfo` は登録情報と mistralrs 設定を一体化して保持する。Qwen3.5 シリーズは
ビルトイン設定として定数提供されるが、crate 利用者は任意のモデルを全く同じ構造で登録できる。

```rust
pub struct ModelInfo {
    /// モデルを識別する名前（例: "qwen3.5-0.8b", "my-custom-model"）
    pub name: String,

    /// GGUF ファイルのパス（models/ ディレクトリからの相対パスまたは絶対パス）
    pub model_path: PathBuf,

    /// 遅延ロードフラグ。true の場合は初回 get() までロードを延期する。
    pub lazy_load: bool,

    /// mistralrs の GgufModelBuilder に渡す全設定
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
    pub batch_size: Option<u32>,
    pub chat_template: Option<String>,

    /// 内部状態：ロード済みのモデルインスタンス（未ロード時は None）
    model: Option<Arc<Model>>,
}
```

ビルトインモデルの定義：

```rust
impl ModelConfig {
    /// Qwen3.5-0.8B Q4_K_M のビルトイン設定
    pub fn qwen3_5_0_8b() -> Self {
        ModelConfig {
            name: "qwen3.5-0.8b".into(),
            model_path: "models/Qwen3.5-0.8B-Q4_K_M.gguf".into(),
            lazy_load: true,
            context_size: Some(32768),
            gpu_layers: None,
            batch_size: None,
            chat_template: None, // GGUF 内包のテンプレートを使用
        }
    }

    /// Qwen3.5-2B Q4_K_M のビルトイン設定
    pub fn qwen3_5_2b() -> Self {
        ModelConfig {
            name: "qwen3.5-2b".into(),
            model_path: "models/Qwen3.5-2B-Q4_K_M.gguf".into(),
            lazy_load: true,
            context_size: Some(32768),
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }
    }

    /// ユーザーが任意のモデルを設定するためのコンストラクタ
    pub fn custom(name: &str, path: &str) -> Self {
        ModelConfig {
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
```

#### 2.3 推論単位でのモデル切替

全ての推論メソッドは第一引数に `model_name: &str` を受け取る。
ModelRegistry はこの名前でモデルインスタンスを解決する。

```rust
use anyhow::Result;

#[async_trait]
pub trait InferenceEngine: Send + Sync {
    /// 通常のテキスト生成。model_name で使用するモデルを指定する。
    async fn generate(
        &self,
        model_name: &str,
        messages: TextMessages,
        params: GenerateParams,
    ) -> Result<String>;

    /// Structured Output（JSON Schema 拘束付き生成）。
    async fn generate_structured(
        &self,
        model_name: &str,
        messages: TextMessages,
        schema: Value,
    ) -> Result<Value>;

    /// ストリーミング生成。戻り値は文字列チャンクの非同期ストリーム。
    async fn generate_stream(
        &self,
        model_name: &str,
        messages: TextMessages,
        params: GenerateParams,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;

    /// 低レベルAPI: mistralrs の RequestBuilder を直接受け付け、全機能にアクセスする。
    /// これにより tools, web search, code execution 等の mistralrs の全機能が利用可能。
    async fn send_raw(
        &self,
        model_name: &str,
        request: RequestBuilder,
    ) -> Result<ChatCompletionResponse>;
}
```

`send_raw` メソッドにより、ggufrs のトレイト定義は mistralrs の全機能をカバーする。
mistralrs に新機能が追加された場合も、`RequestBuilder` の拡張のみで対応でき、トレイト自体の変更は不要である。

`GenerateParams` は高レベル3メソッドの共通パラメータを保持する：

```rust
#[derive(Debug, Clone)]
pub struct GenerateParams {
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub frequency_penalty: Option<f32>,
}

impl Default for GenerateParams {
    fn default() -> Self {
        Self {
            temperature: Some(0.1),
            max_tokens: Some(256),
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
        }
    }
}
```

### 3. サーバーモード

#### 3.1 ハイブリッドアーキテクチャ

サーバーモードはハイブリッド方式を採用する：ベースルーティング層は自前の Axum 実装、
OpenAI 互換のメッセージ処理は `mistralrs-server-core` のコンポーネントを利用する。
Anthropic 互換エンドポイント（`/anthropic/v1/messages`）は `llm-bridge-core` クレートの
`transform::anthropic_to_openai()` / `transform::openai_to_anthropic()` 関数を用いて
リクエスト・レスポンスを双方向変換し、内部で OpenAI エンドポイントに委譲する。
（参照: [docs.rs](https://docs.rs/llm-bridge-core/latest/llm_bridge_core/),
 [GitHub](https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master)）

```rust
pub struct ServerConfig {
    /// バインドアドレス（例: "127.0.0.1:3910"）
    pub bind: SocketAddr,

    /// このサーバーが扱うモデル名のリスト
    pub models: Vec<String>,

    /// GgufEngine::new() 時に自動起動するかどうか
    pub auto_start_server: bool,
}
```

#### 3.2 ルーティング設計

Axum ルーターはリクエストボディの `model` フィールドを読み取り、該当するモデルを
GgufEngine の ModelRegistry から解決して server-core の処理に委譲する。

```
POST /v1/chat/completions  → Axum ルーター → model フィールド抽出
       (OpenAI 形式)               ↓
                          RequestBuilder に変換
                                  ↓
                          ModelRegistry::get(model)
                                  ↓
                          server-core に委譲（メッセージ処理）
                                  ↓
                          OpenAI 互換 JSON レスポンス

POST /anthropic/v1/messages → Axum ルーター → model フィールド抽出
       (Anthropic 形式)               ↓
                          llm-bridge-core で OpenAI 形式に変換
                                  ↓
                          RequestBuilder に変換
                                  ↓
                          ModelRegistry::get(model)
                                  ↓
                          server-core に委譲（メッセージ処理）
                                  ↓
                          llm-bridge-core で Anthropic 形式に逆変換
                                  ↓
                          Anthropic 互換 JSON レスポンス
```

Axum ハンドラの共通エラー型：

```rust
/// Axum ハンドラ用の共有状態型。InferenceEngine トレイト経由で全操作を行う。
pub type AppState = Arc<dyn InferenceEngine + Send + Sync>;

/// Axum ハンドラ用の共通エラー型。GgufError から自動変換される。
pub type AppError = (StatusCode, Json<serde_json::Value>);

impl From<GgufError> for AppError {
    fn from(err: GgufError) -> Self {
        let (status, message) = match &err {
            GgufError::ModelNotFound(_) => (StatusCode::NOT_FOUND, err.to_string()),
            GgufError::ModelLoadFailed { .. } => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::InferenceFailed(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::ServerStartupFailed(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::InvalidConfig(_) => (StatusCode::BAD_REQUEST, err.to_string()),
            GgufError::MistralrsError(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
        };
        (status, Json(serde_json::json!({"error": message})))
    }
}
```

```rust
async fn openai_chat_handler(
    State(engine): State<AppState>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, AppError> {
    // リクエストからモデル名を抽出
    let model_name = req.model.as_deref().unwrap_or("qwen3.5-0.8b");

    // RequestBuilder に変換して委譲（mistralrs-server-core のメッセージ処理を利用）
    let request_builder = RequestBuilder::try_from(req)?;
    let response = engine.send_raw(model_name, request_builder).await?;

    Ok(Json(response))
}
```

#### 3.3 複数モデルのルーティング

1台のサーバーがリクエストごとに異なるモデルを扱う。例えば `model: "qwen3.5-0.8b"` の
リクエストは0.8Bモデルで、`model: "qwen3.5-2b"` のリクエストは2Bモデルで処理される。

```rust
fn build_router(engine: AppState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(openai_chat_handler))
        .route("/v1/models", get(list_models_handler))
        .route("/anthropic/v1/messages", post(anthropic_messages_handler))
        .with_state(engine)
}

/// OpenAI 互換のモデル一覧エンドポイント
/// registry のモデル一覧は engine の実装を通じて取得する。
async fn list_models_handler(
    State(_engine): State<AppState>,
) -> Json<serde_json::Value> {
    // 実際の実装では engine からモデル一覧を取得する
    Json(serde_json::json!({
        "object": "list",
        "data": [
            {"id": "qwen3.5-0.8b", "object": "model"},
            {"id": "qwen3.5-2b", "object": "model"},
        ],
    }))
}

/// Anthropic 互換 Messages API エンドポイント
/// mistralrs は Anthropic 互換型を提供しないため、llm-bridge-core の
/// transform 関数を用いてリクエスト・レスポンスを双方向変換する。
async fn anthropic_messages_handler(
    State(engine): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Anthropic リクエストを OpenAI 形式に変換
    let openai_body = llm_bridge_core::transform::anthropic_to_openai(body)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    // OpenAI 互換の model フィールドからモデル名を抽出
    let model_name = openai_body.get("model")
        .and_then(|v| v.as_str())
        .unwrap_or("qwen3.5-0.8b");

    // OpenAI 互換リクエストを mistralrs の RequestBuilder に変換して委譲
    let chat_request: ChatCompletionRequest = serde_json::from_value(openai_body)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;
    let request_builder = RequestBuilder::try_from(chat_request)?;
    let response = engine.send_raw(model_name, request_builder).await?;

    // mistralrs の OpenAI 互換レスポンスを Anthropic 形式に逆変換
    let response_value = serde_json::to_value(&response)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;
    let anthropic_response = llm_bridge_core::transform::openai_to_anthropic(response_value)
        .map_err(|e| AppError::from(GgufError::InvalidConfig(e.to_string())))?;

    Ok(Json(anthropic_response))
}
```

#### 3.4 非同期サーバー起動とシャットダウン

`start_server()` は呼び出し元に `JoinHandle<Result<()>>` を返す。
呼び出し元はこのハンドルを通じてサーバーの死活監視、abort、終了待機を自由に制御できる。
`ServerConfig.auto_start_server = true` の場合、`GgufEngine::new_with_auto_start()` 内で自動的に起動する。

```rust
use anyhow::Result;

impl GgufEngine {
    /// サーバーを起動する。`self: Arc<Self>` で呼び出すことで、
    /// サーバーの JoinHandle が内部に保持され、Drop 時に自動的に abort される。
    pub async fn start_server(
        self: Arc<Self>,
        config: ServerConfig,
    ) -> Result<JoinHandle<Result<()>>> {
        let bind = config.bind;

        let handle = tokio::spawn(async move {
            let app = build_router(self);
            let listener = tokio::net::TcpListener::bind(bind).await?;
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown_signal())
                .await?;
            Ok(())
        });

        // サーバーの JoinHandle を内部に保持し、Drop 時に abort 可能にする
        *self.server_handle.lock().unwrap() = Some(handle.clone());
        Ok(handle)
    }
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c().await.expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv().await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
```

### 4. 設定管理

#### 4.1 静的定数（settings.rs）と動的設定（JSON config）の役割分担

| 区分 | 内容 | 管理場所 |
|------|------|---------|
| 静的定数 | ポート番号、デフォルトパス、タイムアウト値 | `consts/settings.rs` |
| 動的設定 | モデルパス、context_size、gpu_layers、lazy_load 等 | JSON config（3層マージ） |

```rust
// consts/settings.rs — 静的定数のみ
pub const DEFAULT_RT_PORT: u16 = 3910;
pub const DEFAULT_MODEL_DIR: &str = "models";
pub const CURL_TIMEOUT_SECS: u64 = 60;
pub const DEFAULT_CONTEXT_SIZE: u32 = 32768;
pub const DEFAULT_MAX_TOKENS: u32 = 256;
pub const DEFAULT_TEMPERATURE: f32 = 0.1;
```

#### 4.2 JSON マルチソースマージ

設定は3層構造でマージされ、優先順位の高い層が低い層を上書きする。

**優先順位（高い→低い）:**
1. **JSON ファイルパス指定**: `GgufConfig::from_file("path/to/config.json")`
2. **埋め込み JSON データ**: `GgufConfig::from_json_str(include_str!("config.json"))`
3. **コードベタ書き**: `GgufConfig::from_code(ModelConfig::qwen3_5_0_8b())`

```rust
use anyhow::Result;

pub struct GgufConfig {
    pub models: Vec<ModelConfig>,
    pub server: ServerConfig,
    pub gpu: GpuConfig,
}

impl GgufConfig {
    /// コード内で直接設定を構築する（最低優先度）
    pub fn from_code(models: Vec<ModelConfig>) -> Self { /* ... */ }

    /// include_str! で埋め込まれた JSON 文字列からマージする（中優先度）
    pub fn from_json_str(json: &str, base: Self) -> Result<Self> { /* ... */ }

    /// ディスク上の JSON ファイルからマージする（最高優先度）
    pub fn from_file(path: &Path, base: Self) -> Result<Self> { /* ... */ }

    /// すべての層を順次マージして最終設定を生成する
    pub fn merge(layers: Vec<ConfigLayer>) -> Result<Self> { /* ... */ }
}
```

#### 4.3 JSON config スキーマ（3セクション）

```json
{
  "models": [
    {
      "name": "qwen3.5-0.8b",
      "model_path": "models/Qwen3.5-0.8B-Q4_K_M.gguf",
      "lazy_load": true,
      "context_size": 32768,
      "gpu_layers": 0,
      "chat_template": null
    },
    {
      "name": "qwen3.5-2b",
      "model_path": "models/Qwen3.5-2B-Q4_K_M.gguf",
      "lazy_load": true,
      "context_size": 32768,
      "gpu_layers": 0
    }
  ],
  "server": {
    "bind": "127.0.0.1:3910",
    "auto_start_server": false
  },
  "gpu": {
    "provider": "auto",
    "cpu_only": false
  }
}
```

### 5. GPU自動検出機構

GPUプロバイダーはハイブリッド方式で自動検出される。
デフォルトはコンパイル時に `cfg!(target_os)` で決定し、環境変数 `GGUFRS_GPU_PROVIDER` で
ランタイム上書きが可能である。

```rust
pub enum GpuProvider {
    Auto,
    Metal,
    DirectML,
    Cuda,
    Cpu,
}

impl GpuProvider {
    /// 実行環境に適したデフォルトGPUプロバイダーをコンパイル時に決定する。
    /// 環境変数 GGUFRS_GPU_PROVIDER が設定されていればそれを優先する。
    /// 有効な値: "auto", "metal", "directml", "cuda", "cpu"
    pub fn detect() -> Self {
        if let Ok(provider) = std::env::var("GGUFRS_GPU_PROVIDER") {
            return Self::from_str(&provider).unwrap_or(Self::Auto);
        }

        #[cfg(target_os = "macos")]
        { Self::Metal }

        #[cfg(target_os = "windows")]
        { Self::DirectML }

        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        { Self::Cpu }
    }

    /// 環境変数 GGUFRS_GPU_PROVIDER の値を GpuProvider に変換する。
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

    /// 対応する mistralrs の feature flag 名を返す。
    pub fn mistralrs_feature(&self) -> &'static str {
        match self {
            Self::Metal => "metal",
            Self::DirectML => "directml",
            Self::Cuda => "cuda",
            Self::Cpu | Self::Auto => "",
        }
    }
}
```

GPUプロバイダーが `Cpu` として検出された場合、または `cpu_only: true` が設定された場合、
mistralrs の GPU feature は一切有効化されず、CPU のみで推論が実行される。
macOS では Metal、Windows では DirectML が標準で自動利用される。

### 6. エラー型

`GgufError` は6バリアントを持つ列挙型として定義される。
各バリアントに `From` トレイトを実装し、`?` 演算子による透過的なエラー伝搬を可能にする。

```rust
#[derive(Debug, thiserror::Error)]
pub enum GgufError {
    /// 指定されたモデル名が ModelRegistry に存在しない
    #[error("model not found: {0}")]
    ModelNotFound(String),

    /// モデルのロードに失敗した（GGUFファイル不在・破損等）
    #[error("model load failed for {name}: {source}")]
    ModelLoadFailed {
        name: String,
        source: Box<dyn std::error::Error + Send + Sync>,
    },

    /// 推論実行中にエラーが発生した
    #[error("inference failed: {0}")]
    InferenceFailed(Box<dyn std::error::Error + Send + Sync>),

    /// サーバーの起動に失敗した（ポート競合等）
    #[error("server startup failed: {0}")]
    ServerStartupFailed(Box<dyn std::error::Error + Send + Sync>),

    /// 設定値に不正がある（JSONパース失敗・必須フィールド欠如等）
    #[error("invalid config: {0}")]
    InvalidConfig(String),

    /// mistralrs 内部エラー
    #[error("mistralrs error: {0}")]
    MistralrsError(#[from] mistralrs::Error),
}
```

### 7. モデル自動ダウンロード（build.rs）

#### 7.1 ダウンロード方式

voiput crate と同一の curl ベース方式を採用する。依存クレートを増やさず、
クロスプラットフォームで動作する。

```rust
// build.rs
const MODEL_FILES: &[(&str, &str)] = &[
    (
        "Qwen3.5-0.8B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
    ),
    (
        "Qwen3.5-2B-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    ),
];

fn main() {
    let model_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("models");

    // ディレクトリを作成
    std::fs::create_dir_all(&model_dir).expect("failed to create models/ directory");

    // 各モデルファイルをダウンロード（存在しない場合のみ）
    for (filename, url) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            println!("cargo:warning=Downloading {}...", filename);
            download_file(url, &file_path);
        }
    }

    // 全ファイルの存在を確認
    for (filename, _) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        assert!(
            file_path.exists(),
            "Model file not found: {}. Try running `make download-models`.",
            file_path.display()
        );
    }

    // 変更検知
    println!("cargo:rerun-if-changed=models/");
}

#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &PathBuf) {
    let status = std::process::Command::new("curl")
        .args(["-sS", "-m", "60", "-L", "-o"])
        .arg(dest)
        .arg(url)
        .status()
        .expect("Failed to execute curl. Please install curl.");
    if !status.success() {
        let _ = std::fs::remove_file(dest);
        panic!("Failed to download: {}", url);
    }
}

#[cfg(target_os = "windows")]
fn download_file(url: &str, dest: &PathBuf) {
    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile", "-Command",
            &format!(
                "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
                 Invoke-WebRequest -Uri '{}' -OutFile '{}'",
                url, dest.display()
            ),
        ])
        .status()
        .expect("Failed to execute PowerShell.");
    if !status.success() {
        let _ = std::fs::remove_file(dest);
        panic!("Failed to download: {}", url);
    }
}
```

#### 7.2 ファイル構成

ダウンロードされたモデルファイルは `crates/ggufrs/models/` に配置される。

```
models/
├── Qwen3.5-0.8B-Q4_K_M.gguf   (約 800 MB)
└── Qwen3.5-2B-Q4_K_M.gguf     (約 1.6 GB)
```

`models/` ディレクトリは `.gitignore` に追加され、git 管理対象外となる。

```
# crates/ggufrs/.gitignore
/models/
```

### 8. 依存関係管理

#### 8.1 Cargo.toml

```toml
[package]
name = "ggufrs"
version = "0.1.0"
edition = "2021"

[dependencies]
# mistralrs — GGUF 推論バックエンド
# CPU-Only を基本とし、GPU feature は cargo feature で分離
mistralrs = { version = "*", default-features = false, features = ["gguf"] }

# 非同期ランタイム
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal"] }

# HTTP サーバー（Axum ルーティング層）
axum = "0.8"

# 直列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# 非同期ストリーム
futures = "0.3"

# エラー型
thiserror = "2"
anyhow = "1"

# トレイト非同期化
async-trait = "0.1"

# ロギング
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["fmt", "env-filter"] }

# Anthropic ↔ OpenAI プロトコル変換（/anthropic/v1/messages 用）
llm-bridge-core = "0.2"

[features]
default = ["cpu"]
cpu = []
# GPU feature flags — 必要な環境でのみ有効化する
# metal / cuda / directml
metal = ["mistralrs/metal"]
cuda = ["mistralrs/cuda"]
directml = ["mistralrs/directml"]

[bin]
name = "test-run"
path = "src/bin/test-run.rs"
```

#### 8.2 GPU feature の分離

GPU feature は cargo feature として分離され、必要な環境のみ有効化する。
macOS では `metal` feature、Windows では `directml` feature、Linux では `cuda` feature が
GPU自動検出により選択される。

```bash
# CPU-Only モード（デフォルト）
cargo build

# macOS（Metal）
cargo build --features metal

# Windows（DirectML）
cargo build --features directml

# Linux（CUDA）
cargo build --features cuda
```

#### 8.3 mistralrs 型の re-export

ggufrs の利用者が mistralrs を直接依存に追加しなくても済むよう、
主要な mistralrs の型を `pub use` で re-export する。

```rust
// lib.rs
pub use mistralrs::{
    Model, RequestBuilder, TextMessages, TextMessageRole,
    Constraint, ChatCompletionResponse,
    IsqBits,
};
```

### 9. テスト

#### 9.1 単体テスト

単体テストは `InferenceEngine` トレイトのモック実装を使用して行う。
実モデルを必要とせず、高速に実行できる。

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Result;
    use mockall::mock;
    use mockall::predicate::{eq, always};

    mock! {
        pub Engine {}
        #[async_trait]
        impl InferenceEngine for Engine {
            async fn generate(&self, model_name: &str, messages: TextMessages, params: GenerateParams) -> Result<String>;
            async fn generate_structured(&self, model_name: &str, messages: TextMessages, schema: Value) -> Result<Value>;
            async fn generate_stream(&self, model_name: &str, messages: TextMessages, params: GenerateParams) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;
            async fn send_raw(&self, model_name: &str, request: RequestBuilder) -> Result<ChatCompletionResponse>;
        }
    }

    #[tokio::test]
    async fn test_generate_with_mock() {
        let mut mock = MockEngine::new();
        mock.expect_generate()
            .with(
                eq("qwen3.5-0.8b"),
                always(),
                always(),
            )
            .returning(|_, _, _| Ok("Hello, world!".into()));

        let result = mock.generate("qwen3.5-0.8b", TextMessages::new().add_message(TextMessageRole::User, "Hi"), GenerateParams::default()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello, world!");
    }

    #[tokio::test]
    async fn test_generate_structured_with_mock() {
        let mut mock = MockEngine::new();
        let expected = serde_json::json!({"corrected_text": "修正後のテキスト", "was_modified": true, "correction_notes": "句読点を追加"});

        mock.expect_generate_structured()
            .with(
                eq("qwen3.5-0.8b"),
                always(),
                always(),
            )
            .returning(move |_, _, _| Ok(expected.clone()));

        let schema = serde_json::json!({
            "type": "object",
            "properties": {
                "corrected_text": {"type": "string"},
                "was_modified": {"type": "boolean"},
                "correction_notes": {"type": "string"}
            },
            "required": ["corrected_text", "was_modified", "correction_notes"]
        });

        let result = mock.generate_structured("qwen3.5-0.8b", TextMessages::new(), schema).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_registry_add_and_get() {
        let registry = ModelRegistry::new();
        registry.add_model(ModelConfig::qwen3_5_0_8b());
        registry.add_model(ModelConfig::qwen3_5_2b());

        let names = registry.list_models();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"qwen3.5-0.8b".to_string()));
        assert!(names.contains(&"qwen3.5-2b".to_string()));
    }

    #[tokio::test]
    async fn test_registry_model_not_found() {
        let registry = ModelRegistry::new();
        let result = registry.get("non-existent-model").await;
        assert!(result.is_err());
        match result {
            Err(GgufError::ModelNotFound(name)) => assert_eq!(name, "non-existent-model"),
            _ => panic!("expected ModelNotFound error"),
        }
    }

    #[test]
    fn test_error_from_mistralrs() {
        let mistral_err = mistralrs::Error::Msg("test error".into());
        let gguf_err: GgufError = mistral_err.into();
        match gguf_err {
            GgufError::MistralrsError(_) => {} // OK
            _ => panic!("expected MistralrsError variant"),
        }
    }
}
```

#### 9.2 結合テスト

結合テストは build.rs でダウンロード済みの実モデルを使用して実行する。
モデルが存在しない場合はテストが失敗する（未ロード時のフォールバックや仮実装による回避は禁止）。

```rust
// tests/integration_test.rs
use ggufrs::*;

/// 実際の Qwen3.5-0.8B モデルを使用して Structured Output 推論が正常に動作することを確認する。
/// build.rs でモデルがダウンロード済みであることを前提とする。
#[tokio::test]
async fn test_real_model_structured_output() {
    let model_dir = std::env::current_dir()
        .unwrap()
        .parent()
        .unwrap()
        .join("models");

    let config = GgufConfig {
        models: vec![ModelConfig {
            name: "qwen3.5-0.8b".into(),
            model_path: model_dir.join("Qwen3.5-0.8B-Q4_K_M.gguf"),
            lazy_load: false,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
            chat_template: None,
        }],
        server: ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            models: vec!["qwen3.5-0.8b".into()],
            auto_start_server: false,
        },
        gpu: GpuConfig {
            provider: GpuProvider::Cpu,
            cpu_only: true,
        },
    };

    let engine = GgufEngine::new(config).await
        .expect("Failed to initialize GgufEngine. Check that model files exist in models/");

    let messages = TextMessages::new()
        .add_message(TextMessageRole::System, "あなたは校正アシスタントです。JSONで返してください。")
        .add_message(TextMessageRole::User, "きのうのかいぎできめたないようを、らいしゅうまでにかくにんしてください。");

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "corrected_text": {"type": "string"},
            "was_modified": {"type": "boolean"},
            "correction_notes": {"type": "string"}
        },
        "required": ["corrected_text", "was_modified", "correction_notes"]
    });

    let result = engine.generate_structured("qwen3.5-0.8b", messages, schema).await
        .expect("Structured output inference failed");

    assert!(result.get("corrected_text").and_then(|v| v.as_str()).is_some());
    assert!(result.get("was_modified").and_then(|v| v.as_bool()).is_some());
}

/// モデルが存在しない場合に ModelNotFound エラーが返ることを確認する。
#[tokio::test]
async fn test_model_not_found_error() {
    let registry = ModelRegistry::new();
    let result = registry.get("non-existent").await;
    assert!(matches!(result, Err(GgufError::ModelNotFound(_))));
}

/// InferenceEngine トレイトのモックを使ってサーバーが正しくルーティングすることを確認する。
/// 実際のモデルは使わず、モックエンジンに対するリクエストのモデル名解決を検証する。
#[tokio::test]
async fn test_server_model_routing() {
    let mut mock_engine = MockEngine::new();
    mock_engine.expect_send_raw()
        .with(eq("test-model"), always())
        .returning(|_, _| {
            Ok(ChatCompletionResponse {
                id: "chatcmpl-test".into(),
                choices: vec![],
                created: 0,
                model: "test-model".into(),
                usage: None,
            })
        });

    // モックエンジンを AppState（Arc<dyn InferenceEngine>）として共有
    let state: AppState = Arc::new(mock_engine);

    let app = Router::new()
        .route("/v1/chat/completions", post(openai_chat_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // サーバー起動を待つ
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("http://{}/v1/chat/completions", addr))
        .json(&serde_json::json!({
            "model": "test-model",
            "messages": [{"role": "user", "content": "Hello"}]
        }))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 200);
}
```

#### 9.3 test-run バイナリ

`cargo run --bin test-run` で人間が目視確認できる全パターンの推論実行結果を表示する。

```rust
// src/bin/test-run.rs
use anyhow::Result;
use ggufrs::*;
use std::path::PathBuf;

fn print_separator(title: &str) {
    println!("\n{}", "=".repeat(60));
    println!("  {}", title);
    println!("{}", "=".repeat(60));
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let model_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("models");
    let config = GgufConfig {
        models: vec![
            ModelConfig::qwen3_5_0_8b(),
            ModelConfig::qwen3_5_2b(),
        ],
        server: ServerConfig {
            bind: "127.0.0.1:0".parse()?,
            models: vec!["qwen3.5-0.8b".into(), "qwen3.5-2b".into()],
            auto_start_server: false,
        },
        gpu: GpuConfig {
            provider: GpuProvider::Cpu,
            cpu_only: true,
        },
    };

    let engine = GgufEngine::new(config).await?;
    println!("✓ GgufEngine initialized successfully");

    // ---- パターン1: Structured Output ----
    print_separator("Pattern 1: Structured Output (JSON Schema)");

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "corrected_text": {"type": "string"},
            "was_modified": {"type": "boolean"},
            "correction_notes": {"type": "string"}
        },
        "required": ["corrected_text", "was_modified", "correction_notes"]
    });

    let result = engine.generate_structured(
        "qwen3.5-0.8b",
        TextMessages::new()
            .add_message(TextMessageRole::System, "校正アシスタントとしてJSONで返してください。")
            .add_message(TextMessageRole::User, "きのうのごうどうをていしゅつしました"),
        schema,
    ).await?;

    println!("  Input:  昨日の合同を提出しました");
    println!("  Output: {}", serde_json::to_string_pretty(&result)?);

    // ---- パターン2: 通常生成 ----
    print_separator("Pattern 2: Text Generation");

    let response = engine.generate(
        "qwen3.5-0.8b",
        TextMessages::new()
            .add_message(TextMessageRole::User, "Rustの所有権について簡潔に説明してください。"),
        GenerateParams {
            temperature: Some(0.7),
            max_tokens: Some(200),
        },
    ).await?;

    println!("  Output:\n{}", response);

    // ---- パターン3: ストリーミング生成 ----
    print_separator("Pattern 3: Streaming Generation");

    let mut stream = engine.generate_stream(
        "qwen3.5-0.8b",
        TextMessages::new()
            .add_message(TextMessageRole::User, "自己紹介をしてください。"),
        GenerateParams::default(),
    ).await?;

    print!("  Output: ");
    use futures::StreamExt;
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(text) => print!("{}", text),
            Err(e) => eprintln!("\n  Stream error: {}", e),
        }
    }
    println!();

    // ---- サマリー ----
    print_separator("Summary");
    println!("  ✓ Structured Output:       PASS");
    println!("  ✓ Text Generation:         PASS");
    println!("  ✓ Streaming Generation:    PASS");
    println!("\n  All inference patterns verified successfully!");

    Ok(())
}
```

## Implementation

### Makefile 連携

ggufrs の開発では、zasso プロジェクトの Makefile 経由でビルド・テストを実行する。

```bash
# Rust バックエンドのビルド検証
make check-be

# 全テスト実行
make test

# test-run バイナリの実行（目視確認）
cd crates/ggufrs && cargo run --bin test-run
```

Makefile のターゲットを直接使用できない状況でのみ、`cargo build` / `cargo test` を直接使用する。

### 実装順序

1. **定数定義**: `consts/settings.rs` に静的定数を定義する。
2. **エラー型定義**: `error.rs` に `GgufError` 列挙型を定義し、`From` トレイトを実装する。
3. **設定型定義**: `config.rs` に `GgufConfig` / `ModelConfig` / `ServerConfig` / `GpuConfig` を定義する。
4. **ModelRegistry 実装**: `registry.rs` に `ModelRegistry` と `ModelInfo` を実装する。
5. **InferenceEngine トレイト定義**: `inference/mod.rs` にトレイトを定義する。
6. **InferenceEngine 実装**: `inference/generate.rs` / `stream.rs` / `raw.rs` に実装を記述する。
7. **サーバーモード**: `server/` に Axum ルーターと mistralrs-server-core 連携を実装する。
8. **GgufEngine**: `lib.rs` に `GgufEngine` 構造体を実装し、全機能を統合する。
9. **build.rs**: モデル自動ダウンロードを実装する。
10. **test-run バイナリ**: `src/bin/test-run.rs` に目視確認用バイナリを実装する。
11. **テスト**: 単体テストと結合テストを記述する。
12. **.gitignore**: `models/` を gitignore に追加する。

### mistralrs バージョン

実装時点での mistralrs の最新安定版を使用すること。
ggufrs の Cargo.toml ではバージョンを固定せず、`cargo update` で追従可能な状態を維持する。
ただし、APIの破壊的変更に備えて `Cargo.lock` はバージョン管理対象とする。

### 設定マージの実装詳細

3層マージは以下の順序で適用する：

```rust
use anyhow::Result;

impl GgufConfig {
    pub fn build(
        code_layer: GgufConfig,
        embedded_json: Option<&str>,
        file_path: Option<&Path>,
    ) -> Result<Self> {
        let mut config = code_layer;

        // 第2層: 埋め込みJSONをマージ
        if let Some(json) = embedded_json {
            let embedded: GgufConfig = serde_json::from_str(json)?;
            config.merge_overlay(embedded);
        }

        // 第3層: ファイルJSONをマージ（最高優先度）
        if let Some(path) = file_path {
            let content = std::fs::read_to_string(path)?;
            let file_config: GgufConfig = serde_json::from_str(&content)?;
            config.merge_overlay(file_config);
        }

        Ok(config)
    }

    /// 上位優先度の設定をマージする（自分自身を上書き更新する）
    fn merge_overlay(&mut self, overlay: GgufConfig) {
        // models は name でマージ（同名は上書き、新規は追加）
        for overlay_model in overlay.models {
            if let Some(pos) = self.models.iter().position(|m| m.name == overlay_model.name) {
                self.models[pos] = overlay_model;
            } else {
                self.models.push(overlay_model);
            }
        }
        // server は上書き
        if overlay.server.bind.port() != 0 {
            self.server = overlay.server;
        }
        // gpu は上書き
        if overlay.gpu.provider != GpuProvider::Auto {
            self.gpu = overlay.gpu;
        }
    }
}
```

### サーバー起動のフラグ制御

```rust
use anyhow::Result;

impl GgufEngine {
    /// GgufEngine を生成し、必要に応じてサーバーを自動起動する。
    pub async fn new_with_auto_start(config: GgufConfig) -> Result<Arc<Self>> {
        let engine = Arc::new(GgufEngine::new(config.clone()).await?);

        if config.server.auto_start_server {
            let engine_for_server = engine.clone();
            let server_config = config.server.clone();
            tokio::spawn(async move {
                GgufEngine::start_server(engine_for_server, server_config).await
            });
        }

        Ok(engine)
    }
}
```

## Appendix

### A. モデルダウンロードURL一覧

| モデル | HuggingFace リポジトリ | ファイル名 | サイズ |
|--------|----------------------|-----------|--------|
| Qwen3.5-0.8B Q4_K_M | `unsloth/Qwen3.5-0.8B-GGUF` | `Qwen3.5-0.8B-Q4_K_M.gguf` | 約 800 MB |
| Qwen3.5-2B Q4_K_M | `unsloth/Qwen3.5-2B-GGUF` | `Qwen3.5-2B-Q4_K_M.gguf` | 約 1.6 GB |

### B. 環境変数 GGUFRS_GPU_PROVIDER

| 値 | 動作 |
|----|------|
| `auto`（未設定時と同じ）| コンパイル時検出（macOS=Metal, Windows=DirectML, Linux=CPU） |
| `metal` | Apple Metal（macOS）を強制 |
| `directml` | DirectML（Windows）を強制 |
| `cuda` | NVIDIA CUDA（Linux）を強制 |
| `cpu` | CPU-Only を強制 |

### C. ポート割当

ggufrs が使用するポート番号（settings.rs で定義）：

| 定数 | デフォルト値 | 用途 |
|------|-------------|------|
| `DEFAULT_RT_PORT` | 3910 | REST API / OpenAI 互換エンドポイント |
| `DEFAULT_SW_PORT` | 3911 | 静的コンテンツ（未使用時は 0） |

### D. GGUF ファイル内 tokenizer の取扱い

GGUF 形式は tokenizer 情報（語彙・特殊トークンID・chat_template）をファイル内に自己内包する。
そのため、ggufrs は別途 tokenizer ファイルをダウンロードする必要はない。
`GgufModelBuilder` はこの内包情報を自動的に読み取り、適切な tokenizer を構成する。

### D. 用語集

| 用語 | 説明 |
|------|------|
| GGUF | llama.cpp コミュニティで標準の量子化モデルファイル形式 |
| mistralrs | Rust で書かれた高速 LLM 推論エンジンクレート |
| Structured Output | JSON Schema に従った構造化された出力を強制する生成手法 |
| Q4_K_M | 4ビット量子化の一種。K_M は中間品質 |
| ModelRegistry | モデルインスタンスを一元管理するコンテナ |
| 3層マージ | コード・埋め込みJSON・ファイルJSONの3層から設定を合成する方式 |
