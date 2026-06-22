---
ticket_id: 150
title: "M4-1: サーバールーター + ハンドラ実装 (server/router.rs, server/openai.rs)"
slug: m4-1-serverrouterrs-serveropenairs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0150-m4-1-serverrouterrs-serveropenairs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0150-m4-1-serverrouterrs-serveropenairs/review.md
plan_path: /Users/kawata/shyme/zasso/tickets/context/0150-m4-1-serverrouterrs-serveropenairs/plan.md
---

# M4-1: サーバールーター + ハンドラ実装 (server/router.rs, server/openai.rs)

## Summary

Axum ルーターと OpenAI/Anthropic 互換の HTTP ハンドラエンドポイントを実装する。
`AppState = Arc<dyn InferenceEngine + Send + Sync>` を共有状態とし、
リクエストボディの `model` フィールドに基づいてモデルを解決し、
`InferenceEngine` トレイトのメソッドに委譲する。
3つのエンドポイント（`POST /v1/chat/completions`, `GET /v1/models`, `POST /anthropic/v1/messages`）を同一サーバーで提供する。

## Background

### 設計上の位置づけ（RFC §3.1〜§3.3）

ggufrs のサーバーモードはハイブリッド方式を採用する：

- **ルーティング層**: 自前の Axum 実装でモデル名解決とリクエストルーティングを行う
- **OpenAI 互換エンドポイント**: mistralrs の `RequestBuilder` 型を使用してリクエストを構成し、`InferenceEngine::send_raw()` に委譲
- **Anthropic 互換エンドポイント**: `llm-bridge-core` crate の `transform::anthropic_to_openai()` / `transform::openai_to_anthropic()` を用いてリクエスト・レスポンスを双方向変換する

サーバーは `GgufEngine` の一部として同一プロセス内で動作し、
ロードされたモデルインスタンスはスレッドセーフに共有される（`Arc` + 内部 `RwLock`）。

```
POST /v1/chat/completions  → router → model フィールド抽出 → send_raw() → OpenAI JSON レスポンス
POST /anthropic/v1/messages → router → model フィールド抽出 → anthropic_to_openai() → send_raw() → openai_to_anthropic() → Anthropic JSON レスポンス
GET  /v1/models            → router → list_models() → OpenAI 互換モデル一覧
```

### 現在の実装状況

- `server/mod.rs`: **空のモジュール**（doc comment + STUB マーカーのみ）
- `lib.rs` L28: `pub mod server;` — **宣言のみ、実装なし**（STUB マーカーあり）
- `inference/mod.rs`: `MockEngine` — mockall ベースのモック定義 **実装済み**
- `Cargo.toml`: axum, serde, serde_json, tokio, llm-bridge-core の依存関係は **全て追加済み**
- `consts/settings.rs`: `DEFAULT_RT_PORT` — **定義済み**（3910）

### このチケットの必要性

M3-5 まででライブラリ API（InferenceEngine の4メソッド）が完成した。
フェーズ D（サーバーモード）の第一弾として、ルーター + ハンドラを実装し、
HTTP 経由での推論実行を可能にする。

## Scope

### 実装するもの

1. **`server/router.rs` 作成**
   - `AppState` 型エイリアス: `type AppState = Arc<dyn InferenceEngine + Send + Sync>`
   - `AppError` 型エイリアス: `type AppError = (StatusCode, Json<Value>)`
   - `impl From<GgufError> for AppError`: GgufError の6バリアントを適切な HTTP ステータスコードとエラーメッセージにマッピング
   - `build_router(engine: AppState) -> Router`: 3つのエンドポイントを登録した Axum Router を生成
   - `pub use` 経由で必要な型を再公開

