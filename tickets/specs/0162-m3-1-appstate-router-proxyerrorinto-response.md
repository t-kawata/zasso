---
ticket_id: 162
title: M3-1: AppState + Router + ProxyError::into_response
slug: m3-1-appstate-router-proxyerrorinto-response
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0162-m3-1-appstate-router-proxyerrorinto-response/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0162-m3-1-appstate-router-proxyerrorinto-response/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0162-m3-1-appstate-router-proxyerrorinto-response/review.md
---
# M3-1: AppState + Router + ProxyError::into_response

> **参照設計書:** crates/anthropx/RFC.md (§3.1 AppState, §3.3 Router, §11 ProxyError IntoResponse)
> **生成元:** Tickets.md L268-298

## Summary

HTTP サーバーに必要な3要素—実行時状態（AppState）、ルーター組立（build_router）、エラー→HTTP 応答変換（ProxyError::into_response）—を実装する。handler はスタブでよい。

## Background

anthropx は Axum ベースの HTTP プロキシサーバーである。これまで M0〜M2 で以下の基盤型・純粋ロジックが整った：

| フェーズ | 成果物 | 状態 |
|---------|--------|------|
| M0-1 | AppConfig / GlobalConfig / ProviderConfig / ModelConfig 等の設定構造体 | ✅ 完了 |
| M0-2 | ProxyError / ConfigError / LossyLevel / ResolvedModel 等の型定義 | ✅ 完了 |
| M1-1 | parse_provider_model / resolve_model / build_upstream_headers 等の純粋関数 | ✅ 完了 |
| M2-1 | KeyScheduler（起動時乱択 + round-robin） | ✅ 完了 |
| M2-2 | ConcurrencyLimiter（Semaphore-based backpressure） | ✅ 完了 |
| M2-3 | ConfigLoader（TOML 読込） | ✅ 完了（cli.rs + AppConfig::from_toml） |

M3-1 はこれらの上に Axum HTTP サーバーの骨格を載せる最初のチケットである。AppState が全リソースを Arc 共有し、build_router が4つのエンドポイントを Axum Router として組み立て、ProxyError が IntoResponse を通じて Anthropic 互換エラースキーマの JSON を返す。

## Scope

### 実装対象

1. **`app_state.rs`** (新規)
   - `AppState` struct（`#[cfg(feature = "server")]` でガード）
   - フィールド: `config: AppConfig`, `http_clients: HashMap<String, reqwest::Client>`, `schedulers: HashMap<String, KeyScheduler>`, `limiters: HashMap<String, ConcurrencyLimiter>`
   - `pub fn new(...)` コンストラクタ

2. **`http/errors.rs`** (新規)
   - `impl IntoResponse for ProxyError`（RFC §11 準拠）
   - 全12 variant の HTTP ステータスコード + Anthropic 互換 `error_type` マッピング
     - `UnknownProvider / InvalidModel / MissingField / TransformLossy` → 400 + `invalid_request_error`
     - `Unauthorized` → 401 + `authentication_error`
     - `Forbidden` → 403 + `permission_error`
     - `QueueFull` → 429 + `rate_limit_error`
     - `Upstream / UpstreamError` → 502 + `upstream_error`
     - `Timeout` → 504 + `timeout_error`
     - `Internal / Config` → 500 + `internal_error`
   - JSON body: `{ "type": error_type, "error": { "type": error_type, "message": message } }`
   - Content-Type: `application/json`

3. **`http/mod.rs`** (新規)
   - `pub fn build_router(state: Arc<AppState>) -> Router`
   - 4 エンドポイント: `/healthz` (GET), `/metrics` (GET), `/v1/models` (GET), `/v1/messages` (POST)
   - `url_prefix` 対応（`Router::nest` による prefix ラップ）
   - Tower middleware のプレースホルダ（upstream_auth_layer / client_auth_layer は M3-2 で実装）

4. **`http/routes.rs`** (新規)
   - 4 つの handler: `healthz`, `metrics_handler`, `list_models`, `handle_messages`
   - 全て `[::STUB::]` 付きのスタブ実装（M3-3 で本実装）
   - スタブは 200 OK + 最小限の JSON または `todo!()` を返す

5. **`util/ids.rs`** (新規)
   - `pub fn generate_request_id() -> String`（UUID v4）

6. **`lib.rs`** (修正)
   - `pub mod app_state;` + `#[cfg(feature = "server")]` の条件付き宣言
   - `pub mod http;` + `#[cfg(feature = "server")]`
   - util に ids サブモジュール追加

7. **`Cargo.toml`** (修正)
   - `[features]` セクション追加: `default = ["server"]`, `server = ["dep:axum", "dep:reqwest", "dep:uuid", "dep:tokio/full"]`
   - axum = "0.8" (optional)
   - reqwest = { version = "0.12", optional = true, default-features = false, features = ["json"] }
   - uuid = { version = "1", features = ["v4"], optional = true }
   - tokio: 既存の `["sync"]` から `["rt", "macros", "sync", "stream"]` に拡張、server feature 経由で full を有効化
   - dev-dependencies: axum-test = "16"（試験的に追加）

