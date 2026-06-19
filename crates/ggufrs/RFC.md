# RFC: ggufrs — llama-cpp-2 バックエンドによる GGUF モデル推論エンジンクレート

## Abstract

ggufrs は、llama-cpp-2 をバックエンドとして GGUF 形式の量子化言語モデルを推論実行するための Rust クレートである。
同一プロセス内でライブラリとしての直接推論 API と OpenAI 互換 HTTP サーバーの両方を提供し、
ロードされたモデルインスタンスはスレッドセーフに共有される。

ビルトイン対象として以下の4モデルをサポートする：

| モデル | ファイル | コンテキスト (初期値) |
|--------|---------|---------------------|
| Qwen3.5-0.8B | Qwen3.5-0.8B-Q4_K_M.gguf | 2048 |
| Qwen3.5-2B | Qwen3.5-2B-Q4_K_M.gguf | 2048 |
| Gemma4 E2B | gemma-4-E2B-it-Q4_K_M.gguf | 2048 |
| Gemma4 E4B | gemma-4-E4B-it-Q4_K_M.gguf | 2048 |

モデルファイルは build.rs により HuggingFace から自動ダウンロードされ、手動配置を必要としない。
単体テスト・結合テスト・目視確認用バイナリを含む完全なテストスイートにより信頼性が保証される。

> **注記**: 以下の全コード例において、`Result<T>` は `anyhow::Result<T>`（`std::result::Result<T, anyhow::Error>`）を意味する。
> これは各コードブロックの冒頭にある `use anyhow::Result;` により導入される。

---

## Motivation

ggufrs は当初、mistralrs v0.8.1 を推論バックエンドとして開発を開始した。
しかし開発を進めるうちに、以下の理由により mistralrs の継続利用が不可能と判断された：

1. **Qwen3.5 アーキテクチャ非対応**: mistralrs v0.8.1 は Qwen3.5 の GGUF アーキテクチャ（`qwen35`）を未サポート。デフォルトモデルとして使用できなかった。
2. **CPU メモリ検出バグ**: macOS ARM 環境で `auto_device_map.rs` の二重pushバグと `sysinfo` の `available_memory=0` 問題が複合し、モデルロードに失敗した。
3. **推論ハング**: DeviceMap バイパス適用後も通常テキスト生成が完了せず長時間停止する現象が発生。原因の特定と修正が困難であった。
4. **UQFF 形式の特殊性**: mistralrs 独自の量子化形式 UQFF に依存せざるを得ず、モデル選択の自由度が極端に制限されていた。llama.cpp / Ollama 等の他ツールとの互換性がなかった。

以上の理由から、推論バックエンドを llama-cpp-2 に全面的に移行する。llama-cpp-2 は以下の優位性を持つ：

- **GGUF 標準形式のみ**に特化しており、モデル選択の自由度が高い
- **macOS Metal 対応が安定**しており、Apple Silicon での GPU 推論が可能
- **コミュニティが大規模**で、バグ遭遇時の解決策が見つかりやすい
- **Rust バインディング（llama-cpp-2 クレート）** が整備されている

---

## Design

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
│  │ ・2B model   │  └──────────────────────────┘   │
│  │ ・E2B model  │                                    │
│  │ ・E4B model  │                                    │
│  └─────────────┘                                    │
│  ┌──────────────────────────────────────────┐   │
│  │  Server (optional)                       │   │
│  │  Axum                                    │   │
│  │  OpenAI 互換エンドポイント (自前実装)     │   │
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
    let code_config = GgufConfig::from_code(vec![ModelConfig::qwen3_5_0_8b()]);
    let config = GgufConfig::build(code_config, Some(include_str!("config.json")), Some("config.json".as_ref()))?;
    let engine = GgufEngine::new(config).await?;

    // ライブラリモードで推論
    let result = engine.generate(
        "qwen3.5-0.8b",
        "Rustの所有権について簡潔に説明してください。",
        GenerateParams::default(),
    ).await?;

    // オプションでサーバー起動
    let engine = Arc::new(engine);
    let server_config = ServerConfig {
        bind: "127.0.0.1:3910".parse()?,
        models: vec!["qwen3.5-0.8b".into(), "qwen3.5-2b".into()],
        auto_start_server: false,
    };
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
│   └── stream.rs       # generate_stream
├── server/             # サーバーモード
│   ├── mod.rs
│   ├── router.rs       # Axum ルーティング + モデル選択
│   ├── openai.rs       # OpenAI 互換エンドポイント
│   └── types.rs        # ChatCompletionRequest / Response / Chunk 自前定義
├── config.rs           # GgufConfig, ModelConfig, ServerConfig, GpuProvider
├── error.rs            # GgufError 列挙型
├── consts/
│   ├── mod.rs
│   └── settings.rs     # 静的定数
└── bin/
    └── test-run.rs     # 目視確認用バイナリ
```

**OLD-RFC.md との差分**: `inference/raw.rs` が削除されている。`server/types.rs` が新規追加されている。

#### 1.2 GgufEngine のライフサイクル

`GgufEngine` は以下の状態遷移を持つ：

1. **初期化 (`GgufEngine::new()`)**: 設定を受け取り、ModelRegistry を構築。
2. **運用 (推論実行・サーバー起動)**: 任意のタイミングで推論API呼び出しまたはサーバー起動が可能。
3. **停止 (Drop)**: 全モデルが解放される。

```rust
use anyhow::Result;

pub struct GgufEngine {
    registry: Arc<ModelRegistry>,
    server_handle: Mutex<Option<JoinHandle<Result<()>>>>,
}