2. **`server/openai.rs` 作成**
   - `openai_chat_handler()`: `POST /v1/chat/completions`
     - 引数: `State(AppState)`, `Json<ChatCompletionRequest>`（mistralrs の型）
     - `req.model` からモデル名を抽出（未指定時はデフォルトモデル）
     - `RequestBuilder::try_from(req)` で mistralrs の RequestBuilder に変換
     - `engine.send_raw(model_name, request_builder)` に委譲
     - 戻り値: `Result<Json<ChatCompletionResponse>, AppError>`
   - `list_models_handler()`: `GET /v1/models`
     - `engine.registry` 経由でモデル一覧を取得（RFC §3.3 のコード例参照）
     - 戻り値: `Json<serde_json::Value>`（OpenAI 互換モデル一覧形式）
   - `anthropic_messages_handler()`: `POST /anthropic/v1/messages`
     - mistralrs は Anthropic 互換型を提供しないため、引数・戻り値とも `Json<serde_json::Value>`
     - `llm_bridge_core::transform::anthropic_to_openai()` でリクエストを OpenAI 形式に変換
     - OpenAI 形式の `model` フィールドからモデル名を抽出
     - `serde_json::from_value()` で `ChatCompletionRequest` にデシリアライズ
     - `RequestBuilder::try_from()` で mistralrs リクエストに変換
     - `engine.send_raw()` に委譲
     - 結果を `serde_json::to_value()` で汎用 JSON に変換
     - `llm_bridge_core::transform::openai_to_anthropic()` で Anthropic 形式に逆変換
     - 戻り値: `Result<Json<serde_json::Value>, AppError>`

3. **`server/mod.rs` 更新**
   - `pub mod router;` / `pub mod openai;` の子モジュール宣言
   - `pub use router::{build_router, AppState, AppError};` の再公開
   - 既存の STUB マーカーを M4-1 担当分のみ削除

4. **`lib.rs` 更新**
   - `pub mod server;` の STUB マーカーコメントを削除（宣言自体は既存）

### 実装しないもの

- `GgufEngine::start_server()` の実装 — M4-2 で実装（`server/mod.rs` にサーバー起動ロジックを追加）
- ストリーミングエンドポイント（`stream: true` の処理）— 将来の拡張
- レート制限・認証・CORS 等のミドルウェア — 必要に応じて将来追加
- 静的ファイルサーバー — `DEFAULT_SW_PORT` は scope 外

## Investigation

### ソースコード調査結果

#### server/ モジュールの現在の構造

**ファイル: `crates/ggufrs/src/server/mod.rs`**（全8行）
```rust
//! Axum HTTP サーバー
//! ...
//! # [::STUB::] M4-1 でルーター + ハンドラを実装
//! # [::STUB::] M4-2 で GgufEngine との統合を実装
```
子モジュール宣言・再公開のない空の状態。

**ファイル: `crates/ggufrs/src/lib.rs`**（該当行）
```rust
// [::STUB::] M4-1 で server モジュールを実装
pub mod server;
```

#### 依存クレートの状態

`Cargo.toml` に必要な依存関係は全て追加済み：

| クレート | 用途 | 状態 |
|---------|------|------|
| `axum = "0.8"` | HTTP ルーター | ✅ 追加済み |
| `serde = "1"` | シリアライズ | ✅ 追加済み（derive feature） |
| `serde_json = "1"` | JSON | ✅ 追加済み |
| `tokio = "1"` | 非同期ランタイム | ✅ 追加済み |
| `llm-bridge-core = "0.2"` | Anthropic/OpenAI 変換 | ✅ 追加済み |
| `tracing = "0.1"` | ロギング | ✅ 追加済み |

#### モックの状態

`inference/mod.rs`（L220-313）に `MockEngine`（mockall ベース）が定義済み。
全4メソッドのモックが利用可能：

- `expect_generate()`
- `expect_generate_structured()`
- `expect_generate_stream()`
- `expect_send_raw()`

M4-1 のテストでは `expect_send_raw()` を使用する。

#### mistralrs 型の利用可能性

`lib.rs` で以下の mistralrs 型が `pub use` により再公開されている：

```rust
pub use mistralrs::{
    ChatCompletionResponse, Constraint, Model, RequestBuilder, Response, SamplingParams,
    TextMessages, TextMessageRole,
};
```