### 非対象（別チケット）

- handler の本実装（M3-3）
- 認証 Tower middleware（M3-2）
- Transparent / Translate モード handler（M3-4, M3-5）
- ProxyServer::start 起動シーケンス（M4-1）
- Binary entrypoint（M4-2）

## Investigation

### 既存コードの状態

```
crates/anthropx/src/
├── lib.rs              ✅ M0-1 のモジュール宣言のみ。独自ロジックなし
├── cli.rs              ✅ Cli struct + parse_args
├── config/
│   └── mod.rs          ✅ 全設定構造体 + ProxyError enum（12 variant）+ ConfigError
├── routing/
│   ├── mod.rs          ✅ parse_provider_model / resolve_model / resolve_api_format
│   └── scheduler.rs    ✅ KeyScheduler
├── provider/
│   ├── mod.rs          ✅ limiter サブモジュール宣言のみ
│   └── limiter.rs      ✅ ConcurrencyLimiter + LimiterError
└── util/
    └── mod.rs          ✅ build_upstream_headers
```

### ProxyError enum（config/mod.rs L445-494）

```rust
pub enum ProxyError {
    UnknownProvider(String),      // 400 + invalid_request_error
    InvalidModel(String),         // 400 + invalid_request_error
    MissingField(&'static str),   // 400 + invalid_request_error
    Unauthorized,                 // 401 + authentication_error
    Forbidden,                    // 403 + permission_error
    QueueFull,                    // 429 + rate_limit_error
    Upstream(http::StatusCode),   // 502 + upstream_error
    UpstreamError(String),        // 502 + upstream_error
    TransformLossy(String),       // 400 + invalid_request_error
    Timeout,                      // 504 + timeout_error
    Internal(String),             // 500 + internal_error
    Config(String),               // 500 + internal_error
}
```

12 variant + thiserror で Display 実装済み。IntoResponse の実装のみ不足。

### 依存チケット

| ID | 関係 | 状態 |
|----|------|------|
| M0-1 (ticket 13) | 先行実装必須: AppConfig, GlobalConfig の型定義 | ✅ 完了 |
| M0-2 (ticket 14) | 先行実装必須: ProxyError enum | ✅ 完了 |
| M2-1 (ticket 15) | 先行実装必須: KeyScheduler 型 | ✅ 完了 |
| M2-2 (ticket 16) | 先行実装必須: ConcurrencyLimiter 型 | ✅ 完了 |
| M3-2 (ticket 163) | 後続: 認証 Tower middleware。本チケット完了後に着手 | ⏳ 未着手 |
| M3-3 (ticket 164) | 後続: handler 本実装 | ⏳ 未着手 |

### Cargo.toml（現状）

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
toml = "0.8"
thiserror = "2"
http = "1"
tokio = { version = "1", features = ["sync"] }
clap = { version = "4", features = ["derive"] }

[dev-dependencies]
serde_json = "1"
tokio = { version = "1", features = ["rt", "macros", "time"] }
```

**不足**: axum, reqwest, uuid, tokio features 拡張。RFC の設計通り `[features]` による feature gate を導入する必要がある。

### lib.rs の現状構成

```rust
pub mod cli;
pub mod config;
pub mod provider;
pub mod routing;
pub mod util;

pub use config::{ConfigError, LogFormat, LossyLevel, OpenAiWireApi, ProxyError, ResolvedModel};
```

`app_state` / `http` モジュールが未宣言。RFC では `#[cfg(feature = "server")]` でガードする設計。

## Test Plan

### ユニットテスト計画

#### 1. ProxyError::into_response — ステータスコード・error_type 検証

テスト対象: `http/errors.rs` の `IntoResponse for ProxyError`

| ケース | variant | 期待 HTTP ステータス | 期待 error_type |
|--------|---------|---------------------|-----------------|
| 正常系: 不明 provider | `UnknownProvider("x")` | 400 | `invalid_request_error` |
| 正常系: 無効 model | `InvalidModel("x")` | 400 | `invalid_request_error` |
| 正常系: フィールド欠落 | `MissingField("model")` | 400 | `invalid_request_error` |
| 正常系: 未認証 | `Unauthorized` | 401 | `authentication_error` |
| 正常系: 権限不足 | `Forbidden` | 403 | `permission_error` |
| 正常系: キュー満杯 | `QueueFull` | 429 | `rate_limit_error` |
| 正常系: upstream エラーステータス | `Upstream(502)` | 502 | `upstream_error` |
| 正常系: upstream 到達不能 | `UpstreamError("refused")` | 502 | `upstream_error` |
| 正常系: transform lossy | `TransformLossy("thinking")` | 400 | `invalid_request_error` |
| 正常系: タイムアウト | `Timeout` | 504 | `timeout_error` |
| 正常系: 内部エラー | `Internal("oops")` | 500 | `internal_error` |
| 正常系: 設定エラー | `Config("bad")` | 500 | `internal_error` |