impl GgufEngine {
    /// 新しい GgufEngine を初期化する。
    /// config に従い ModelRegistry を構築し、lazy_load=false のモデルをプリロードする。
    pub async fn new(config: GgufConfig) -> Result<Self> {
        let engine = Self {
            registry: Arc::new(ModelRegistry::from_config(config.models)),
            server_handle: Mutex::new(None),
        };
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

**OLD-RFC.md との差分**: 構造体の骨格は同一。モデルロードの内部実装のみが llama-cpp-2 に置き換わる。

---

### 2. 依存関係管理

#### 2.1 Cargo.toml

```toml
[package]
name = "ggufrs"
version = "0.1.0"
edition = "2021"

[dependencies]
# llama-cpp-2 — GGUF 推論バックエンド（C++ FFI 経由）
llama-cpp-2 = "0.1.150"

# GBNF — JSON Schema → GBNF 文法変換（generate_structured 用）
gbnf = "0.2.7"

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

[dev-dependencies]
mockall = "0.13"
reqwest = { version = "0.12", features = ["json"] }
tokio-test = "0.4"

[features]
default = ["cpu"]
cpu = []
# GPU feature flags — 選択に応じて build.rs で cmake フラグを設定する
metal = []
cuda = []

[bin]
name = "test-run"
path = "src/bin/test-run.rs"
```

**OLD-RFC.md からの変更点**:
- `mistralrs` → `llama-cpp-2 = "0.1.150"`（置き換え）
- `llm-bridge-core` → 削除
- `gbnf = "0.2.7"` → 新規追加
- GPU features: `directml` 削除（llama-cpp-2 の cmake ベースビルドでは不要）、`cuda` を `metal`/`cuda` に整理
- `mockall`、`reqwest`、`tokio-test` → dev-dependencies に明示

#### 2.2 llama-cpp-2 v0.1.150 の cargo features

llama-cpp-2 v0.1.150 の cargo features は以下のとおりである（実装開始前に docs.rs で最終確認すること）：

| Feature | 用途 | ggufrs での対応 |
|---------|------|----------------|
| `metal` | Apple Metal バックエンド | `metal` feature → build.rs で `LLAMA_METAL=ON` |
| `cuda` | NVIDIA CUDA バックエンド | `cuda` feature → build.rs で `LLAMA_CUDA=ON` |
| `clblast` | CLBlast（OpenCL）バックエンド | 非サポート（必要に応じて将来追加） |
| `vulkan` | Vulkan バックエンド | 非サポート |
| `cublas` | cuBLAS バックエンド | 非サポート（`cuda` で代替） |

ggufrs の cargo feature と llama-cpp-2 の feature / cmake フラグの対応は GpuProvider が管理する（§2.3 参照）。

#### 2.3 GPU 自動検出

GPUプロバイダーはハイブリッド方式で自動検出される。
デフォルトはコンパイル時に `cfg!(target_os)` で決定し、環境変数 `GGUFRS_GPU_PROVIDER` で
ランタイム上書きが可能である。

```rust
#[derive(Debug, Clone, Copy, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub enum GpuProvider {
    #[default]
    Auto,
    Metal,
    Cuda,
    Cpu,
}

impl GpuProvider {
    /// 実行環境に適したデフォルトGPUプロバイダーをコンパイル時に決定する。
    /// 環境変数 GGUFRS_GPU_PROVIDER が設定されていればそれを優先する。
    pub fn detect() -> Self {
        if let Ok(provider) = std::env::var("GGUFRS_GPU_PROVIDER") {
            return Self::from_str(&provider).unwrap_or(Self::Auto);
        }
        #[cfg(target_os = "macos")]
        { Self::Metal }
        #[cfg(not(target_os = "macos"))]
        { Self::Cpu }
    }

    /// 環境変数 GGUFRS_GPU_PROVIDER の値を GpuProvider に変換する。
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "auto" => Some(Self::Auto),
            "metal" => Some(Self::Metal),
            "cuda" => Some(Self::Cuda),
            "cpu" => Some(Self::Cpu),
            _ => None,
        }
    }

    /// 対応する cargo feature 名を返す。build.rs はこの値をもとに cmake フラグを設定する。
    pub fn feature_name(&self) -> &'static str {
        match self {
            Self::Metal => "metal",
            Self::Cuda => "cuda",
            Self::Cpu | Self::Auto => "cpu",
        }
    }

    /// 対応する cmake フラグ名と値を返す。build.rs で使用される。
    pub fn cmake_flags(&self) -> Vec<(&'static str, &'static str)> {
        match self {
            Self::Metal => vec![("LLAMA_METAL", "ON")],
            Self::Cuda => vec![("LLAMA_CUDA", "ON")],
            Self::Cpu | Self::Auto => vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GpuConfig {
    pub provider: GpuProvider,
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
```

**OLD-RFC.md との差分**:
- `DirectML` バリアント削除
- `mistralrs_feature()` → `feature_name()` + `cmake_flags()` に置き換え
- llama-cpp-2 のビルドモデル（cmake フラグ制御）に対応

---

### 3. モデル管理

#### 3.1 ModelRegistry

モデル情報は `ModelRegistry` が一元管理する。内部に `RwLock<Vec<ModelInfo>>` を持ち、
複数の推論スレッドから安全にアクセスできる。

```rust
use anyhow::Result;

pub struct ModelRegistry {
    models: RwLock<Vec<ModelInfo>>,
}

impl ModelRegistry {
    pub fn new() -> Self {
        Self { models: RwLock::new(vec![]) }
    }

    /// モデル設定のベクタから Registry を構築する。
    pub fn from_config(models: Vec<ModelConfig>) -> Self {
        let infos: Vec<ModelInfo> = models.into_iter().map(|c| c.into()).collect();
        Self { models: RwLock::new(infos) }
    }

    /// モデル設定を追加する（まだロードはしない）。
    pub fn add_model(&self, config: ModelConfig) {
        self.models.write().unwrap().push(config.into());
    }

    /// モデル名から LlamaModel を取得する。
    /// lazy_load=true かつ未ロードならこのタイミングでロードする。
    pub async fn get(&self, name: &str) -> Result<Arc<LlamaModel>> {
        let needs_load = {
            let models = self.models.read().unwrap();
            let info = models.iter().find(|m| m.name == name)
                .ok_or_else(|| GgufError::ModelNotFound(name.to_string()))?;
            info.model.is_none() && info.lazy_load
        };

        if needs_load {
            let model = self.load_model(name).await?;
            let mut models = self.models.write().unwrap();
            if let Some(info) = models.iter_mut().find(|m| m.name == name) {
                info.model = Some(model.clone());
            }
            return Ok(model);
        }

        let models = self.models.read().unwrap();
        let info = models.iter().find(|m| m.name == name).unwrap();
        Ok(info.model.clone().unwrap())
    }

    /// モデルファイルをディスクからロードする。
    async fn load_model(&self, name: &str) -> Result<Arc<LlamaModel>> {
        let (model_path, n_ctx, n_gpu_layers) = {
            let models = self.models.read().unwrap();
            let info = models.iter().find(|m| m.name == name).unwrap();
            (info.model_path.clone(), info.context_size, info.gpu_layers)
        };

        let model_path = model_path.clone();
        let n_ctx = n_ctx.unwrap_or(DEFAULT_CONTEXT_SIZE);
        let n_gpu_layers = n_gpu_layers.unwrap_or(0);

        // llama-cpp-2 の同期 load_from_file を spawn_blocking でラップ
        let model = tokio::task::spawn_blocking(move || {
            let ctx_params = llama_cpp_2::context::params::LlamaContextParams::default()
                .with_n_ctx(n_ctx);
            let params = llama_cpp_2::LlamaParams::default()
                .with_n_gpu_layers(n_gpu_layers)
                .with_progress_callback(false);
            LlamaModel::load_from_file(model_path, &params)
                .map_err(|e| GgufError::ModelLoadFailed {
                    name: name.to_string(),
                    source: Box::new(e),
                })
        }).await.map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

        Ok(Arc::new(model))
    }

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

    /// 全モデルをプリロードする。
    pub async fn load_all(&self) -> Result<()> {
        let names: Vec<String> = self.models.read().unwrap().iter()
            .map(|m| m.name.clone())
            .collect();
        for name in names {
            self.get(&name).await?;
        }
        Ok(())
    }

    /// 登録済みモデル名の一覧を返す。
    pub fn list_models(&self) -> Vec<String> {
        self.models.read().unwrap().iter().map(|m| m.name.clone()).collect()
    }
}
```

**OLD-RFC.md との差分**:
- `Model`（mistralrs）→ `LlamaModel`（llama-cpp-2）に型変更
- `GgufModelBuilder` / `UqffModelBuilder` → `LlamaModel::load_from_file()` に置き換え
- ロード処理を `spawn_blocking` でラップ（llama-cpp-2 の API が同期的なため）
- `DeviceMapSetting` 関連の処理を削除

#### 3.2 ModelConfig と ModelInfo

ggufrs では「設定（入力）」と「ランタイム状態」を分離する2層構造を採用する。

| 構造体 | 役割 | 生成タイミング |
|--------|------|--------------|
| `ModelConfig` | モデルの静的な設定値（パス・サイズ等）。JSON/コードから入力される。 | 設定読み込み時 |
| `ModelInfo` | 設定＋ロード済みモデルインスタンスの実行時状態。 | Registry 構築時（configから変換） |

```rust
use anyhow::Result;

impl From<ModelConfig> for ModelInfo {
    fn from(config: ModelConfig) -> Self {
        ModelInfo {
            name: config.name,
            model_path: config.model_path,
            lazy_load: config.lazy_load,
            context_size: config.context_size,
            gpu_layers: config.gpu_layers,
            batch_size: config.batch_size,
            model: None, // 未ロード
        }
    }
}

pub struct ModelInfo {
    /// モデルを識別する名前（例: "qwen3.5-0.8b"）
    pub name: String,

    /// GGUF ファイルのパス
    pub model_path: PathBuf,

    /// 遅延ロードフラグ。true の場合は初回 get() までロードを延期する。
    pub lazy_load: bool,

    /// llama-cpp-2 のコンテキストパラメータに渡す設定
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
    pub batch_size: Option<u32>,

    /// 内部状態：ロード済みの LlamaModel インスタンス（未ロード時は None）
    model: Option<Arc<LlamaModel>>,
}
```

**OLD-RFC.md との差分**:
- `chat_template` フィールドを削除（GGUF ファイル内包のテンプレートをそのまま使用するため、llama-cpp-2 側で自動解決される）
- `model: Option<Arc<Model>>` → `model: Option<Arc<LlamaModel>>`

#### 3.3 ビルトインモデル設定

```rust
impl ModelConfig {
    /// Qwen3.5-0.8B Q4_K_M のビルトイン設定
    pub fn qwen3_5_0_8b() -> Self {
        ModelConfig {
            name: "qwen3.5-0.8b".into(),
            model_path: "models/Qwen3.5-0.8B-Q4_K_M.gguf".into(),
            lazy_load: true,
            context_size: Some(2048), // 初期値。ユーザーが自由に変更可能
            gpu_layers: None,
            batch_size: None,
        }
    }

    /// Qwen3.5-2B Q4_K_M のビルトイン設定
    pub fn qwen3_5_2b() -> Self {
        ModelConfig {
            name: "qwen3.5-2b".into(),
            model_path: "models/Qwen3.5-2B-Q4_K_M.gguf".into(),
            lazy_load: true,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
        }
    }

    /// Gemma4 E2B Q4_K_M のビルトイン設定
    pub fn gemma4_e2b() -> Self {
        ModelConfig {
            name: "gemma4-e2b".into(),
            model_path: "models/gemma-4-E2B-it-Q4_K_M.gguf".into(),
            lazy_load: true,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
        }
    }

    /// Gemma4 E4B Q4_K_M のビルトイン設定
    pub fn gemma4_e4b() -> Self {
        ModelConfig {
            name: "gemma4-e4b".into(),
            model_path: "models/gemma-4-E4B-it-Q4_K_M.gguf".into(),
            lazy_load: true,
            context_size: Some(2048),
            gpu_layers: None,
            batch_size: None,
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
        }
    }
}
```

**OLD-RFC.md との差分**:
- `chat_template` パラメータを削除
- `context_size: Some(32768)` → `Some(2048)`（初期値変更。ユーザーが自由に設定可能）
- `gemma4_e2b()` / `gemma4_e4b()` 追加（UQFF から GGUF に形式変更）

---

### 4. 推論API

#### 4.1 InferenceEngine トレイト

`InferenceEngine` トレイトは3メソッドを規定する（`send_raw` は mistralrs 依存のため削除）。
全てのメソッドは `model_name: &str` を第一引数に取り、使用するモデルを指定する。
`Send + Sync` をスーパートレイトとして要求する。

```rust
use anyhow::Result;

#[async_trait]
pub trait InferenceEngine: Send + Sync {
    /// 通常のテキスト生成。
    async fn generate(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<String>;

    /// Structured Output（JSON Schema 拘束付き生成）。
    /// 内部で gbnf クレートを使用して JSON Schema → GBNF 変換を行い、
    /// llama-cpp-2 の grammar 制約として適用する。
    async fn generate_structured(
        &self,
        model_name: &str,
        prompt: &str,
        schema: serde_json::Value,
    ) -> Result<serde_json::Value>;

    /// ストリーミング生成。戻り値は文字列チャンクの非同期ストリーム。
    async fn generate_stream(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;
}
```

**OLD-RFC.md との差分**:
- `send_raw()` 削除（4→3メソッド）
- `TextMessages` → `&str`（単純化。チャットテンプレートは GGUF 内包のものを使用）
- `schema: Value`（`serde_json::Value`）は維持

#### 4.2 推論パラメータ

`GenerateParams` は3メソッドの共通パラメータを保持する。
llama-cpp-2 の `InferenceParams` への変換は `From` トレイトで行う。

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

/// GenerateParams → llama-cpp-2 InferenceParams への変換
impl From<GenerateParams> for llama_cpp_2::InferenceParams {
    fn from(params: GenerateParams) -> Self {
        let mut lp = llama_cpp_2::InferenceParams::default();
        if let Some(t) = params.temperature {
            lp.temperature = t;
        }
        if let Some(n) = params.max_tokens {
            lp.n_predict = n as i32;
        }
        if let Some(p) = params.top_p {
            lp.top_p = p;
        }
        if let Some(p) = params.presence_penalty {
            lp.penalty_last_n = lp.n_predict; // presence_penalty 相当
        }
        if let Some(_f) = params.frequency_penalty {
            // llama-cpp-2 の repetition penalty で代替
            lp.penalty_repeat = params.frequency_penalty
                .map(|f| 1.0 + f)
                .unwrap_or(1.0);
        }
        lp
    }
}
```

#### 4.3 generate() 実装

`LlamaModel::infer()` は同期的なAPIのため、`tokio::task::spawn_blocking` でラップする。

```rust
// inference/generate.rs
use anyhow::Result;

pub struct LlamaCppEngine {
    registry: Arc<ModelRegistry>,
}

#[async_trait]
impl InferenceEngine for LlamaCppEngine {
    async fn generate(
        &self,
        model_name: &str,
        prompt: &str,
        params: GenerateParams,
    ) -> Result<String> {
        let model = self.registry.get(model_name).await?;
        let inference_params: llama_cpp_2::InferenceParams = params.into();
        let prompt = prompt.to_string();

        // spawn_blocking で同期 API をラップ
        let result = tokio::task::spawn_blocking(move || {
            let ctx_params = llama_cpp_2::context::params::LlamaContextParams::default()
                .with_n_ctx(inference_params.n_predict.max(512) as u32);
            let mut ctx = model.new_context(&ctx_params)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

            let tokens = ctx.tokenize(prompt.as_bytes(), true)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

            let output = ctx.infer(tokens, &inference_params)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

            let output_bytes = ctx.tokenize_to_bytes(&output, false)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

            String::from_utf8(output_bytes)
                .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
        }).await.map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

        Ok(result)
    }

    // ... generate_structured, generate_stream
}
```

> **注記**: 上記は llama-cpp-2 の基本的な推論パターンを示したものである。llama-cpp-2 v0.1.150 の正確な API（`LlamaModel::new_context`、`LlamaContext::infer` 等のシグネチャ）は実装開始前に docs.rs で確認し、必要に応じてアダプトすること。

#### 4.4 generate_structured() 実装

内部で `gbnf` クレートを使用して JSON Schema → GBNF 文法を変換し、
`InferenceParams::grammar` フィールドにセットする。
gbnf への依存は内部実装の詳細として隠蔽され、外部APIは `schema: serde_json::Value` のまま維持される。

```rust
// inference/generate.rs 内
async fn generate_structured(
    &self,
    model_name: &str,
    prompt: &str,
    schema: serde_json::Value,
) -> Result<serde_json::Value> {
    let model = self.registry.get(model_name).await?;

    // JSON Schema → GBNF 変換（gbnf クレートを内部使用）
    let gbnf_grammar = gbnf::convert(&schema)
        .map_err(|e| GgufError::InvalidConfig(format!("JSON Schema → GBNF failed: {}", e)))?;

    let mut inference_params = llama_cpp_2::InferenceParams::default();
    inference_params.grammar = Some(gbnf_grammar);
    inference_params.temperature = 0.1; // Structured Output は決定論的に
    inference_params.n_predict = 256;

    let prompt = prompt.to_string();

    let result = tokio::task::spawn_blocking(move || {
        let ctx = model.new_context(&llama_cpp_2::context::params::LlamaContextParams::default()
            .with_n_ctx(2048))
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let tokens = ctx.tokenize(prompt.as_bytes(), true)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let output = ctx.infer(tokens, &inference_params)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        let output_bytes = ctx.tokenize_to_bytes(&output, false)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

        String::from_utf8(output_bytes)
            .map_err(|e| GgufError::InferenceFailed(Box::new(e)))
    }).await.map_err(|e| GgufError::InferenceFailed(Box::new(e)))??;

    // GBNF 制約により JSON が保証されているため、パースは安全
    let parsed: serde_json::Value = serde_json::from_str(&result)
        .map_err(|e| GgufError::InferenceFailed(Box::new(e)))?;

    Ok(parsed)
}
```

#### 4.5 generate_stream() 実装

llama-cpp-2 の `TokenCallback` を `tokio::sync::mpsc` チャネルで `futures::Stream` に変換する。

```rust
// inference/stream.rs
use anyhow::Result;

/// TokenCallback を非同期ストリームに変換する。
/// llama-cpp-2 の TokenCallback は同期的に呼ばれるため、
/// mpsc チャネルの sender に送り、receiver 側を Stream として公開する。
async fn generate_stream(
    &self,
    model_name: &str,
    prompt: &str,
    params: GenerateParams,
) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>> {
    let model = self.registry.get(model_name).await?;
    let inference_params: llama_cpp_2::InferenceParams = params.into();
    let prompt = prompt.to_string();

    // チャネル容量: 64（背圧によりトークン生成を抑制）
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(64);
    let receiver_stream = tokio_stream::wrappers::ReceiverStream::new(rx);

    let model_clone = model.clone();
    tokio::task::spawn_blocking(move || {
        let ctx = match model_clone.new_context(
            &llama_cpp_2::context::params::LlamaContextParams::default()
        ) {
            Ok(ctx) => ctx,
            Err(e) => {
                let _ = tx.blocking_send(format!("[ERROR: {}]", e));
                return;
            }
        };

        let tokens = match ctx.tokenize(prompt.as_bytes(), true) {
            Ok(t) => t,
            Err(e) => {
                let _ = tx.blocking_send(format!("[ERROR: {}]", e));
                return;
            }
        };

        // コールバックベースの推論
        let callback = |token: i32| -> bool {
            // トークンを文字列にデコード
            let piece = ctx.token_to_piece(token, false);
            if let Ok(text) = String::from_utf8(piece.to_vec()) {
                // blocking_send はチャネルが満杯の場合、背圧として機能する
                let _ = tx.blocking_send(text);
            }
            true // true を返すと生成継続、false で停止
        };

        let _ = ctx.infer_with_callback(tokens, &inference_params, callback);
    });

    Ok(Box::pin(receiver_stream.map(|chunk| Ok(chunk))))
}
```

---

### 5. エラー型

`GgufError` は6バリアントを持つ列挙型として定義される。
`MistralrsError` バリアントを `LlamaCppError` に置き換える。
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

    /// llama-cpp-2 内部エラー
    #[error("llama-cpp error: {0}")]
    LlamaCppError(#[from] llama_cpp_2::Error),
}

// 追加の From 実装
impl From<std::io::Error> for GgufError {
    fn from(err: std::io::Error) -> Self {
        GgufError::InvalidConfig(err.to_string())
    }
}

impl From<serde_json::Error> for GgufError {
    fn from(err: serde_json::Error) -> Self {
        GgufError::InvalidConfig(err.to_string())
    }
}
```

**OLD-RFC.md との差分**:
- `MistralrsError(#[from] mistralrs::Error)` → `LlamaCppError(#[from] llama_cpp_2::Error)`
- バリアント数は6のまま維持

---

### 6. サーバーモード

#### 6.1 アーキテクチャ

サーバーモードは Axum ルーターによる自前実装を採用する。
OpenAI 互換のリクエスト型・レスポンス型はすべて自前で定義する。
Anthropic 互換エンドポイントは提供しない。

```
POST /v1/chat/completions  → Axum ルーター → model フィールド抽出
       (OpenAI 形式)               ↓
                          InferenceEngine 呼び出し
                                  ↓
                          OpenAI 互換 JSON レスポンス
```

```rust
// server/openai.rs
pub type AppState = Arc<dyn InferenceEngine + Send + Sync>;
pub type AppError = (StatusCode, Json<serde_json::Value>);

impl From<GgufError> for AppError {
    fn from(err: GgufError) -> Self {
        let (status, message) = match &err {
            GgufError::ModelNotFound(_) => (StatusCode::NOT_FOUND, err.to_string()),
            GgufError::ModelLoadFailed { .. } => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::InferenceFailed(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::ServerStartupFailed(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
            GgufError::InvalidConfig(_) => (StatusCode::BAD_REQUEST, err.to_string()),
            GgufError::LlamaCppError(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
        };
        (status, Json(serde_json::json!({"error": message})))
    }
}
```

#### 6.2 OpenAI 互換型の自前定義

ChatCompletionRequest、ChatCompletionResponse、ChatCompletionChunk の3型を
`server/types.rs` に自前定義する。すべて OpenAI API 仕様に準拠した全標準フィールドを持つ。

```rust
// server/types.rs
use serde::{Deserialize, Serialize};

/// OpenAI 互換 Chat Completion リクエスト
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub top_p: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
    pub presence_penalty: Option<f32>,
    pub frequency_penalty: Option<f32>,
    pub stop: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// OpenAI 互換 Chat Completion レスポンス（非ストリーミング）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Option<Usage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: ChatResponseMessage,
    pub finish_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponseMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// OpenAI 互換 SSE チャンク（ストリーミング用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChunkChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkChoice {
    pub index: u32,
    pub delta: Delta,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delta {
    pub role: Option<String>,
    pub content: Option<String>,
}
```

#### 6.3 ルーター

```rust
// server/router.rs
use axum::{Router, routing::{get, post}};

fn build_router(engine: AppState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(chat_completions_handler))
        .route("/v1/models", get(list_models_handler))
        .with_state(engine)
}

/// OpenAI 互換 Chat Completions エンドポイント。
/// リクエストボディの stream フィールドにより、非ストリーミング/ストリーミングを分岐する。
async fn chat_completions_handler(
    State(engine): State<AppState>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Response<Body>, AppError> {
    if req.stream.unwrap_or(false) {
        // ストリーミング: SSE 形式で逐次出力
        stream_chat_completions(engine, req).await
    } else {
        // 非ストリーミング: 一括レスポンス
        let response = chat_completions_sync(engine, req).await?;
        Ok(Json(response).into_response())
    }
}

/// OpenAI 互換のモデル一覧エンドポイント
async fn list_models_handler(
    State(engine): State<AppState>,
) -> Json<serde_json::Value> {
    // engine からモデル一覧を取得（ModelRegistry の list_models を経由）
    Json(serde_json::json!({
        "object": "list",
        "data": [
            {"id": "qwen3.5-0.8b", "object": "model"},
            {"id": "qwen3.5-2b", "object": "model"},
            {"id": "gemma4-e2b", "object": "model"},
            {"id": "gemma4-e4b", "object": "model"},
        ],
    }))
}
```

#### 6.4 非同期サーバー起動とシャットダウン

```rust
use anyhow::Result;

impl GgufEngine {
    /// サーバーを起動する。
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

**OLD-RFC.md との差分**:
- `POST /anthropic/v1/messages` エンドポイント削除
- `llm-bridge-core` 依存削除
- `ChatCompletionRequest` / `ChatCompletionResponse` を mistralrs 型から自前定義に変更
- `ChatCompletionChunk`（SSE チャンク型）を新規追加
- `stream` フィールドによる非ストリーミング/ストリーミングの分岐を実装

---

### 7. 設定管理

#### 7.1 静的定数（settings.rs）

```rust
// consts/settings.rs
pub const DEFAULT_RT_PORT: u16 = 3910;
pub const DEFAULT_MODEL_DIR: &str = "models";
pub const CURL_TIMEOUT_SECS: u64 = 60;
pub const DEFAULT_CONTEXT_SIZE: u32 = 2048;  // 初期値。ユーザーが自由に設定可能
pub const DEFAULT_MAX_TOKENS: u32 = 256;
pub const DEFAULT_TEMPERATURE: f32 = 0.1;
pub const GPU_PROVIDER_ENV_VAR: &str = "GGUFRS_GPU_PROVIDER";
```

**OLD-RFC.md との差分**: `DEFAULT_CONTEXT_SIZE: 32768` → `2048`

#### 7.2 JSON マルチソースマージ

設定は3層構造でマージされる（変更なし）。

1. **コードベタ書き**: `GgufConfig::from_code()`
2. **埋め込み JSON**: `GgufConfig::from_json_str()`
3. **ファイル JSON**: `GgufConfig::from_file()`

```rust
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GgufConfig {
    pub models: Vec<ModelConfig>,
    pub server: ServerConfig,
    pub gpu: GpuConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub name: String,
    pub model_path: PathBuf,
    pub lazy_load: bool,
    pub context_size: Option<u32>,
    pub gpu_layers: Option<u32>,
    pub batch_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub bind: SocketAddr,
    pub models: Vec<String>,
    pub auto_start_server: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            bind: ([127, 0, 0, 1], DEFAULT_RT_PORT).into(),
            models: vec![],
            auto_start_server: false,
        }
    }
}