ハンドラ内で `ChatCompletionRequest`（リクエスト型）が必要だが、
現時点で re-export されていない可能性がある。`RequestBuilder` への変換
（`RequestBuilder::try_from(ChatCompletionRequest)`）は mistralrs の API に依存するため、
実装時に mistralrs のドキュメントを確認する。

#### llm-bridge-core の API

RFC に基づく想定 API：
- `llm_bridge_core::transform::anthropic_to_openai(Value) -> Result<Value, Error>`
- `llm_bridge_core::transform::openai_to_anthropic(Value) -> Result<Value, Error>`

実装時は `llm-bridge-core` v0.2 のドキュメントを参照して確認する。

#### スタブ状況

M4-1 で解決される STUB：

```
crates/ggufrs/src/lib.rs:28:
  [::STUB::] M4-1 で server モジュールを実装 → 実装完了後、コメント削除

crates/ggufrs/src/server/mod.rs:6:
  [::STUB::] M4-1 でルーター + ハンドラを実装 → 実装完了後、子モジュール宣言と再公開に置き換え
```

M4-1 では解決しない STUB（M4-2 担当として残す）：

```
crates/ggufrs/src/server/mod.rs:7:
  [::STUB::] M4-2 で GgufEngine との統合を実装
```

#### 依存チケットの状態

- **M3-2** (generate / generate_structured): ✅ 完了 — トレイト実装済み、テスト済み
- **M3-3** (generate_stream): ✅ 完了 — トレイト実装済み、テスト済み
- **M3-4** (send_raw): ✅ 完了 — トレイト実装済み、テスト済み
- **M2-1** (InferenceEngine トレイト定義): ✅ 完了 — AppState の型定義に使用

すべての依存が完了しており、M4-1 はブロックされていない。

### 参照: RFC のコード例（§3.2）

```rust
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
            GgufError::MistralrsError(_) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()),
        };
        (status, Json(serde_json::json!({"error": message})))
    }
}

fn build_router(engine: AppState) -> Router {
    Router::new()
        .route("/v1/chat/completions", post(openai_chat_handler))
        .route("/v1/models", get(list_models_handler))
        .route("/anthropic/v1/messages", post(anthropic_messages_handler))
        .with_state(engine)
}
```

## Test Plan

### ユニットテスト計画

テストは `server/router.rs` 内の `#[cfg(test)] mod tests` に記述する。
`inference/mod.rs` で定義された `MockEngine` をインポートして使用する。
`axum::http::Request` と `tower::ServiceExt` を使ってルーターに対する
HTTP リクエストのテストを行う。

#### 1. AppError の From<GgufError> 変換

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | ModelNotFound → 404 | 正常系 | `GgufError::ModelNotFound("x".into())` → `StatusCode::NOT_FOUND` |
| 1.2 | InferenceFailed → 500 | 正常系 | `GgufError::InferenceFailed(...)` → `StatusCode::INTERNAL_SERVER_ERROR` |
| 1.3 | InvalidConfig → 400 | 正常系 | `GgufError::InvalidConfig("bad".into())` → `StatusCode::BAD_REQUEST` |
| 1.4 | ModelLoadFailed → 500 | 正常系 | `GgufError::ModelLoadFailed { ... }` → `StatusCode::INTERNAL_SERVER_ERROR` |
| 1.5 | ServerStartupFailed → 500 | 正常系 | `GgufError::ServerStartupFailed(...)` → `StatusCode::INTERNAL_SERVER_ERROR` |
| 1.6 | MistralrsError → 500 | 正常系 | `GgufError::MistralrsError(...)` → `StatusCode::INTERNAL_SERVER_ERROR` |
| 1.7 | エラーレスポンスに error フィールドが含まれる | 正常系 | JSON body に `{"error": "..."}` が含まれる |

