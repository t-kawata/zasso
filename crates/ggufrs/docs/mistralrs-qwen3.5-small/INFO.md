# mistralrs + Qwen3.5-0.8B GGUF Q4_K_M 実装ガイド

## 要件の再確認

このドキュメントが満たす前提要件は次のとおりです。

- **用途は音声認識そのものではなく、音声認識済みの日本語テキスト補正のみ**である。
- **Whisperクラスの音声認識結果を、自然な日本語文にきれいに補正する**ことが目的である。
- **Rust に組み込んで実行する**ことが前提である。
- **CPU-only 実行**が前提である。GPU依存を必須にしない。
- **HTTP API 経由の外部サービス利用は不可**である。
- **Python 依存の実行方法は不可**である。
- **crate ベースが理想**であり、必要なら **FFI は許容**される。
- モデルは **Qwen3.5 Small 0.8B の GGUF Q4_K_M** を使う前提に切り替える。
- 前回の `llama-cpp-2` ベース文書を、**`mistralrs` ベースへ書き直す**。
- さらに今回は、**OpenAI 互換エンドポイントと Anthropic 互換エンドポイントを持つサーバーも、同じプロセス内で Tokio 上で同時に起動できるモード**を持たせる。
- そのうえで、**任意の system prompt / user prompt に対して Structured Output を返す**実装方法を示す。

## 結論

この要件では、`llama-cpp-2` より **`mistralrs` を使う方が適している**。理由は、`mistralrs` が Rust ライブラリとしての非同期APIに加えて、**OpenAI 互換 `/v1` エンドポイントと Anthropic 互換 Messages エンドポイントを持つ server 機能を同系統プロジェクトとして提供している**からである。

また、`mistralrs` は **GGUF モデルを `GgufModelBuilder` で直接ロードでき**、Structured Output も `Model::generate_structured` 系のAPIで扱えるため、今回の「ローカル補正 + 埋め込みサーバー」の両立に向いている。

## 全体構成

今回の実装は、1つの Rust バイナリの中で次の2モードを持つ設計にする。

| モード | 内容 | 用途 |
|---|---|---|
| **library mode** | Rust 関数として直接補正を実行する | アプリ内から即時に呼ぶ本命経路  |
| **embedded server mode** | Tokio 上で OpenAI 互換 + Anthropic 互換サーバーを同時に起動する | 他プロセスや既存クライアント互換が必要なとき  |

前者は最小レイテンシ、後者は互換性重視である。

## 必要なもの

`mistralrs` は crates.io から導入できる Rust SDK であり、非同期APIを提供する。 一方、server 実装側は `mistralrs-server-core` が基盤になっており、「mistral.rs server を支える内部機能を他実装でも使える」と明記されている。

### 必須ツール

- Rust stable (`rustup`)。
- C/C++ ビルド環境。`mistralrs` は内部で各種低レベル実装を使うため、一般的な Rust ネイティブ拡張ビルド環境が必要になる。
- Tokio ランタイム。

### Cargo.toml

```toml
[package]
name = "asr-corrector-mistralrs"
version = "0.1.0"
edition = "2021"

[dependencies]
anyhow = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal"] }
axum = "0.7"
clap = { version = "4", features = ["derive"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["fmt", "env-filter"] }

# CPU-only 前提。必要になったら feature を追加する。
mistralrs = { version = "0.8", default-features = false }

# server 実装を流用・拡張したい場合に使う。
mistralrs-server-core = "0.7"
```

`mistralrs` は crates.io で公開されており、`default-features = false` で CPU 前提の軽い構成にできる。 `mistralrs-server-core` は server を拡張・再利用するためのコアクレートである。

## モデルの取得

`mistralrs` の GGUF ローダーは GGUF 量子化モデルを直接読み込める。 今回の対象モデルは **Qwen3.5-0.8B-Q4_K_M.gguf** とする。

- モデル配布元の例: `unsloth/Qwen3.5-0.8B-GGUF`。
- 使うファイル名: `Qwen3.5-0.8B-Q4_K_M.gguf`。

ダウンロード例:

```bash
mkdir -p ./models/qwen3.5-0.8b
wget -O ./models/qwen3.5-0.8b/Qwen3.5-0.8B-Q4_K_M.gguf \
  "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf"
```

## 実装方針