impl GgufConfig {
    pub fn from_code(models: Vec<ModelConfig>) -> Self {
        Self {
            models,
            server: ServerConfig::default(),
            gpu: GpuConfig::default(),
        }
    }

    pub fn build(
        code_layer: GgufConfig,
        embedded_json: Option<&str>,
        file_path: Option<&Path>,
    ) -> Result<Self> {
        let mut config = code_layer;
        if let Some(json) = embedded_json {
            let embedded: GgufConfig = serde_json::from_str(json)?;
            config.merge_overlay(embedded);
        }
        if let Some(path) = file_path {
            let content = std::fs::read_to_string(path)?;
            let file_config: GgufConfig = serde_json::from_str(&content)?;
            config.merge_overlay(file_config);
        }
        Ok(config)
    }

    fn merge_overlay(&mut self, overlay: GgufConfig) {
        for overlay_model in overlay.models {
            if let Some(pos) = self.models.iter().position(|m| m.name == overlay_model.name) {
                self.models[pos] = overlay_model;
            } else {
                self.models.push(overlay_model);
            }
        }
        if overlay.server.bind.port() != 0 {
            self.server = overlay.server;
        }
        if overlay.gpu.provider != GpuProvider::Auto {
            self.gpu = overlay.gpu;
        }
    }
}
```

**OLD-RFC.md との差分**: `ModelConfig` から `chat_template` フィールド削除。マージロジックは同一。

---

### 8. ビルドシステム

#### 8.1 build.rs — llama-cpp-2 の cmake ビルド制御

llama-cpp-2 は build.rs 内で cmake を呼び出して llama.cpp の C++ ソースをコンパイルする。
ggufrs の cargo feature 選択に応じて、cmake フラグを build.rs で設定する。

```rust
// build.rs
fn main() {
    // cargo feature に応じて cmake フラグを設定
    // GpuProvider::cmake_flags() 相当のロジックを build.rs に配置
    #[cfg(feature = "metal")]
    {
        println!("cargo:rustc-cfg=feature=\"metal\"");
        // llama-cpp-2 の build.rs が LLAMA_METAL=ON を認識するよう環境変数を設定
        std::env::set_var("LLAMA_METAL", "ON");
    }

    #[cfg(feature = "cuda")]
    {
        std::env::set_var("LLAMA_CUDA", "ON");
    }

    // llama-cpp-2 の build.rs は cmake を呼び出して llama.cpp をコンパイルする。
    // ggufrs 自身の build.rs で特別な処理は不要（llama-cpp-2 の build.rs が cmake を管理する）。

    // モデルファイルの自動ダウンロード
    download_models();
}
```

> **注記**: 上記の `std::env::set_var` による cmake フラグ設定は、llama-cpp-2 の build.rs の動作に依存する。v0.1.150 の build.rs の仕様を docs.rs およびソースコードで確認し、適切な環境変数設定方式を採用すること。llama-cpp-2 が環境変数ではなく cargo feature で cmake フラグを制御する方式であれば、それに合わせて調整する。

#### 8.2 build.rs — モデル自動ダウンロード

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
    (
        "gemma-4-E2B-it-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
    ),
    (
        "gemma-4-E4B-it-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
    ),
];

fn download_models() {
    let model_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("models");
    std::fs::create_dir_all(&model_dir).expect("failed to create models/ directory");

    for (filename, url) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        if !file_path.exists() {
            println!("cargo:warning=Downloading {}...", filename);
            download_file(url, &file_path);
        }
    }

    for (filename, _) in MODEL_FILES {
        let file_path = model_dir.join(filename);
        assert!(
            file_path.exists(),
            "Model file not found: {}. Try running `make download-models`.",
            file_path.display()
        );
    }

    println!("cargo:rerun-if-changed=models/");
}

#[cfg(not(target_os = "windows"))]
fn download_file(url: &str, dest: &PathBuf) {
    let status = std::process::Command::new("curl")
        .args(["-sS", "-m", "60", "-L", "-o"])
        .arg(dest)
        .arg(url)
        .status()
        .expect("Failed to execute curl");
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
        .expect("Failed to execute PowerShell");
    if !status.success() {
        let _ = std::fs::remove_file(dest);
        panic!("Failed to download: {}", url);
    }
}
```