#### 2. build_router のルーティング

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 2.1 | /v1/chat/completions が POST を受け付ける | 正常系 | MockEngine を使い、ルーターが POST リクエストを 200 で応答する |
| 2.2 | /v1/models が GET を受け付ける | 正常系 | MockEngine を使い、ルーターが GET リクエストを 200 で応答する |
| 2.3 | /anthropic/v1/messages が POST を受け付ける | 正常系 | MockEngine を使い、ルーターが POST リクエストを 200 で応答する |
| 2.4 | 未知のパスは 404 を返す | 異常系 | ルーターが定義されていないパスに対して 404 を返す |

#### 3. openai_chat_handler（ルーター経由の結合テスト）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 3.1 | 有効なリクエストで正常応答 | 正常系 | MockEngine.send_raw が Ok を返す設定 → 200 + ChatCompletionResponse |
| 3.2 | model フィールド未指定でエラーにならない | 正常系 | model なしのリクエストでも 500 にならずに処理される |
| 3.3 | send_raw がエラーを返した場合 | 異常系 | MockEngine.send_raw が Err を返す設定 → エラーステータスコード |
| 3.4 | 不正なリクエストボディ | 異常系 | 空ボディ → 400 エラー |

#### 4. list_models_handler（ルーター経由の結合テスト）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 4.1 | 200 OK が返る | 正常系 | GET /v1/models → 200 |
| 4.2 | レスポンスが有効な JSON | 正常系 | JSON としてパース可能 |

#### 5. anthropic_messages_handler（ルーター経由の結合テスト）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 5.1 | 有効なリクエストで正常応答 | 正常系 | MockEngine.send_raw が Ok を返す設定 → 200 + JSON レスポンス |
| 5.2 | send_raw がエラーを返した場合 | 異常系 | MockEngine.send_raw が Err を返す設定 → エラーステータスコード |
| 5.3 | 不正なリクエストボディ | 異常系 | 空ボディ → 400 エラー |

#### カバレッジ目標

- `router.rs`: ラインカバレッジ 100%
- `openai.rs`: ラインカバレッジ 90% 以上（3ハンドラの全エラーパス + 正常系）
- `server/mod.rs`: 100%（宣言のみのため）
- 全ハンドラの全エラーバリアントをカバー

### ユニットテスト不可能な項目（例外）

なし。`MockEngine` により全ハンドラのテストが可能。
外部ネットワーク依存（モデルダウンロード等）はハンドラのテスト対象外。
`llm-bridge-core` の変換関数は実際の関数をそのまま呼び出すため、
モック不要で結合テストとして動作する。

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

新規作成ファイルであるため、過去の違反を引き継ぐリスクはない。
以下の翻訳可能性ルールを遵守して実装する：

### M4-1 実装で遵守すべき翻訳可能性のルール

1. **関数名は動詞句にする**:
   - `build_router` — 「ルーターを構築する」
   - `openai_chat_handler` — 「OpenAI チャットを処理する」
   - `list_models_handler` — 「モデル一覧を返す」
   - `anthropic_messages_handler` — 「Anthropic メッセージを処理する」

2. **変数名はドメイン概念を表現する**:
   - `engine` — 推論エンジン（`AppState` から抽出）
   - `model_name` — モデル識別子
   - `request_builder` — mistralrs リクエストビルダー
   - `response_value` — シリアライズ済みレスポンス値

3. **一関数一責務**:
   - `build_router`: Router の構築のみ（ハンドラ登録の順序は責務に含める）
   - `openai_chat_handler`: OpenAI 互換エンドポイントの処理のみ
   - `list_models_handler`: モデル一覧の応答のみ
   - `anthropic_messages_handler`: Anthropic 変換 + 委譲のみ
   - `AppError::from`: エラー変換のみ

4. **ハードコード値の定数化**:
   - ポート番号: `settings.rs` の `DEFAULT_RT_PORT` を使用
   - デフォルトモデル名: 設定から取得（`unwrap_or` のデフォルト値として）
   - エラーメッセージフォーマット: `GgufError::to_string()` に委譲

5. **`?` 演算子によるエラー伝播**:
   - ハンドラ内の全てのエラーは `?` で `AppError` に自動変換
   - `unwrap()` / `expect()` を使用しない（テストコード除く）

