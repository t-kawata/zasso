OpenAI互換エンドポイントをAnthropic互換エンドポイントに変換することができる Rust crate を探してください。mistralrs をラップして開発する crate 内でラップし、Anthropic互換エンドポイントも提供できるようにする方法を探しているのです。

必要な情報が揃いました。

***

## Rust crateによる OpenAI → Anthropic 変換の選択肢

目的に最もマッチする Rust crate が存在します。用途別に整理します。

***

### ① `llm-bridge-core`（最有力・ライブラリ埋め込み向き）

**これがまさに求めているもの**です。 [lib](https://lib.rs/crates/llm-bridge-core)

github のリポジトリは https://github.com/TokenFleet-AI/llm-bridge-rust/tree/master だと思われます。

```toml
[dependencies]
llm-bridge-core = "0.2"
```

`transform::openai_to_anthropic()` / `transform::anthropic_to_openai()` という双方向の変換関数を提供するライブラリです。 crate 内に直接組み込めるため、**mistralrs をラップした独自 crate に `/v1/messages` エンドポイントを追加する**という用途に最適です。 [lib](https://lib.rs/crates/llm-bridge-core)

対応している変換内容は以下の通りです: [lib](https://lib.rs/crates/llm-bridge-core)

| Anthropic Messages API | OpenAI Chat Completions |
|---|---|
| `messages` (user/assistant) | `messages` (role-based) |
| `system` / `system_prompt` | `messages[system]` |
| `thinking` blocks | `reasoning` content |
| `tool_use` / `tool_result` | `tool_calls` / `tool` messages |
| SSE (`message_start`, `content_block_delta`...) | SSE (`choices[0].delta`) |

Streaming SSE のクロスプロトコル変換（cross-chunk state management 付き）もサポートされています。 MIT ライセンスで、2026年5月の 0.2.3 が最新版です。 [lib](https://lib.rs/crates/llm-bridge-core)

使い方のイメージ（axum で `/v1/messages` を追加する場合）：

```rust
use llm_bridge_core::transform;
use axum::{routing::post, Json, Router};

async fn messages_handler(body: Json<serde_json::Value>) -> Json<serde_json::Value> {
    // Anthropic → OpenAI 形式に変換し mistralrs の /v1/chat/completions へ転送
    let openai_body = transform::anthropic_to_openai(body.0).unwrap();
    let response = call_mistralrs(openai_body).await;
    // OpenAI レスポンスを Anthropic 形式に戻す
    Json(transform::openai_to_anthropic(response).unwrap())
}

let app = Router::new().route("/v1/messages", post(messages_handler));
```

***

### ② `anthropic-proxy`（スタンドアロンプロキシ向き）

Anthropic → OpenAI 方向の変換専用プロセス（バイナリ）です。 crate 内に組み込む形ではなく、**外部プロセスとして起動してサイドカー的に使う**構成になります。 [lib](https://lib.rs/crates/anthropic-proxy)

`UPSTREAM_BASE_URL` に mistralrs の `http://localhost:1234` を指定するだけで Claude Code 等から直接利用できます。 SSE ストリーミング・ツールコール・extended thinking モードも対応済みです。 [lib](https://lib.rs/crates/anthropic-proxy)

```bash
UPSTREAM_BASE_URL=http://localhost:1234 \
UPSTREAM_API_KEY=dummy \
anthropic-proxy
```

こちらは「ライブラリとして自 crate に埋め込む」用途ではなく、プロセス分離したい場合の選択肢です。 [lib](https://lib.rs/crates/anthropic-proxy)

***

### 方針まとめ

| 目的 | 選択肢 |
|---|---|
| crate 内に `/v1/messages` エンドポイントを追加したい | `llm-bridge-core` を依存に追加して axum ハンドラを自前実装 |
| mistralrs の外側にプロキシプロセスを立てたい | `anthropic-proxy` をバイナリとして使う |