各ケースで以下を検証:
- `response.status()` が期待値と一致
- JSON body の `"error"` オブジェクト内の `"type"` と `"message"` が期待値と一致
- Content-Type header が `application/json`

#### 2. build_router — エンドポイント登録

テスト対象: `http/mod.rs` の `build_router()`

- 4 エンドポイント (`/healthz`, `/metrics`, `/v1/models`, `/v1/messages`) が全て登録されていることを確認
- 各エンドポイントに GET/POST の期待メソッドでアクセスし 200 が返ることを確認（スタブのため）
- 未登録のパスにアクセスすると 404 が返ることを確認
- `url_prefix` が設定されている場合、prefix 配下にルートが生えることを確認

#### 3. generate_request_id

テスト対象: `util/ids.rs` の `generate_request_id()`

- 戻り値が空文字列でないこと
- 2 回の呼び出しで異なる値が返ること（UUID v4 の一意性）
- 文字列長が UUID v4 のフォーマット（36 文字 + ハイフン区切り）に準拠していること

#### 4. Content-Type

テスト対象: `http/errors.rs` の `IntoResponse`

- 全 variant のレスポンスに `content-type: application/json` header が含まれること

### ユニットテスト不可能な項目（例外）

- Axum Router の実際の HTTP リッスン（TestServer で代用可能のため、結合テストでカバー）
- スタブ handler の動作確認は M3-3 以降の本実装時に実施

## Boy Scout Rule — 翻訳可能性計画

### 新規コードの翻訳可能性設計

1. **`AppState` struct**: 4 フィールドは全てドメイン名詞（config / http_clients / schedulers / limiters）で、英語のまま「設定」「HTTP クライアント群」「スケジューラ群」「制限器群」として読める
2. **`build_router()`**: 関数呼び出しの並びが「Route を登録し、Layer を適用し、State を注入し、prefix を nest する」という逐語訳可能な一文になる
   ```rust
   Router::new()
       .route("/healthz", get(healthz))     // /healthz に GET healthz を登録し
       .route(...)                           // /v1/models に GET list_models を登録し
       .with_state(state)                   // state を注入し
       .nest(prefix, Router::new())          // prefix でラップする
   ```
3. **`IntoResponse` match 式**: RFC 通り variant をグループ化。各グループが「何が→どのステータス→どの error_type」を一段で表現する
4. **`generate_request_id()`**: 関数名が「リクエスト ID を生成する」と逐語訳できる

### 既存コードの改善（該当なし）

- 本チケットは全ファイル新規作成のため、既存コードの翻訳可能性改善は対象外

## Acceptance Criteria

- [ ] `AppState` struct が `config`, `http_clients`, `schedulers`, `limiters` の 4 フィールドを持つ
- [ ] `AppState` が `#[cfg(feature = "server")]` で条件付きコンパイルされる
- [ ] `Cargo.toml` に `[features]` が追加され、`server` feature で axum/reqwest/uuid が optional dependency として解決される
- [ ] `ProxyError` の全 12 variant が正しい HTTP ステータスコード + error_type マッピングを持つ
- [ ] エラーレスポンスの JSON body が `{ "type": ..., "error": { "type": ..., "message": ... } }` の形式に準拠する
- [ ] Content-Type が `application/json` である
- [ ] `build_router()` が 4 エンドポイント（healthz, metrics, v1/models, v1/messages）を登録する
- [ ] `url_prefix` 対応が Router::nest で実装されている
- [ ] `generate_request_id()` が UUID v4 形式の一意な文字列を返す
- [ ] handler 4 つがスタブ実装（`[::STUB::]` マーカー付き）で配置されている
- [ ] `make check-be` が通過する
- [ ] 全テストが通過する（`make test`）
- [ ] 全エラーバリアントにテストが存在する
- [ ] 翻訳可能性の検証が通っている
- [ ] clippy 警告がゼロ

## Notes

### 依存・関連チケット ID の点検結果

- 先行実装必須 (M0-1, M0-2, M2-1, M2-2): 全件 ✅ 完了。 `resolve-ticket.js` で存在確認済み
- 後続チケット (M3-2, M3-3): Tickets.md で正しく記述されている
- 循環依存: なし
- search-tickets.js で "anthropx M3" 検索 → 既存チケットなし（本チケットが M3 初）

### スタブの点検

`grep -rn '\[::STUB::\]' crates/anthropx/src/` → ヒットなし。
本チケット新規作成の handler 4 つは `[::STUB::]` マーカーを付与する。

### 成果物

- 計画: context/0162-m3-1-appstate-router-proxyerrorinto-response/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0162-m3-1-appstate-router-proxyerrorinto-response/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0162-m3-1-appstate-router-proxyerrorinto-response/review.md（未作成、/review-ticket 全チェック通過後に作成）