実装は次のように分けるのがよい。

1. **モデルロード部分**: `GgufModelBuilder` で Qwen3.5-0.8B GGUF をロードする。
2. **Structured Output 補正部分**: `generate_structured` 系APIで JSON Schema に従う補正結果を返す。
3. **埋め込み server mode**: Tokio で独自タスクを立ち上げ、同時に OpenAI / Anthropic 互換エンドポイントを公開する。
4. **同一モデル共有**: ライブラリ呼び出しとHTTPサーバー呼び出しが同じ推論インスタンスを共有するようにする。

## Structured Output 用の返却型

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrCorrectionResult {
    pub corrected_text: String,
    pub was_modified: bool,
    pub correction_notes: String,
}
```

この構造体は、前回の `llama-cpp-2` 版と同じ意味を保っている。今回も「補正済み本文」「補正有無」「補正メモ」を返す設計にすると使いやすい。

## 実際に使う system prompt

今回の用途では、推論対象は音声認識後テキストだけであり、意味改変を避ける指示が重要になる。

```text
あなたは音声認識（ASR）の結果テキストを校正するアシスタントです。
次のルールに従って補正してください。
1. 句読点を適切に追加する。
2. 明らかな誤字・誤変換を修正する。
3. 話し言葉を自然な日本語文に整える。
4. 意味を変える推測補完はしない。
5. 必ず指定された JSON Schema に従って返答する。
```

この種の補正タスクは大規模な自由生成ではなく、低温・制約付き出力と相性がよい。

## ライブラリモードの実装例

`mistralrs` は非同期APIを提供し、builder からモデルを生成して chat / structured generation を実行できる。

```rust
use anyhow::Result;
use mistralrs::{
    GgufModelBuilder,
    RequestBuilder,
    TextMessageRole,
    TextMessages,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AsrCorrectionResult {
    pub corrected_text: String,
    pub was_modified: bool,
    pub correction_notes: String,
}

pub struct CorrectionEngine {
    pub model: Arc<mistralrs::Model>,
}

impl CorrectionEngine {
    pub async fn load_local_gguf(model_path: &str) -> Result<Self> {
        let model = GgufModelBuilder::new(
            model_path.to_string(),
            vec![],
        )
        .build()
        .await?;

        Ok(Self {
            model: Arc::new(model),
        })
    }

    pub async fn correct_text(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<AsrCorrectionResult> {
        let schema = json!({
            "type": "object",
            "properties": {
                "corrected_text": { "type": "string" },
                "was_modified": { "type": "boolean" },
                "correction_notes": { "type": "string" }
            },
            "required": ["corrected_text", "was_modified", "correction_notes"],
            "additionalProperties": false
        });

        let messages = TextMessages::new()
            .add_message(TextMessageRole::System, system_prompt)
            .add_message(TextMessageRole::User, user_prompt);

        let request = RequestBuilder::new()
            .messages(messages)
            .temperature(0.1)
            .max_tokens(256)
            .build();

        let value = self
            .model
            .generate_structured(request, schema)
            .await?;

        let result: AsrCorrectionResult = serde_json::from_value(value)?;
        Ok(result)
    }
}
```

### このコードの意図

- `GgufModelBuilder` により GGUF 量子化モデルを直接ロードする。
- `TextMessages` と `RequestBuilder` で OpenAI 風の message 形式を組み立てる。
- `generate_structured` で JSON Schema 拘束付きの戻り値を得る。
- 戻り値を `serde_json` 経由で Rust の構造体へ落とす。

## 注意: `GgufModelBuilder::new()` の引数について

`mistralrs` の公開ドキュメントでは `GgufModelBuilder` が GGUF 用 builder として案内されているが、実際の細かいコンストラクタ引数はリリース間で変わる可能性がある。 そのため、**概念上は `GgufModelBuilder` を使うことが正しく、最終的な引数順は導入バージョンの examples/gguf を必ず確認する**のが安全である。

今回のドキュメントでは「限りなく高い確率で正しい」実装に寄せるため、builder を中心に書いているが、実コード投入時は **利用する `mistralrs` の exact version の example を一度見て合わせる**べきである。

## embedded server mode の実装方針

`mistral.rs` は **OpenAI 互換 `/v1` エンドポイントと Anthropic 互換 Messages API を同じ serve プロセスから提供できる**ことを公式にうたっている。 また、`mistralrs-server-core` は server 機能を他実装から利用・拡張するための基盤クレートである。

そのため、`axum` でゼロから OpenAI 互換仕様を追いかけるより、**server-core を利用する薄い埋め込みラッパー**を書く方が要件に合う。

## embedded server mode の設計

同一 Tokio ランタイム上で以下を並列起動する。

- 補正用アプリ本体タスク
- OpenAI 互換 HTTP サーバー
- Anthropic 互換 HTTP サーバー
- シャットダウン監視タスク

`mistral.rs` 側の server 仕様に追従したいので、HTTP 仕様の実装はできる限り `mistralrs-server-core` に寄せる。

## 実装例: 1プロセスで補正エンジン + サーバー同時起動

```rust
use anyhow::Result;
use clap::{Parser, ValueEnum};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::signal;
use tracing::info;

#[derive(Debug, Clone, ValueEnum)]
enum Mode {
    Library,
    Server,
    Both,
}

#[derive(Debug, Parser)]
struct Cli {
    #[arg(long, default_value = "./models/qwen3.5-0.8b/Qwen3.5-0.8B-Q4_K_M.gguf")]
    model_path: String,

    #[arg(long, value_enum, default_value = "both")]
    mode: Mode,

    #[arg(long, default_value = "127.0.0.1:8080")]
    bind: SocketAddr,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    let engine = Arc::new(CorrectionEngine::load_local_gguf(&cli.model_path).await?);

    match cli.mode {
        Mode::Library => {
            let out = engine.correct_text(
                "あなたはASR結果を補正するアシスタントです。必ずJSONで返してください。",
                "ASR結果: きのうのかいぎできめたないようをらいしゅうまでにかくにんしてください",
            ).await?;
            println!("{:#?}", out);
        }
        Mode::Server => {
            run_embedded_server(engine.clone(), cli.bind).await?;
        }
        Mode::Both => {
            let bind = cli.bind;
            let engine_for_server = engine.clone();

            let server_task = tokio::spawn(async move {
                run_embedded_server(engine_for_server, bind).await
            });

            let sample_task = tokio::spawn(async move {
                let out = engine.correct_text(
                    "あなたはASR結果を補正するアシスタントです。必ずJSONで返してください。",
                    "ASR結果: えーとらいしゅうのげつようびまでにかくにんおねがいします",
                ).await?;
                info!(?out, "sample correction finished");
                Ok::<_, anyhow::Error>(())
            });

            tokio::select! {
                r = server_task => { r??; }
                r = sample_task => { r??; }
                _ = signal::ctrl_c() => {
                    info!("shutdown signal received");
                }
            }
        }
    }

    Ok(())
}
```

上のコードは「同一 Tokio プロセス内で、ライブラリ呼び出しとサーバー起動を両立する」骨格である。実際の HTTP エンドポイント部分は `mistralrs-server-core` を使って差し込むのが本筋である。

## embedded server 部分の実装方針

### 選択肢A: `mistralrs-server-core` に寄せる

これは最も推奨される。`mistralrs-server-core` は、mistral.rs server のライフサイクルにフックして、既存 server 実装を再利用・拡張するための crate である。

この方法の利点は次のとおり。

- OpenAI 互換仕様変更への追従コストを下げられる。
- Anthropic 互換 Messages API も同じ系統の実装に乗れる。
- 将来 tool calling や structured outputs の互換性を壊しにくい。

### 選択肢B: `axum` で薄く包む

`mistralrs` の Rust API を内部で呼びながら、外側だけ OpenAI / Anthropic 互換 JSON に寄せて自前実装する方法である。これは短期的には書けるが、**仕様追従の苦労を避けたい**という今回の問題意識にはあまり合わない。

したがって本件では、**server-core 前提**で書くのが正しい。

## 参考: 最小の自前 OpenAI 互換エンドポイント例

完全互換ではないが、埋め込みモードの雰囲気を掴むための最小例は次のようになる。

```rust
use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
struct AppState {
    engine: Arc<CorrectionEngine>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: String,
    choices: Vec<Choice>,
}

#[derive(Debug, Serialize)]
struct Choice {
    index: usize,
    message: ChatMessageOut,
    finish_reason: String,
}

#[derive(Debug, Serialize)]
struct ChatMessageOut {
    role: String,
    content: String,
}

async fn openai_chat(
    State(state): State<AppState>,
    Json(req): Json<ChatCompletionRequest>,
) -> anyhow::Result<Json<ChatCompletionResponse>> {
    let system_prompt = req.messages.iter()
        .find(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .unwrap_or("あなたはASR補正アシスタントです。JSONで返してください。" );

    let user_prompt = req.messages.iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str())
        .unwrap_or("");

    let result = state.engine.correct_text(system_prompt, user_prompt).await?;
    let content = serde_json::to_string(&result)?;

    Ok(Json(ChatCompletionResponse {
        id: "chatcmpl-local-1".to_string(),
        object: "chat.completion".to_string(),
        choices: vec![Choice {
            index: 0,
            message: ChatMessageOut {
                role: "assistant".to_string(),
                content,
            },
            finish_reason: "stop".to_string(),
        }],
    }))
}

async fn run_embedded_server(engine: Arc<CorrectionEngine>, bind: SocketAddr) -> Result<()> {
    let state = AppState { engine };
    let app = Router::new()
        .route("/v1/chat/completions", post(openai_chat))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(bind).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

これは **OpenAI 互換“風”** の最小形であり、**OpenAI / Anthropic 互換を本当に保ちたいなら `mistralrs-server-core` 側へ寄せるべき**である。

## Anthropic 互換を同時に持たせる考え方

`mistral.rs` は同じ serve プロセスで Anthropic 互換 Messages API も提供できるとされている。 したがって埋め込みサーバーでも、ルーティング層は次のように切るのが自然である。

- `/v1/chat/completions` → OpenAI 互換
- `/anthropic/v1/messages` または同等の Messages エンドポイント → Anthropic 互換

ただし、**この互換層の JSON フィールド差分や stop reason、tool calling の細部を自力で追うのは面倒**なので、ここでも server-core への寄せが重要になる。

## どこまでが「実際に動作する可能性が高いコード」か

今回の文書では、次の部分は高い確率でそのまま成立する。

- `mistralrs` を使うという方針
- `GgufModelBuilder` で GGUF を読むという方針
- `RequestBuilder` + `TextMessages` によるリクエスト構築
- `generate_structured` を使った Structured Output
- Tokio で library task と server task を同時に走らせる構造
- OpenAI / Anthropic 互換を `mistralrs-server-core` に寄せるべきという設計判断

一方で、**`mistralrs-server-core` の具体的な組み込みAPIは公開ドキュメントの断片だけでは十分に固定できない**。この点は、前回の `llama-cpp-2` 文書より不確実性が高い。

したがって、本当に実装に落とす際の最終手順は次のようになる。

1. `mistralrs` 本体は **examples/getting_started/gguf** を参照して exact version に合わせる。
2. server 埋め込みは **`mistralrs-server-core` の docs.rs / source** を見て、既存 server lifecycle をそのまま呼ぶ形に寄せる。
3. OpenAI / Anthropic 互換 JSON を自力で再実装しない。

## 実務上のおすすめ構成

今回の要件なら、最も安全な構成は次のとおりである。

- **補正の本命経路**: Rust 内から `CorrectionEngine::correct_text()` を直接呼ぶ。
- **互換API経路**: 同じモデルインスタンスを共有する embedded server mode を起動する。
- **OpenAI / Anthropic 互換仕様追従**: `mistralrs-server-core` 側のロジックを使い、自前の JSON 互換層は最小限にする。
- **モデル**: `Qwen3.5-0.8B-Q4_K_M.gguf`。
- **推論設定**: 低温、max_tokens 256 前後、Structured Output 固定。

## まとめ

前回の `llama-cpp-2` 版を `mistralrs` 版に置き換えると、**Structured Output を持つローカル補正エンジン**と、**OpenAI / Anthropic 互換サーバーを同一 Tokio プロセスで持つ設計**がやりやすくなる。

特に「仕様変更追従を自前でやりたくない」という要件には、`mistralrs-server-core` を土台にした embedded server mode が最も合っている。 一方で、server-core の埋め込みAPI細部は exact version 依存があり得るため、**最終実装では使うバージョンの examples/source を一度だけ確認して合わせる**のが安全である。