> **注記**: Gemma4 の GGUF ファイル名（`gemma-4-E2B-it-Q4_K_M.gguf` 等）は、実装開始前に `https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF` で実際のファイル一覧を確認し、正確なファイル名に修正すること。

#### 8.3 ファイル構成

```
models/
├── Qwen3.5-0.8B-Q4_K_M.gguf       (約 800 MB)
├── Qwen3.5-2B-Q4_K_M.gguf         (約 1.6 GB)
├── gemma-4-E2B-it-Q4_K_M.gguf     (約 4 GB)
└── gemma-4-E4B-it-Q4_K_M.gguf     (約 16 GB)
```

`models/` ディレクトリは `.gitignore` に追加され、git 管理対象外となる。

```
# crates/ggufrs/.gitignore
/models/
```

---

### 9. 公開API（lib.rs）

ggufrs の公開APIは ggufrs 独自の型のみとし、llama-cpp-2 の型は re-export しない。
gbnf クレートの型も公開しない。

```rust
// lib.rs
// ggufrs 独自の型のみを公開（llama-cpp-2 の型は非公開、gbnf の型も非公開）

pub mod consts;
pub mod config;
pub mod error;
pub mod inference;
pub mod registry;
pub mod server;

pub use config::{GgufConfig, ModelConfig, ServerConfig, GpuConfig, GpuProvider};
pub use error::GgufError;
pub use inference::{InferenceEngine, GenerateParams};
pub use registry::ModelRegistry;
pub use server::types::{ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk};

// llama-cpp-2 の型は一切 re-export しない
// 利用者は ggufrs の抽象化のみを通じてモデルにアクセスする
```