6. **コメントは「なぜ」を説明**:
   - コードが「何を」しているかは関数名で語る
   - コメントは「なぜ llm-bridge-core が必要か」「なぜ Anthropic 型がないか」等の設計判断を日本語で説明

7. **完全修飾名によるインポートの省略禁止**:
   - `crate::server::router::build_router` のようなパスは書かず、必ず `use` でインポート

### 具体的な改善

- 空の `server/mod.rs` に子モジュール宣言と再公開を追加（Boy Scout Rule）
- `lib.rs` の STUB コメントを削除
- 新規コードに古い違反を持ち込まない

## Acceptance Criteria

- [ ] `server/router.rs` に `AppState` 型エイリアスが定義されている
- [ ] `server/router.rs` に `AppError` 型エイリアス + `From<GgufError>` 実装が定義されている
- [ ] `server/router.rs` に `build_router()` が実装されている
- [ ] `server/openai.rs` に `openai_chat_handler()` が実装されている
- [ ] `server/openai.rs` に `list_models_handler()` が実装されている
- [ ] `server/openai.rs` に `anthropic_messages_handler()` が実装されている
- [ ] `server/mod.rs` が子モジュールを宣言し、`build_router`, `AppState`, `AppError` を再公開している
- [ ] `lib.rs` の `[::STUB::] M4-1 で server モジュールを実装` が削除されている
- [ ] `server/mod.rs` の `[::STUB::] M4-1 でルーター + ハンドラを実装` が削除されている（M4-2 の STUB は残す）
- [ ] 3つのエンドポイントが正しくルーティングされる
- [ ] GgufError の全6バリアントが適切な HTTP ステータスコードにマッピングされる
- [ ] Anthropic リクエストが正しく OpenAI 形式に変換され、レスポンスが Anthropic 形式に逆変換される
- [ ] MockEngine を使った全テストが通過する
- [ ] カバレッジ目標を達成している
- [ ] 翻訳可能性ルールに従った命名・構造になっている
- [ ] `cargo fmt` / `cargo clippy` が通過している

## Notes

- `ChatCompletionRequest` 型が `mistralrs` から直接 re-export されていない場合、`mistralrs` crate からの直接インポートにフォールバックする
- `RequestBuilder::try_from(ChatCompletionRequest)` の変換パスは mistralrs v0.8.1 の API に依存する。コンパイルエラーが発生した場合は、代替として手動で RequestBuilder を構築する
- `llm-bridge-core` v0.2 の `transform` モジュールは RFC 設計時の想定 API。実際の関数シグネチャが異なる場合はテストコードで確認の上、修正する
- `list_models_handler` は現時点ではモックエンジンでも動作する汎用的な実装とする（実際のモデル一覧は M4-2 以降で engine から動的に取得する形に拡張可能）
- 依存: M3-2/M3-3/M3-4（InferenceEngine 全実装）✅完了、M2-1（InferenceEngine トレイト定義）✅完了
- 後続チケット: M4-2（GgufEngine サーバー統合）で `start_server()` を実装
- 参照: RFC.md §3.1（ハイブリッドアーキテクチャ）、§3.2（ルーティング設計）、§3.3（複数モデルのルーティング）
- 参照: `crates/ggufrs/Tickets.md` L471-500（オリジナルチケット定義）
- 参照: `inference/mod.rs` L220-313（MockEngine 定義）
- `crates/ggufrs/src/consts/settings.rs` の `DEFAULT_RT_PORT`（3910）をサーバーバインドに使用する

### 成果物

- 計画: context/0150-m4-1-serverrouterrs-serveropenairs/plan.md（未作成、`/plan-ticket` 承認後に作成）
- 実装サマリ: context/0150-m4-1-serverrouterrs-serveropenairs/implementation.md（未作成、`/start-ticket` 実装完了後に作成）
- レビュー報告書: context/0150-m4-1-serverrouterrs-serveropenairs/review.md（未作成、`/review-ticket` 全チェック通過後に作成）