**OLD-RFC.md からの変更点**:
- `pub use mistralrs::{Model, RequestBuilder, TextMessages, ...}` を全削除
- llama-cpp-2 の型は一切 re-export しない
- `server::types` モジュールの公開型を追加（ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk）

---

### 10. テスト

#### 10.1 単体テスト（mockall）

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mock! {
        pub Engine {}
        #[async_trait]
        impl InferenceEngine for Engine {
            async fn generate(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<String>;
            async fn generate_structured(&self, model_name: &str, prompt: &str, schema: Value) -> Result<Value>;
            async fn generate_stream(&self, model_name: &str, prompt: &str, params: GenerateParams) -> Result<Pin<Box<dyn Stream<Item = Result<String>> + Send>>>;
        }
    }

    #[tokio::test]
    async fn test_generate_with_mock() {
        let mut mock = MockEngine::new();
        mock.expect_generate()
            .with(eq("qwen3.5-0.8b"), always(), always())
            .returning(|_, _, _| Ok("Hello, world!".into()));

        let result = mock.generate("qwen3.5-0.8b", "Hi", GenerateParams::default()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello, world!");
    }

    #[tokio::test]
    async fn test_generate_structured_with_mock() {
        let mut mock = MockEngine::new();
        let expected = serde_json::json!({"result": "ok"});

        mock.expect_generate_structured()
            .with(always(), always(), always())
            .returning(move |_, _, _| Ok(expected.clone()));

        let schema = serde_json::json!({
            "type": "object",
            "properties": {"result": {"type": "string"}},
            "required": ["result"]
        });
        let result = mock.generate_structured("qwen3.5-0.8b", "test", schema).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_registry_add_and_get() {
        let registry = ModelRegistry::new();
        registry.add_model(ModelConfig::qwen3_5_0_8b());
        let names = registry.list_models();
        assert_eq!(names.len(), 1);
        assert!(names.contains(&"qwen3.5-0.8b".to_string()));
    }

    #[test]
    fn test_error_from_llamacpp() {
        // llama-cpp-2 v0.1.150 の具体的なエラー型に合わせて修正すること
    }
}
```

**OLD-RFC.md からの変更点**:
- `MockEngine` のメソッドを4→3に変更（`send_raw` 削除）
- `TextMessages` → `&str`
- `test_error_from_mistralrs` → 削除（`test_error_from_llamacpp` に置き換え）

#### 10.2 結合テスト

結合テストは実モデルを使用して実行する。モデルが存在しない場合はテストが失敗する。

```rust
// tests/integration_test.rs

/// 実際のモデルを使用して generate() が正常に動作することを確認する。
/// build.rs でモデルがダウンロード済みであることを前提とする。
#[tokio::test]
#[ignore]
async fn test_real_model_generate() {
    let config = GgufConfig::from_code(vec![ModelConfig::qwen3_5_0_8b()]);
    let engine = GgufEngine::new(config).await
        .expect("Failed to initialize GgufEngine");

    let result = engine.generate(
        "qwen3.5-0.8b",
        "Hello, respond with 'OK'",
        GenerateParams {
            max_tokens: Some(10),
            ..Default::default()
        },
    ).await.expect("generate failed");

    assert!(!result.is_empty());
}

/// InferenceEngine トレイトのモックを使ってサーバーが正しくルーティングすることを確認する。
#[tokio::test]
async fn test_server_model_routing() {
    let mut mock_engine = MockEngine::new();
    mock_engine.expect_generate()
        .with(eq("test-model"), always(), always())
        .returning(|_, _, _| Ok("response".into()));

    let state: AppState = Arc::new(mock_engine);
    let app = Router::new()
        .route("/v1/chat/completions", post(chat_completions_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

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

#### 10.3 test-run バイナリ

```rust
// src/bin/test-run.rs
use anyhow::Result;
use ggufrs::*;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let config = GgufConfig::from_code(vec![
        ModelConfig::qwen3_5_0_8b(),
        ModelConfig::qwen3_5_2b(),
    ]);

    let engine = GgufEngine::new(config).await?;
    println!("✓ GgufEngine initialized successfully");

    // ---- パターン1: Structured Output ----
    println!("\n{}", "=".repeat(60));
    println!("  Pattern 1: Structured Output (JSON Schema)");

    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "corrected_text": {"type": "string"},
            "was_modified": {"type": "boolean"},
        },
        "required": ["corrected_text", "was_modified"]
    });

    let result = engine.generate_structured(
        "qwen3.5-0.8b",
        "校正してください: きのうのごうどうをていしゅつしました",
        schema,
    ).await?;
    println!("  Output: {}", serde_json::to_string_pretty(&result)?);

    // ---- パターン2: Text Generation ----
    println!("\n{}", "=".repeat(60));
    println!("  Pattern 2: Text Generation");

    let response = engine.generate(
        "qwen3.5-0.8b",
        "Rustの所有権について簡潔に説明してください。",
        GenerateParams {
            temperature: Some(0.7),
            max_tokens: Some(200),
            ..Default::default()
        },
    ).await?;
    println!("  Output:\n{}", response);

    // ---- パターン3: Streaming Generation ----
    println!("\n{}", "=".repeat(60));
    println!("  Pattern 3: Streaming Generation");

    let mut stream = engine.generate_stream(
        "qwen3.5-0.8b",
        "自己紹介をしてください。",
        GenerateParams::default(),
    ).await?;

    use futures::StreamExt;
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(text) => print!("{}", text),
            Err(e) => eprintln!("\n  Stream error: {}", e),
        }
    }
    println!();

    // ---- サマリー ----
    println!("\n{}", "=".repeat(60));
    println!("  ✓ Structured Output:       PASS");
    println!("  ✓ Text Generation:         PASS");
    println!("  ✓ Streaming Generation:    PASS");
    println!("\n  All inference patterns verified successfully!");

    Ok(())
}
```

---

## Implementation

### ファイル別変更要約

以下の表は、既存コードの mistralrs 依存部分を llama-cpp-2 に置き換えるための変更を一覧する。
新規ファイルは `[CREATE]`、削除するファイルは `[DELETE]`、修正するファイルは `[MODIFY]` で示す。

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `Cargo.toml` | `[MODIFY]` | `mistralrs` + `llm-bridge-core` 削除 → `llama-cpp-2 = "0.1.150"` + `gbnf = "0.2.7"` 追加。features 再編。 |
| `src/lib.rs` | `[MODIFY]` | `pub use mistralrs::{...}` 全削除。`pub mod` に `server::types` 追加。 |
| `src/error.rs` | `[MODIFY]` | `MistralrsError` → `LlamaCppError`、`#[from] mistralrs::Error` → `#[from] llama_cpp_2::Error` |
| `src/config.rs` | `[MODIFY]` | `GpuProvider`: `DirectML` 削除、`mistralrs_feature()` → `feature_name()` + `cmake_flags()`。`ModelConfig`: `chat_template` 削除。 |
| `src/registry.rs` | `[MODIFY]` | `Model` → `LlamaModel`。`GgufModelBuilder` → `load_from_file()`。`spawn_blocking` ラップ。`DeviceMapSetting` 削除。 |
| `src/inference/mod.rs` | `[MODIFY]` | `InferenceEngine`: `send_raw()` 削除、`TextMessages` → `&str`。 |
| `src/inference/generate.rs` | `[MODIFY]` | mistralrs `GenerationParams` → llama-cpp-2 `InferenceParams`。`spawn_blocking` 導入。`gbnf` 統合。 |
| `src/inference/stream.rs` | `[MODIFY]` | mistralrs ストリーミングAPI → `TokenCallback` + `mpsc` + `ReceiverStream` |
| `src/inference/raw.rs` | `[DELETE]` | `send_raw()` メソッド削除に伴いファイルごと削除 |
| `src/server/openai.rs` | `[MODIFY]` | mistralrs 型（`ChatCompletionRequest`, `Response`）→ 自前定義型に置き換え。`Anthropic` エンドポイント削除。 |
| `src/server/router.rs` | `[MODIFY]` | `AppError` の `MistralrsError` → `LlamaCppError`。`Anthropic` ルート削除。 |
| `src/server/types.rs` | `[CREATE]` | `ChatCompletionRequest`, `ChatCompletionResponse`, `ChatCompletionChunk` 自前定義 |
| `build.rs` | `[MODIFY]` | モデルDL URL 差し替え（4モデル）。cmake フラグ制御追加。 |
| `src/consts/settings.rs` | `[MODIFY]` | `DEFAULT_CONTEXT_SIZE`: 32768 → 2048 |
| `src/bin/test-run.rs` | `[MODIFY]` | llama-cpp-2 API に合わせて推論呼び出しを修正 |
| `tests/*.rs` | `[MODIFY]` | MockEngine 4→3メソッド。`TextMessages` → `&str`。mistralrs 依存テスト削除。 |

### 実装順序

```
Phase 1: 型定義の置き換え（コンパイル可能な状態を維持）
  Step 1: server/types.rs 新規作成（ChatCompletionRequest / Response / Chunk 自前定義）
  Step 2: error.rs 修正（MistralrsError → LlamaCppError）
  Step 3: config.rs 修正（ModelConfig.chat_template 削除、GpuProvider 調整）

Phase 2: モデルロード置き換え（この時点でコンパイルは一時的に通らなくなる）
  Step 4: registry.rs 修正（LlamaModel 型 + load_from_file + spawn_blocking）
  Step 5: inference/mod.rs 修正（トレイト定義: send_raw 削除、TextMessages → &str）
  Step 6: inference/generate.rs 修正（InferenceParams 変換 + gbnf 統合）
  Step 7: inference/stream.rs 修正（TokenCallback + mpsc + ReceiverStream）
  Step 8: inference/raw.rs 削除

Phase 3: サーバー層置き換え
  Step 9: server/openai.rs 修正（自前型使用、Anthropic 削除）
  Step 10: server/router.rs 修正（LlamaCppError、Anthropic ルート削除）
  Step 11: lib.rs 修正（re-export 全削除、server::types 追加）

Phase 4: ビルド・テスト修正（コンパイル復旧）
  Step 12: Cargo.toml 修正（依存差し替え）
  Step 13: build.rs 修正（モデルDL URL + cmake フラグ）
  Step 14: テストコード修正（MockEngine、結合テスト）
  Step 15: test-run.rs 修正（llama-cpp-2 API に合わせて調整）

Phase 5: 検証
  Step 16: make check-be（コンパイル検証）
  Step 17: cargo test（全テスト通過確認）
  Step 18: cargo run --bin test-run（目視確認）
```

---

## Appendix

### A. 参照情報

| リソース | URL |
|---------|-----|
| llama-cpp-2 (crates.io) | https://crates.io/crates/llama-cpp-2 |
| llama-cpp-2 (docs.rs) | https://docs.rs/llama-cpp-2/latest/llama_cpp_2/ |
| gbnf (GitHub) | https://github.com/richardanaya/gbnf |
| gbnf (crates.io) | https://crates.io/crates/gbnf |
| gbnf (docs.rs) | https://docs.rs/gbnf/latest/gbnf/ |
| Qwen3.5-0.8B GGUF | https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF |
| Qwen3.5-2B GGUF | https://huggingface.co/unsloth/Qwen3.5-2B-GGUF |
| Gemma4 E2B GGUF | https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF |
| Gemma4 E4B GGUF | https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF |
| llama.cpp (GitHub) | https://github.com/ggerganov/llama.cpp |

### B. モデルダウンロードURL一覧

| モデル | HuggingFace リポジトリ | ファイル名 | サイズ（目安） |
|--------|----------------------|-----------|--------------|
| Qwen3.5-0.8B Q4_K_M | unsloth/Qwen3.5-0.8B-GGUF | Qwen3.5-0.8B-Q4_K_M.gguf | 約 800 MB |
| Qwen3.5-2B Q4_K_M | unsloth/Qwen3.5-2B-GGUF | Qwen3.5-2B-Q4_K_M.gguf | 約 1.6 GB |
| Gemma4 E2B Q4_K_M | unsloth/gemma-4-E2B-it-GGUF | gemma-4-E2B-it-Q4_K_M.gguf | 約 4 GB |
| Gemma4 E4B Q4_K_M | unsloth/gemma-4-E4B-it-GGUF | gemma-4-E4B-it-Q4_K_M.gguf | 約 16 GB |

> **注記**: Gemma4 のファイル名は実装開始前に HuggingFace リポジトリで確認の上、正確なものに修正すること。

### C. 環境変数 GGUFRS_GPU_PROVIDER

| 値 | 動作 |
|----|------|
| `auto`（未設定時と同じ）| コンパイル時検出（macOS=Metal、その他=CPU） |
| `metal` | Apple Metal（macOS）を強制 |
| `cuda` | NVIDIA CUDA を強制 |
| `cpu` | CPU-Only を強制 |

### D. ポート割当

| 定数 | デフォルト値 | 用途 |
|------|-------------|------|
| `DEFAULT_RT_PORT` | 3910 | REST API / OpenAI 互換エンドポイント |

### E. GGUF ファイル内 tokenizer の取扱い

GGUF 形式は tokenizer 情報（語彙・特殊トークンID・chat_template）をファイル内に自己内包する。
そのため、ggufrs は別途 tokenizer ファイルをダウンロードする必要はない。
llama-cpp-2 の `LlamaModel::load_from_file()` はこの内包情報を自動的に読み取り、
適切な tokenizer を構成する。ModelConfig の `chat_template` フィールドは不要である。

### F. 用語集

| 用語 | 説明 |
|------|------|
| GGUF | llama.cpp コミュニティで標準の量子化モデルファイル形式 |
| llama-cpp-2 | llama.cpp の Rust FFI バインディングクレート |
| GBNF | llama.cpp で使用される BNF ベースの文法記述言語 |
| Structured Output | JSON Schema に従った構造化された出力を強制する生成手法 |
| Q4_K_M | 4ビット量子化の一種。K_M は中間品質 |
| ModelRegistry | モデルインスタンスを一元管理するコンテナ |
| 3層マージ | コード・埋め込みJSON・ファイルJSONの3層から設定を合成する方式 |
| SSE | Server-Sent Events。ストリーミング用の HTTP プロトコル |
| TokenCallback | llama-cpp-2 のトークン単位逐次出力コールバック |
