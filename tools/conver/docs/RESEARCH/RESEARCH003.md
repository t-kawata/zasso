# RESEARCH003 — 六界面の実装改修パッケージ

ASSUMPTION: リポジトリは参照できていない。会話中の RESEARCH001/002、提示された project seam、既知の訂正を正本とする。以下の既存ファイルへの関数追加は改修提案であり、現行実装を読んだ結果ではない。

コード中の `crate::bridge`、`crate::project`、`*_compat`、`WsEngine`、`DurableEvents`、`ExecutionClaims` は、新規に作るプロジェクト補助 API。外部 SDK に存在する API と混同しない。補助 API の責務は後半で固定する。

## 1. Implementation Packet — MCP

### 1.1 Decision / Cargo

| 項目 | 決定 |
|---|---|
| 推奨 | `rmcp = 0.8.5`。SDK tool router + streamable HTTP。まず sessionless profile を実装 |
| features | `server`, `macros`, `transport-streamable-http-server` |
| defaults | `false`。必要 feature を明示 |
| factory | `server(bridge: Arc<Bridge>) -> axum::Router` |
| fallback | 新 protocol revision 対応が必要な場合、`rmcp = 3.9.0` へ `mcp_compat` のみ移植。dispatcher seam は変更しない |
| confidence | tool/router/HTTP service: high。config field、cancellation、外部 session transport: low |
| 版方針 | 最新版の主張ではなく、具体的な固定版公式例が取得できた保守的 baseline |

`rmcp 0.8.5` の公式文書は `tool_router`、`ToolRouter<Self>`、tool macro、structured output を掲載する。streamable HTTP service の constructor と feature も確認できる。 [docs](https://docs.rs/rmcp/0.8.5/rmcp/)

```toml
# crates/interface-mcp/Cargo.toml
[dependencies]
rmcp = { version = "=0.8.5", default-features = false, features = [
  "server", "macros", "transport-streamable-http-server"
] }
axum = { version = "=0.8.9", default-features = false, features = [
  "http1", "tokio", "json"
] }
tokio = { version = "=1.48.0", default-features = false, features = [
  "rt-multi-thread", "macros", "sync", "time", "net"
] }
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.145"
```

ASSUMPTION: Tokio/Serde の patch pin と依存 graph は実装開始時に解決する。`rmcp` が要求する minimum を満たさない場合、同じ major 内で workspace pin を一括更新する。

### 1.2 Skeleton

```rust
// crates/interface-mcp/src/api/mod.rs
// NOT-COMPILED.
// Bridge, BoundCall, mcp_compat are NEW project APIs.
use std::sync::Arc;
use axum::{Router, middleware};
use rmcp::{
    ServerHandler, tool, tool_handler, tool_router,
    handler::server::{tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ServerCapabilities, ServerInfo},
    transport::streamable_http_server::{
        StreamableHttpService, StreamableHttpServerConfig,
        session::never::NeverSessionManager,
    },
};
use rmcp::schemars::JsonSchema;
use serde::Deserialize;
use crate::bridge::{Bridge, BoundCall};

#[derive(Clone)]
pub struct Tools {
    bridge: Arc<Bridge>,
    tool_router: ToolRouter<Self>,
}

#[derive(Deserialize, JsonSchema)]
pub struct InspectInput {
    pub resource_id: String,
}

#[tool_router]
impl Tools {
    pub fn new(bridge: Arc<Bridge>) -> Self {
        Self { bridge, tool_router: Self::tool_router() }
    }

    #[tool(name = "resource_inspect", description = "Inspect a resource")]
    async fn inspect(
        &self,
        Parameters(input): Parameters<InspectInput>,
        // VERIFY-AT-IMPL: macro argument/extractor combination.
        rmcp::handler::server::tool::Extension(parts):
            rmcp::handler::server::tool::Extension<
                axum::http::request::Parts
            >,
    ) -> Result<CallToolResult, rmcp::ErrorData> {
        let call = parts.extensions.get::<BoundCall>()
            .ok_or_else(crate::mcp_compat::missing_auth)?;
        let reply = self.bridge.verified(
            call.identity.clone(),
            "resource.inspect",
            call.wire.clone(),
            serde_json::json!({"resource_id": input.resource_id}),
        ).await;
        crate::mcp_compat::tool_reply(reply)
    }
}

#[tool_handler]
impl ServerHandler for Tools {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            capabilities: ServerCapabilities::builder()
                .enable_tools().build(),
            ..Default::default()
        }
    }
}

pub fn server(bridge: Arc<Bridge>) -> Router {
    let factory_bridge = bridge.clone();

    // VERIFY-AT-IMPL: exact 0.8.5 field spelling.
    let config = StreamableHttpServerConfig {
        stateful_mode: false,
        json_response: false,
        ..Default::default()
    };

    let service = StreamableHttpService::new(
        move || Ok(Tools::new(factory_bridge.clone())),
        Arc::new(NeverSessionManager::default()),
        config,
    );

    Router::new()
        .nest_service("/mcp", service)
        .route_layer(middleware::from_fn_with_state(
            bridge,
            crate::mcp_compat::authenticate_http,
        ))
}
// Invariant: dispatcher is the only business entry point.
// Invariant: identity is verifier-produced.
```

`Extension<http::request::Parts>` を tool 引数から取得する方法は HTTP service の公式説明にある。macro と `Parameters<T>` の組合せは `VERIFY-AT-IMPL`。 [docs](https://docs.rs/rmcp/0.8.5/rmcp/transport/streamable_http_server/tower/struct.StreamableHttpService.html)

`NeverSessionManager` の module、`Default`、`SessionManager` 実装は固定版 source で確認できた。各 session operation は session management unsupported を返す。 [docs](https://docs.rs/rmcp/0.8.5/src/rmcp/transport/streamable_http_server/session/never.rs.html)

### 1.3 API map

| Item | 使用方法・signature | 状態 |
|---|---|---|
| `ToolRouter<Self>` | `Self::tool_router()` | high、公式例 |
| `ServerHandler` | `fn get_info(&self) -> ServerInfo` | medium、tool forwarding macro は実装時確認 |
| `StreamableHttpService::new` | factory、`Arc<M>`、config を受け取り service を生成 | high |
| `StreamableHttpService::handle` | HTTP request → response body | high |
| `SessionManager` | associated `Error`、`Transport` と複数の future-returning methods | high |
| `NeverSessionManager` | sessionless profile 用 manager | high |
| `StreamableHttpServerConfig` | sessionless / JSON response 方針 | field 名は `VERIFY-AT-IMPL` |
| `RequestContext` | cancellation、progress、peer binding | exact accessors は `VERIFY-AT-IMPL` |

`SessionManager` は dyn-compatible ではない。外部実装は generic `M: SessionManager` として service に渡し、`Arc<dyn SessionManager>` は使わない。 [docs](https://docs.rs/rmcp/0.8.5/rmcp/transport/streamable_http_server/session/trait.SessionManager.html)

### 1.4 Wiring / stateless / dual mode

| 項目 | 実装決定 |
|---|---|
| tool mapping | operation manifest から tool 名・DTO・schema・operation ID を生成。任意 operation 名を実行する汎用 tool は作らない |
| auth | HTTP middleware → 単一 Authorization 値 → 同期 verifier → `BoundCall` を request extensions に注入 |
| audience | configured MCP resource と `Audience` を一致させる |
| discovery | public router に protected-resource metadata。protected endpoint の 401 に Bearer challenge |
| result | `SemanticReply` → `CallToolResult`。operation failure は tool error flag と public error body。protocol error と分離 |
| request_id | HTTP context → `WireContext` → dispatcher → reply。JSON-RPC ID と混同しない |
| output schema | skeleton の最小 carrier から、generated `Json<ReplyDto>` または SDK structured output へ置換 |
| token passthrough | 禁止。外部サービス用 credential は core 側の専用仕組みで取得 |

stateless を二段階に分ける。

| Profile | 達成レベル | session / resume |
|---|---|---|
| `mcp-l1-json` | session 不使用、affinity 不要 | JSON response。resume 非対応と明示 |
| `mcp-l1-sse` | session 不使用、affinity 不要 | request-scoped SSE。resume 非対応と明示 |
| `mcp-l2` | 外部 session/event authority、affinity 不要 | cross-instance resume、restart recovery |

JSON/SSE は最初から動的 negotiation に依存させない。推奨初期構成は `/mcp/json` と `/mcp/sse` の二 mount。Tools と dispatcher mapping は共有し、SDK response policy だけ変更する。endpoint ごとの resource metadata を設定する。

`mcp-l2` は単純な KV store 追加ではない。次の SDK lifecycle を外部実装する。

- `create_session`
- `initialize_session`
- `has_session`
- `close_session`
- `create_stream`
- `accept_message`
- `create_standalone_stream`
- `resume`

これらは固定版 trait に存在する。 [docs](https://docs.rs/rmcp/0.8.5/rmcp/transport/streamable_http_server/session/trait.SessionManager.html)

外部 DB に principal、protocol revision、TTL、event cursor を保存し、共有 broker で live notification を行う。resume 時にも tenant/subject/resource を検証する。ローカル transport object の存在を authoritative state の存在と混同しない。

Cancellation/progress は `mcp_compat::bind_context` に集約する。SDK cancellation と dispatcher cancel handle を接続し、progress token がある場合のみ SDK notification を送る。正確な SDK method 名は `VERIFY-AT-IMPL`。対応しない operation を黙って buffer して疑似対応しない。

### 1.5 Forbidden / Detector / Test

| Forbidden | Detector |
|---|---|
| 手書き JSON-RPC | AST で `jsonrpc/method/id` wire envelope の構築を検出。fixture を除外 |
| authoritative local session map | production session manager/store 内の `HashMap`、`DashMap`、`LocalSessionManager` |
| whole-stream buffering | stream bridge 内の `collect::<Vec`、`try_collect`、全 body aggregation |
| sticky-session 前提 | deployment affinity 設定検査 + cross-instance test |
| dispatcher bypass | adapter → operation implementation の dependency edge |

必須検出: `ServerHandler` 実装、generated tool router、SDK HTTP service、auth middleware、dispatcher bridge。

Test 名:

```text
mcp_tools
mcp_auth
mcp_cross_instance
mcp_restart
mcp_dual_mode
mcp_cancel_progress
mcp_resume_external
```

```sh
cargo +1.95 test --locked -p interface-mcp \
  --test contract mcp_dual_mode -- --exact
```

`mcp_resume_external` は L1 で skip しない。L1 では非対応 capability と拒否応答を検査し、L2 では durable replay を検査する。

### 1.6 Rules / Risk

下記 key は登録用 proposal key。正規 rule ID は後述の allocator が既存数値採番へ割り当てる。

| Proposal key | MUST 本文 | Verification |
|---|---|---|
| `MCP-IMPL-001` | MCP adapters MUST register generated tools through the selected rmcp tool router and MUST dispatch through the shared Dispatcher. | source + `mcp_tools` |
| `MCP-IMPL-002` | Every deployed MCP profile MUST declare session and replay capabilities and MUST pass cross-instance and restart tests for those capabilities. | profile + process tests |
| `MCP-IMPL-003` | MCP JSON and SSE responses MUST use SDK framing and MUST share the same tool execution path. | dual-mode + source |

Risk: `0.8.5` は最新 protocol 対応の保証ではない。新 revision が必須なら fallback を先に適用する。L2 は独立した耐久 transport 実装であり、L1 が動いたことをもって完成としない。

## 2. Implementation Packet — A2A

### 2.1 Decision / Cargo

| 項目 | 決定 |
|---|---|
| 推奨 | `a2a-lf = 0.4.2`、`a2a-server-lf = 0.4.3` |
| pattern | SDK framing + shared executor + external task/event/claim infrastructure |
| defaults | 両 SDK は明示 `true`。未確認 feature 名を追加しない |
| factory | `server(state: A2aState) -> axum::Router` |
| fallback | server manifest が要求する model version へ一本化。default handler に durable resume がなければ custom SDK `RequestHandler` wrapper |
| confidence | package/import 対応・再公開名: high。pair・constructor・trait forwarding: low |

`a2a-lf 0.4.2` は package 名と Rust import 名 `a2a` の対応を明記する。server `0.4.3` は `AgentExecutor`、`RequestHandler`、`DefaultRequestHandler`、`TaskStore`、認証 middleware 関連型を再公開する。 [docs](https://docs.rs/a2a-lf/0.4.2/a2a/)

ASSUMPTION: この pair は着手用推奨値。互換性は未確認。最初の依存解決で server の model requirement を見て、異なる model 型を跨がないよう pin を統一する。

```toml
# crates/interface-a2a/Cargo.toml
[dependencies]
a2a = { package = "a2a-lf", version = "=0.4.2", default-features = true }
a2a-server = { package = "a2a-server-lf", version = "=0.4.3", default-features = true }
axum = { version = "=0.8.9", default-features = false, features = [
  "http1", "tokio", "json"
] }
tokio = { version = "=1.48.0", default-features = false, features = [
  "rt-multi-thread", "macros", "sync", "time", "net"
] }
futures-util = { version = "=0.3.31", default-features = false, features = [
  "std", "async-await"
] }
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.145"
```

### 2.2 Skeleton

以下の `// target:` ごとにファイルを分割する。

```rust
// target: crates/interface-a2a/src/api/mod.rs
// NOT-COMPILED. SDK signature differences are isolated in sdk_compat.
use std::sync::Arc;
use axum::Router;
use serde_json::Value;
use tokio::sync::mpsc;
use a2a_server::{AgentExecutor, RequestHandler};
use crate::bridge::{Bridge, BoundCall};
use crate::task::{TaskOwner, TaskStore};

#[derive(Clone)]
pub struct Executor {
    pub bridge: Arc<Bridge>,
    pub tasks: Arc<dyn TaskStore>,
    pub events: Arc<dyn crate::events::DurableEvents>,
    pub claims: Arc<dyn crate::events::ExecutionClaims>,
}

impl Executor {
    pub async fn execute_shared(
        &self, call: BoundCall, task_id: String, input: Value,
        live: mpsc::Sender<crate::events::EventRef>,
    ) -> Result<(), crate::events::ExecutionError> {
        let owner = self.bridge.task_owner(&call.identity);
        let claim = self.claims
            .acquire(&owner, &task_id, &call.wire).await?;

        if !claim.is_new() {
            return self.events
                .replay_to(&owner, &task_id, None, live).await;
        }

        let operation = self.bridge.operation_for_skill(&input)?;
        let handle = self.bridge.server_stream(
            call.identity, &operation, call.wire, input,
        ).await?;

        // Durable append before live delivery.
        // Claim fencing, state transition and terminal marker are transactional.
        self.events.drive(
            &owner, &task_id, claim, handle,
            self.tasks.clone(), live,
        ).await
    }

    pub async fn cancel(
        &self, owner: &TaskOwner, task_id: &str,
    ) -> Result<(), crate::events::ExecutionError> {
        self.claims.cancel_owned(owner, task_id).await
    }
}

pub fn server(state: crate::sdk_compat::A2aState) -> Router {
    crate::sdk_compat::router(state)
}

// Compile-time check applied after real SDK forwarding implementations exist.
fn assert_sdk_bindings<E: AgentExecutor, H: RequestHandler>() {}

// target: crates/interface-a2a/src/task/store.rs
use std::sync::Arc;
use futures_util::future::BoxFuture;
use serde_json::Value;

pub struct TaskOwner {
    pub subject: crate::project::SubjectId,
    pub tenant: Option<crate::project::TenantId>,
}

pub trait TaskStore: Send + Sync {
    fn load(&self, owner: &TaskOwner, task_id: &str)
        -> BoxFuture<'_, Option<Value>>;
    fn save(&self, owner: &TaskOwner, task_id: &str, state: Value)
        -> BoxFuture<'_, Result<(), String>>;
}

pub struct ExternalTasks(pub Arc<dyn crate::storage::TaskRepository>);

impl TaskStore for ExternalTasks {
    fn load(&self, owner: &TaskOwner, task_id: &str)
        -> BoxFuture<'_, Option<Value>> {
        let db = self.0.clone();
        let key = crate::storage::OwnedTaskKey::new(owner, task_id);
        Box::pin(async move {
            // Compatibility facade: rich errors are handled by SDK wrapper.
            db.load(key).await.ok().flatten()
        })
    }

    fn save(&self, owner: &TaskOwner, task_id: &str, state: Value)
        -> BoxFuture<'_, Result<(), String>> {
        let db = self.0.clone();
        let key = crate::storage::OwnedTaskKey::new(owner, task_id);
        Box::pin(async move {
            db.save(key, state).await.map_err(|e| e.to_string())
        })
    }
}
```

Skeleton の `load` は提示 seam に合わせた compatibility facade。DB 障害を not-found として処理し続ける本番実装にはしない。SDK wrapper は richer repository API で unavailable/not-found を区別し、seam facade の利用範囲を限定する。

### 2.3 API map / SDK adapter の実装順

| SDK item | 接続 | 状態 |
|---|---|---|
| `AgentExecutor` / `ExecutorContext` | SDK context → `BoundCall`、task、input、live queue → `execute_shared` | 再公開名 high、完全 signature は `VERIFY-AT-IMPL` |
| `DefaultRequestHandler` | executor/store/card を接続 | constructor は `VERIFY-AT-IMPL` |
| `RequestHandler` | send/stream/get/cancel/resubscribe | method signatures は `VERIFY-AT-IMPL` |
| SDK `TaskStore` | project owner-bound repository への adapter | project trait と同一視しない |
| `CallInterceptor` / `CallContext` / `User` | bearer verification、owner binding | hook signature は `VERIFY-AT-IMPL` |
| `jsonrpc` / `sse` / `rest` / `card` modules | SDK framing と route construction | module 名確認、具体 builder は `VERIFY-AT-IMPL` |

これらの再公開と module は固定版 root 文書で確認できる。 [docs](https://docs.rs/a2a-server-lf/0.4.3/a2a_server/)

`src/sdk_compat.rs` に次の project API を実装する。

```rust
// Project API contract, not claimed SDK signatures.
bind_executor(Arc<Executor>) -> CompatExecutor
bind_store(Arc<ExternalTasks>) -> SdkTaskStore
build_handler(CompatExecutor, SdkTaskStore) -> impl RequestHandler
router(A2aState) -> axum::Router
sse(DurableEventStream) -> Result<SdkSseResponse, ExecutionError>
```

実装順を固定する。

1. 選定 SDK の `AgentExecutor`、`TaskStore`、`RequestHandler` signature を `sdk_compat` へ転記。
2. `CompatExecutor` の各 forwarding body を `execute_shared` / `cancel` に接続。
3. SDK task type と project snapshot の変換を `SdkTaskStore` に限定。
4. default handler を構築。
5. durable replay を default handler が提供しなければ custom `RequestHandler` を実装。
6. HTTP/SSE serialization は SDK に残す。

SDK trait の未確認 signature を捏造する代わりに、確認箇所をこの一 module に隔離する。

### 2.4 Shared execution / external state

| 項目 | 実装決定 |
|---|---|
| `message/send` | shared executor を開始し terminal state まで待機。durable snapshot を SDK result に変換 |
| `message/stream` | 同じ executor を開始し SDK event queue を接続 |
| unary operation | `execute_verified` |
| server stream operation | `execute_server_stream_verified` |
| client/bidi operation | SDK model が表現できる場合だけ mapping。暗黙変換しない |
| cancellation | durable cancel command + worker cancellation。stream disconnect と task cancel を分離 |
| resubscribe | owner authorization → durable event cursor → SDK SSE |
| agent card | generated skills、実際の streaming capability、configured security scheme |
| auth | card public route と protected task routes を分離。verified identity から owner を生成 |

外部 infrastructure の key を固定する。

```text
task:        (tenant, subject, task_id)
event:       (tenant, subject, task_id, sequence)
claim:       (tenant, subject, task_id)
idempotency: (tenant, subject, operation, idempotency_key)
```

Claim は lease expiry と monotonic fencing token を持つ。event append、task version update、terminal marker は transaction で整合させる。

提示 `load/save` seam は atomic claim、CAS、dedup、event log を表現しない。既存 seam を破壊せず、adapter infrastructure に `ExecutionClaims` と `DurableEvents` を追加する。task store だけで副作用 exactly-once を保証しない。operation idempotency に接続する。

SDK event queue は live delivery の出口。authoritative event は外部 log。通知の前に永続化し、再接続は別 instance でも log から復元する。

### 2.5 Forbidden / Detector / Test / Rules

| Forbidden | Detector |
|---|---|
| production in-memory task store | store impl 内の `InMemoryTaskStore`、`HashMap`、`DashMap` |
| global current-owner | mutable global/thread-local owner context |
| owner なし repository call | AST で `OwnedTaskKey` / `TaskOwner` 非使用を検出 |
| 手書き SSE | SDK shim 外の `text/event-stream`、`data:` framing |
| shared executor bypass | send/stream が別 business entry point を持つ構造 |
| sticky session | deployment 設定 + instance 切替 test |

Test:

```text
a2a_card_skills
a2a_send_stream_shared
a2a_owner_isolation
a2a_external_store
a2a_cross_instance
a2a_restart_dedup
a2a_cancel_resubscribe
```

```sh
cargo +1.95 test --locked -p interface-a2a \
  --test contract a2a_send_stream_shared -- --exact
```

| Proposal key | MUST 本文 | Verification |
|---|---|---|
| `A2A-IMPL-001` | A2A send and stream methods MUST use one shared executor and SDK wire framing. | shared-path probe |
| `A2A-IMPL-002` | Task, cancellation, and replay access MUST bind subject and tenant from verified identity at the persistence boundary. | owner isolation |
| `A2A-IMPL-003` | Production A2A task state, execution claims, idempotency records, and event logs MUST survive instance replacement without sticky sessions. | restart/cross-instance |

Risk: pair alignment、protocol revision と method 名、SDK trait shape。fallback は SDK framing を維持した wrapper。SDK の不足を理由として手書き protocol server に切り替えない。

## 3. Implementation Packet — REST

### 3.1 Decision / Cargo

| 項目 | 決定 |
|---|---|
| 推奨 | axum `0.8.9`、Tower、utoipa `5.4.0`、Swagger UI `9.0.2` |
| defaults | protocol/middleware/schema crate は明示無効 |
| factory | `router(Arc<Bridge>) -> axum::Router` |
| fallback | Swagger UI のみ外し、OpenAPI JSON endpoint を保持 |
| confidence | axum routing: high。graph 全体: medium |

utoipa `5.4.0` の macro/axum feature、Swagger UI `9.0.2` の axum/vendored feature と merge 例を確認した。 [docs](https://docs.rs/utoipa/5.4.0/utoipa/)

```toml
# crates/interface-rest/Cargo.toml
[dependencies]
axum = { version = "=0.8.9", default-features = false, features = [
  "http1", "tokio", "json"
] }
tower = { version = "=0.5.3", default-features = false, features = ["util"] }
tower-http = { version = "=0.6.6", default-features = false, features = [
  "cors", "trace", "request-id"
] }
utoipa = { version = "=5.4.0", default-features = false, features = [
  "macros", "axum_extras"
] }
utoipa-swagger-ui = { version = "=9.0.2", default-features = false, features = [
  "axum", "vendored"
] }
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.145"

[dev-dependencies]
tokio = { version = "=1.48.0", default-features = false, features = [
  "rt-multi-thread", "macros"
] }
```

### 3.2 Skeleton

```rust
// crates/interface-rest/src/api/mod.rs
// NOT-COMPILED. rest_compat is a NEW project module.
use std::sync::Arc;
use axum::{
    Router, Json, Extension,
    extract::{State, Request, DefaultBodyLimit},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
};
use serde::{Serialize, Deserialize};
use tower_http::trace::TraceLayer;
use utoipa::{OpenApi, ToSchema};
use utoipa_swagger_ui::SwaggerUi;
use crate::bridge::{Bridge, BoundCall};

#[derive(Serialize, Deserialize, ToSchema)]
pub struct Inspect { pub resource_id: String }

#[derive(OpenApi)]
#[openapi(paths(inspect), components(schemas(Inspect)))]
pub struct ApiDoc;

#[utoipa::path(
    post, path="/v1/resource/inspect", request_body=Inspect,
    responses((status=200, description="SemanticReply"))
)]
async fn inspect(
    State(bridge): State<Arc<Bridge>>,
    Extension(call): Extension<BoundCall>,
    body: Result<Json<Inspect>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let input = match body {
        Ok(Json(v)) => v,
        Err(e) => return crate::rest_compat::decode_error(
            &bridge, call.wire, e,
        ),
    };
    let reply = bridge.verified(
        call.identity, "resource.inspect", call.wire,
        serde_json::json!({"resource_id":input.resource_id}),
    ).await;
    crate::rest_compat::render(reply)
}

async fn authenticate(
    State(bridge): State<Arc<Bridge>>,
    mut req: Request,
    next: Next,
) -> Response {
    let wire = bridge.http_wire(req.headers());
    let identity = match bridge.http_identity(req.headers()) {
        Ok(id) => id,
        Err(e) => return crate::rest_compat::auth_error(&bridge, wire, e),
    };
    req.extensions_mut().insert(BoundCall { identity, wire });
    next.run(req).await
}

pub fn router(bridge: Arc<Bridge>) -> Router {
    let protected = Router::new()
        .route("/v1/resource/inspect", post(inspect))
        .layer(DefaultBodyLimit::max(1_048_576))
        .route_layer(middleware::from_fn_with_state(
            bridge.clone(), authenticate,
        ));
    let public = Router::new()
        .route("/healthz", get(|| async { "ok" }));

    protected.merge(public)
        .merge(SwaggerUi::new("/docs")
            .url("/openapi.json", ApiDoc::openapi()))
        .fallback(crate::rest_compat::not_found)
        .with_state(bridge)
        .layer(crate::rest_compat::strict_cors())
        .layer(TraceLayer::new_for_http())
        .layer(middleware::from_fn(crate::rest_compat::request_id))
}
```

### 3.3 API / Wiring

axum `0.8.9` の `Router`、`State`、`with_state`、`route_layer`、middleware の基本形は公式文書で確認できる。 [docs](https://docs.rs/axum/0.8.9/axum/)

| API | 使用 |
|---|---|
| `Router::{new,route,route_layer,merge,with_state}` | public/protected composition |
| `State<Arc<Bridge>>` | state injection |
| `Extension<BoundCall>` | verifier-produced identity |
| `Json<T>` / `JsonRejection` | decode と semantic rejection |
| `DefaultBodyLimit::max` | JSON extractor の body limit |
| `tower::ServiceExt::oneshot` | in-process test |
| `ApiDoc::openapi()` / `SwaggerUi::new().url()` | document/UI |

実行順序:

```text
canonical request_id
→ trace
→ CORS / preflight
→ protected auth
→ body extraction limit
→ decode
→ dispatcher
→ semantic renderer
```

- CORS は auth の外。OPTIONS が verifier へ到達しないことを検査。
- public operation は `execute_anonymous`。auth failure から anonymous fallback しない。
- 404、405、decode、body limit、auth error も共通 renderer に接続。
- `DefaultBodyLimit` を無視する生 body route を追加する場合、transport body limit と rejection conversion を追加。
- OpenAPI response/security/schema は operation manifest と validation 定義から生成。skeleton の description-only response は最初に置換する。
- request_id は response header と `SemanticReply.request_id` を一致させる。

### 3.4 Forbidden / Detector / Test / Rules

禁止: `actix-web`、`warp`、`poem` の直接 production dependency、手書き HTTP loop、handler→operation implementation。

Detector: role graph、protected router の auth layer、error renderer、body limit、OpenAPI manifest equality。method 名の出現だけでは合格にしない。

```rust
// crates/interface-rest/src/api/tests.rs
use super::*;
use axum::{body::Body, http::{Request, StatusCode}};
use tower::ServiceExt;

#[tokio::test]
async fn rest_route_oneshot() {
    let response = router(crate::fixtures::bridge())
        .oneshot(Request::builder().uri("/healthz")
            .body(Body::empty()).unwrap())
        .await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}
```

```sh
cargo +1.95 test --locked -p interface-rest \
  api::tests::rest_route_oneshot -- --exact
```

追加 contract tests: `rest_auth_body_order`、`rest_envelope_errors`、`rest_openapi_equal`、`rest_cors_preflight`。

| Proposal key | MUST 本文 | Verification |
|---|---|---|
| `REST-IMPL-001` | Protected REST routes MUST verify credentials before decoding operation bodies and MUST invoke only the shared dispatcher entry point. | order probe + graph |
| `REST-IMPL-002` | Every REST rejection path MUST use the shared semantic error renderer and the canonical request_id. | rejection fixtures |
| `REST-IMPL-003` | OpenAPI operations and schemas MUST be generated from the same operation and validation manifest used at runtime. | equality test |

Risk: Swagger/utoipa 型互換性、SemanticReply schema、method-not-allowed renderer。fallback は UI 部分だけ。

## 4. Implementation Packet — WebSocket

### 4.1 Decision / Cargo

| 項目 | 決定 |
|---|---|
| 推奨 | axum `0.8.9` ws、futures-util `0.3.31`、Tokio `1.48.0` |
| factory | `router(Arc<Bridge>) -> Router` |
| fallback | 同じ axum socket を単一 actor で poll。別 WS server へ移行しない |
| confidence | upgrade/split: high。engine/concurrency: medium |

axum `0.8.9` の公式例に `WebSocketUpgrade`、`on_upgrade`、`split`、`SinkExt`、`StreamExt` がある。 [docs](https://docs.rs/axum/0.8.9/axum/extract/ws/index.html)

```toml
# crates/interface-websocket/Cargo.toml
[dependencies]
axum = { version = "=0.8.9", default-features = false, features = [
  "http1", "tokio", "ws"
] }
futures-util = { version = "=0.3.31", default-features = false, features = [
  "std", "async-await", "sink"
] }
tokio = { version = "=1.48.0", default-features = false, features = [
  "rt-multi-thread", "macros", "sync", "time", "net", "io-util"
] }
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.145"
```

### 4.2 Skeleton

```rust
// crates/interface-websocket/src/api/mod.rs
// NOT-COMPILED. WsEngine is a NEW adapter-local state machine.
use std::{sync::Arc, time::Duration};
use axum::{
    Router,
    extract::{State, ws::{WebSocketUpgrade, WebSocket, Message}},
    http::HeaderMap, response::Response, routing::get,
};
use futures_util::{SinkExt, StreamExt};
use tokio::{sync::mpsc, time::{interval, timeout}};
use crate::bridge::Bridge;
use crate::ws_engine::{WsEngine, ConnectionLease};

const QUEUE: usize = 64;
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);

pub fn router(state: Arc<Bridge>) -> Router {
    Router::new().route("/ws", get(upgrade)).with_state(state)
}

async fn upgrade(
    State(state): State<Arc<Bridge>>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !state.origin_allowed(&headers) {
        return crate::ws_engine::reject_origin(&state, &headers);
    }
    let ticket = match crate::ws_engine::ticket_header(&headers) {
        Ok(v) => v,
        Err(e) => return crate::ws_engine::reject(&state, &headers, e),
    };
    let lease = match state.redeem_ticket(ticket, &headers).await {
        Ok(v) => v,
        Err(e) => return crate::ws_engine::reject(&state, &headers, e),
    };
    ws.max_message_size(1_048_576)
        .on_upgrade(move |socket| run(socket, state, lease))
}

async fn run(socket: WebSocket, state: Arc<Bridge>, lease: ConnectionLease) {
    let (mut sink, mut source) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(QUEUE);
    let mut engine = WsEngine::new(state, lease, tx);
    let mut heartbeat = interval(Duration::from_secs(20));
    heartbeat.set_missed_tick_behavior(
        tokio::time::MissedTickBehavior::Delay,
    );

    loop {
        tokio::select! {
            incoming = source.next() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if engine.on_text(text.as_str()).await.is_err() { break; }
                }
                Some(Ok(Message::Pong(_))) => engine.pong(),
                Some(Ok(Message::Ping(_))) => {
                    if timeout(WRITE_TIMEOUT, sink.flush()).await
                        .map_or(true, |r| r.is_err()) { break; }
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => engine.protocol_violation(),
            },
            outbound = rx.recv() => match outbound {
                Some(msg) => {
                    if timeout(WRITE_TIMEOUT, sink.send(msg)).await
                        .map_or(true, |r| r.is_err()) { break; }
                }
                None => break,
            },
            _ = heartbeat.tick() => {
                if engine.pong_expired() { break; }
                let ping = Message::Ping(vec![].into());
                if timeout(WRITE_TIMEOUT, sink.send(ping)).await
                    .map_or(true, |r| r.is_err()) { break; }
            },
            _ = engine.overloaded() => {
                let frame = axum::extract::ws::CloseFrame {
                    code: 1013, reason: "capacity exceeded".into(),
                };
                let _ = timeout(
                    WRITE_TIMEOUT, sink.send(Message::Close(Some(frame))),
                ).await;
                break;
            }
        }
    }
    engine.cancel_join_release().await;
    let _ = timeout(Duration::from_secs(2), sink.close()).await;
}
```

### 4.3 API / Wiring / streaming

| Item | 接続 |
|---|---|
| `WebSocketUpgrade::on_upgrade` | 全 pre-accept 検査後だけ呼ぶ |
| `WebSocket::split` | socket writer を一箇所に限定 |
| `mpsc::channel` | finite outbound queue |
| `try_send` | full 時に独立 overload signal |
| `interval` / `timeout` | heartbeat、write、close |
| `CloseFrame` | 1013 payload。exact payload types は `VERIFY-AT-IMPL` |

Sequence:

```text
Origin allowlist
→ X-WS-Ticket 単一値
→ one-time redemption
→ connection lease
→ upgrade
→ frame engine
→ matching dispatcher method
→ cancellation / join / release
```

ASSUMPTION: header ticket を送れる client を対象とする。browser client への対応が必要な場合は、別途 cookie/subprotocol-based credential transport を明示設計する。query ticket は fallback にしない。

`WsEngine::on_text` は decode、correlation、resource FIFO enqueue だけを行い、operation 完了を待たない。

| Frame | Engine 動作 |
|---|---|
| unary request | `execute_verified` |
| `StreamOpen` | operation kind に応じ server/client/bidi stream を開始 |
| `StreamItem` | bounded input sender へ転送 |
| `StreamClose` | input half-close |
| `StreamCancel` | dispatcher cancellation |
| `StreamEnd` | output terminal、correlation release |

connection queue だけでなく resource queue 数、各 queue capacity、dispatch concurrency も制限する。1013 close は満杯 queue を経由せず socket owner が直接送る。

Drop は同期 cancellation signal を発火し、supervisor が async join/release を実行する。async cleanup を Drop 内で完了できると仮定しない。

### 4.4 Forbidden / Detector / Test / Rules

| Forbidden | Detector |
|---|---|
| query ticket | upgrade handler の `Query<...>` と ticket field |
| unbounded channel | `unbounded_channel`、`UnboundedSender` |
| blocking send | `blocking_send` |
| unbounded per-frame spawn | spawn 数と semaphore/queue の対応検査 |
| business logic | dependency edge + generated handler equality |

Test:

```text
ws_origin_ticket_preaccept
ws_stream_lifecycle
ws_resource_fifo
ws_correlation
ws_backpressure_1013
ws_cleanup
```

```sh
cargo +1.95 test --locked -p interface-websocket \
  --test contract ws_stream_lifecycle -- --exact
```

Driver は実 HTTP+WS handshake。duplex を使う場合も HTTP upgrade driver を実行し、router response だけで upgrade 成功としない。

| Proposal key | MUST 本文 | Verification |
|---|---|---|
| `WS-IMPL-001` | Origin validation and ticket redemption MUST complete before WebSocket acceptance. | preaccept probe |
| `WS-IMPL-002` | All connection queues and dispatch concurrency MUST be bounded, with overload producing the configured 1013 close path. | overload test |
| `WS-IMPL-003` | Stream input closure, output termination, and cancellation MUST be distinct states with deterministic cleanup. | lifecycle test |

Risk: `select!` 内 borrow、SDK control frame 処理、client capability。必要なら actor fallback。

## 5. Implementation Packet — CLI

### 5.1 Decision / Cargo

| 項目 | 決定 |
|---|---|
| 推奨 | clap `4.5.50`、reqwest `0.12.24`、tonic `0.14.2` |
| pattern | generated command DTO → explicit mode → shared dispatcher/client |
| factory | `run() -> ExitCode`、test seam `run_from(...)` |
| fallback | 明示 `--mode rest`。network failure から local/別 transport への自動 fallback 禁止 |
| confidence | medium。pin は ASSUMPTION |

```toml
# crates/interface-cli/Cargo.toml
[dependencies]
clap = { version = "=4.5.50", default-features = false, features = [
  "derive", "std", "help", "usage", "error-context", "suggestions"
] }
reqwest = { version = "=0.12.24", default-features = false, features = [
  "json", "rustls-tls", "stream"
] }
tonic = { version = "=0.14.2", default-features = false, features = [
  "transport", "codegen", "tls-ring", "tls-webpki-roots"
] }
tokio = { version = "=1.48.0", default-features = false, features = [
  "rt-multi-thread", "macros", "sync", "time", "signal", "io-util", "io-std"
] }
rpassword = "=7.4.0"
zeroize = "=1.8.2"
serde = { version = "=1.0.228", features = ["derive"] }
serde_json = "=1.0.145"
```

### 5.2 Skeleton

```rust
// target: crates/interface-cli/src/commands/generated.rs
// NOT-COMPILED. Adapter DTOs only.
use clap::{Parser, Subcommand, Args, ValueEnum};
use std::path::PathBuf;

#[derive(Clone, ValueEnum)]
pub enum Mode { Local, Rest, Grpc }

#[derive(Parser)]
#[command(name="app", disable_help_subcommand=true)]
pub struct Cli {
    #[arg(long, value_enum, default_value="rest")]
    pub mode: Mode,
    #[arg(long, conflicts_with="jsonl")]
    pub json: bool,
    #[arg(long, conflicts_with="json")]
    pub jsonl: bool,
    #[arg(long, conflicts_with_all=["credential_stdin", "credential_tty"])]
    pub credential_file: Option<PathBuf>,
    #[arg(long, conflicts_with_all=["credential_file", "credential_tty"])]
    pub credential_stdin: bool,
    #[arg(long, conflicts_with_all=["credential_file", "credential_stdin"])]
    pub credential_tty: bool,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command { Inspect(InspectArgs) }

#[derive(Args)]
pub struct InspectArgs {
    #[arg(long)]
    pub resource_id: String,
}

// target: crates/interface-cli/src/api/mod.rs
use std::{ffi::OsString, process::ExitCode};
use clap::Parser;
use crate::commands::generated::{Cli, Command, Mode};
use crate::cli_support::OutputMode;

pub fn run() -> ExitCode {
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(v) => v,
        Err(_) => return ExitCode::from(7),
    };
    runtime.block_on(run_from(std::env::args_os()))
}

pub async fn run_from(
    args: impl IntoIterator<Item=OsString>,
) -> ExitCode {
    let cli = match Cli::try_parse_from(args) {
        Ok(v) => v,
        Err(e) => {
            let code = if e.use_stderr() { 2 } else { 0 };
            let _ = e.print();
            return ExitCode::from(code);
        }
    };
    let output = if cli.json { OutputMode::Json }
        else if cli.jsonl { OutputMode::JsonLines }
        else { OutputMode::Human };

    let secret = match crate::cli_support::credential(&cli).await {
        Ok(v) => v,
        Err(e) => return crate::cli_support::report(e, 2),
    };
    let (operation, request) = match &cli.command {
        Command::Inspect(v) => (
            "resource.inspect",
            serde_json::json!({"resource_id":v.resource_id}),
        ),
    };
    let wire = crate::cli_support::wire();
    let result = match cli.mode {
        Mode::Local => crate::cli_support::local_verified(
            &secret, operation, wire, request,
        ).await,
        Mode::Rest => crate::cli_support::rest_client(
            &secret, operation, wire, request,
        ).await,
        Mode::Grpc => crate::cli_support::grpc_client(
            &secret, operation, wire, request,
        ).await,
    };
    crate::cli_support::write_and_exit(result, output)
}
```

### 5.3 API / Wiring / secret handling

| API | 用途 |
|---|---|
| `Parser`, `Subcommand`, `Args`, `ValueEnum` | generated command DTO |
| `try_parse_from` | early process exit を避ける fallible parse |
| `Error::use_stderr`, `print` | help/version と parse error の分離 |
| `reqwest::Client` | once-built REST client |
| generated tonic client | gRPC remote mode |
| `rpassword::prompt_password` | TTY secret |
| `Zeroizing<String>` | secret buffer |

選定 patch の完全 generic bounds は `VERIFY-AT-IMPL`。

- Local: `LocalCredentialVerifier` → `LocalIdentityIssuer` → verified identity → `execute_verified`。
- REST/gRPC: service access token を transport auth に付与。local credential と同一視しない。
- secret file: open → 同 handle の metadata → owner/mode/type/size → read。
- Unix 初期 policy: current UID、regular file、0400/0600。symlink policy は OS-specific open に実装。
- Windows ACL helper 未実装時は file source を拒否し、stdin/TTY を使う。
- stdin は operation input と credential の二重読取りを禁止。
- TTY read は blocking worker に隔離。
- JSON unary は一 object + LF。JSONL stream は item ごと一 object + LF。
- progress/diagnostic は stderr。
- SIGINT は dispatcher cancellation 後 130。

| Code | Meaning |
|---:|---|
| 0 | success / normal EOF |
| 2 | argument / configuration |
| 3 | authentication / authorization |
| 4 | target / state / conflict |
| 5 | network / external |
| 6 | timeout / cancellation |
| 7 | internal |
| 8 | capacity / unsupported |
| 130 | SIGINT |

### 5.4 Forbidden / Detector / Test / Rules

禁止: operation type の clap attributes、operation crate の arg parsing、argv credential contents、stdout progress、自動 mode fallback。

Detector:

```text
operation role:
  dependency clap
  #[arg(...)] / #[command(...)]
  derive(Parser|Subcommand|Args)

CLI command tree:
  value-taking token/password/secret option
  credential-file/stdin/tty 以外の credential option

CLI source:
  output module 外の println!
  normal path の process::exit
```

Tests: `cli_tree_dispatch`、`cli_stdout_stderr`、`cli_json_jsonl`、`cli_exit_table`、`cli_secret_sources`、`cli_argv_secret_reject`、`cli_sigint`。

```sh
cargo +1.95 test --locked -p interface-cli \
  --test contract cli_exit_table -- --exact
```

| Proposal key | MUST 本文 | Verification |
|---|---|---|
| `CLI-IMPL-001` | clap parsing types MUST be generated inside the CLI adapter and MUST NOT annotate operation-domain types. | graph/AST |
| `CLI-IMPL-002` | The CLI MUST reject argv credential contents and MUST read secrets only from approved file, stdin, or TTY sources. | process/permission |
| `CLI-IMPL-003` | The CLI MUST reserve stdout for results and MUST use the declared exit-code table for every termination path. | subprocess |

Risk: local identity API、signal race、Windows ACL。これらは `cli_support` に限定する。

## 6. Implementation Packet — gRPC

### 6.1 Decision / Cargo

| 項目 | 決定 |
|---|---|
| 推奨 | tonic/tonic-prost/build `0.14.2`、prost/types `0.14.1` |
| pattern | generated trait implementation + synchronous auth interceptor |
| factory | test wrapper `service(Arc<Bridge>) -> Router`、production は configured builder を注入 |
| fallback | tonic 系 patch を揃え、builder の prost requirement に統一 |
| confidence | tonic feature: high。版組合せ・stream helper: medium |

tonic `0.14.2` は `transport`、`codegen`、`router`、`tls-ring` を説明する。`router` は default 無効化時に明示する。 [docs](https://docs.rs/tonic/0.14.2/tonic/)

```toml
# crates/interface-grpc/Cargo.toml
[dependencies]
tonic = { version = "=0.14.2", default-features = false, features = [
  "transport", "codegen", "router", "tls-ring"
] }
prost = { version = "=0.14.1", default-features = false, features = [
  "derive", "std"
] }
prost-types = "=0.14.1"
tonic-prost = { version = "=0.14.2", default-features = false }
tokio = { version = "=1.48.0", default-features = false, features = [
  "rt-multi-thread", "macros", "sync", "time", "net"
] }
futures-util = { version = "=0.3.31", default-features = false, features = [
  "std", "async-await"
] }
tokio-stream = { version = "=0.1.17", features = ["net"] }
serde_json = "=1.0.145"

[build-dependencies]
tonic-prost-build = { version = "=0.14.2", default-features = true }
```

### 6.2 Skeleton

```rust
// target: crates/interface-grpc/build.rs
// NOT-COMPILED. CI installs/pins protoc.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/adapter.proto");
    tonic_prost_build::configure()
        .compile_protos(&["proto/adapter.proto"], &["proto"])?;
    Ok(())
}

// target: crates/interface-grpc/src/service/mod.rs
use std::{pin::Pin, sync::Arc};
use futures_util::Stream;
use tonic::{Request, Response, Status, Streaming};
use crate::bridge::Bridge;

pub mod pb { tonic::include_proto!("adapter.v1"); }
use pb::{Frame, operation_server::Operation};
type Out = Pin<Box<
    dyn Stream<Item=Result<Frame, Status>> + Send + 'static
>>;

#[derive(Clone)]
pub struct Service { pub bridge: Arc<Bridge> }

#[tonic::async_trait]
impl Operation for Service {
    async fn unary(
        &self, request: Request<Frame>,
    ) -> Result<Response<Frame>, Status> {
        let call = crate::grpc_compat::bound(&request)?;
        let input = crate::grpc_compat::decode(request.into_inner())?;
        let reply = self.bridge.verified(
            call.identity, &input.operation, call.wire, input.request,
        ).await;
        crate::grpc_compat::unary_response(reply)
    }

    type ServerStreamStream = Out;
    async fn server_stream(
        &self, request: Request<Frame>,
    ) -> Result<Response<Out>, Status> {
        let call = crate::grpc_compat::bound(&request)?;
        let input = crate::grpc_compat::decode(request.into_inner())?;
        let handle = self.bridge.server_stream(
            call.identity, &input.operation, call.wire, input.request,
        ).await.map_err(crate::grpc_compat::status)?;
        Ok(Response::new(crate::grpc_compat::outbound(handle)))
    }

    async fn client_stream(
        &self, request: Request<Streaming<Frame>>,
    ) -> Result<Response<Frame>, Status> {
        let call = crate::grpc_compat::bound(&request)?;
        crate::grpc_compat::client_stream(
            self.bridge.clone(), call, request.into_inner(),
        ).await
    }

    type BidiStream = Out;
    async fn bidi(
        &self, request: Request<Streaming<Frame>>,
    ) -> Result<Response<Out>, Status> {
        let call = crate::grpc_compat::bound(&request)?;
        crate::grpc_compat::bidi(
            self.bridge.clone(), call, request.into_inner(),
        ).await
    }
}

// target: crates/interface-grpc/src/auth/mod.rs
use std::sync::Arc;
use tonic::{Request, Status, service::Interceptor};
use crate::bridge::{Bridge, BoundCall};

#[derive(Clone)]
pub struct Auth(pub Arc<Bridge>);

impl Interceptor for Auth {
    fn call(&mut self, mut req: Request<()>) -> Result<Request<()>, Status> {
        let token = crate::grpc_compat::bearer(req.metadata())?;
        let identity = self.0.verify_bearer(token)
            .map_err(|_| Status::unauthenticated("invalid credential"))?;
        let wire = crate::grpc_compat::wire(req.metadata())?;
        req.extensions_mut().insert(BoundCall { identity, wire });
        Ok(req)
    }
}
```

Build helper の `configure().compile_protos(...)` は公式 0.14 系の例にある。選定 patch の再確認は `VERIFY-AT-IMPL`。 [docs](https://docs.rs/tonic-build/0.14.0/x86_64-apple-darwin/tonic_build/)

```proto
// crates/interface-grpc/proto/adapter.proto
syntax = "proto3";
package adapter.v1;

message Frame {
  string operation = 1;
  bytes json = 2;
  string request_id = 3;
  string stream_kind = 4;
}
service Operation {
  rpc Unary(Frame) returns (Frame);
  rpc ServerStream(Frame) returns (stream Frame);
  rpc ClientStream(stream Frame) returns (Frame);
  rpc Bidi(stream Frame) returns (stream Frame);
}
```

ASSUMPTION: generic Frame は scaffold 用。既存仕様が operation-specific typed protobuf を要求する場合は、その生成物に置換する。既存 typed rule を generic proto で上書きしない。

### 6.3 Factory / Wiring / streams

```rust
// crates/interface-grpc/src/api/mod.rs
// NOT-COMPILED.
use std::sync::Arc;
use crate::{bridge::Bridge, auth::Auth, service::{Service, pb}};
use tonic::transport::{Server, server::Router};

pub fn service_on(mut builder: Server, bridge: Arc<Bridge>) -> Router {
    builder.add_service(
        pb::operation_server::OperationServer::with_interceptor(
            Service { bridge: bridge.clone() }, Auth(bridge),
        )
        .max_decoding_message_size(1_048_576)
        .max_encoding_message_size(1_048_576),
    )
}

// Loopback/test convenience only.
pub fn service(bridge: Arc<Bridge>) -> Router {
    service_on(Server::builder(), bridge)
}
```

| 項目 | 決定 |
|---|---|
| auth | metadata 単一値 → bearer parse → synchronous verifier → audience → extensions |
| identity | adapter で構築禁止 |
| unary | `execute_verified` |
| server stream | `execute_server_stream_verified` |
| client stream | first frame で operation open → `execute_client_stream_verified` → bounded pump |
| bidi | `execute_bidi_verified` → input/output independent half-close |
| deadline | transport deadline と application deadline の早い方を `WireContext` に反映 |
| cancellation | outbound stream の drop guard と input transport error を dispatcher cancel に接続 |
| TLS | production composition が TLS-configured `Server` を `service_on` に渡す |

Metadata の deadline visibility、generated stream alias、`Status::with_details` は `VERIFY-AT-IMPL`。

提案 category map:

| Category | gRPC |
|---|---|
| validation | `INVALID_ARGUMENT` |
| authn / authz | `UNAUTHENTICATED` / `PERMISSION_DENIED` |
| missing | `NOT_FOUND` |
| conflict / precondition | `ABORTED` / `FAILED_PRECONDITION` |
| capacity / unsupported | `RESOURCE_EXHAUSTED` / `UNIMPLEMENTED` |
| timeout / cancel | `DEADLINE_EXCEEDED` / `CANCELLED` |
| external / internal | `UNAVAILABLE` / `INTERNAL` |

既存 error category の意味は変更しない。`google.rpc.Status` は proto から生成し、redacted public details だけを pack。外側 tonic code と details 内 code の一致を test。

### 6.4 Forbidden / Detector / Test / Rules

禁止: core/operation の protobuf types、manual HTTP/2、service 内 business logic、whole-stream collect、内部 error の無加工 Status message。

Tests:

```text
grpc_proto_regen
grpc_auth_status
grpc_unary
grpc_server_stream
grpc_client_stream
grpc_bidi
grpc_deadline_cancel
grpc_tls
```

```sh
cargo +1.95 test --locked -p interface-grpc \
  --test contract grpc_bidi -- --exact
```

| Proposal key | MUST 本文 | Verification |
|---|---|---|
| `GRPC-IMPL-001` | gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts. | proto/graph |
| `GRPC-IMPL-002` | Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method. | four-shape tests |
| `GRPC-IMPL-003` | Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping. | TLS/status |

Risk: generated method names、deadline extraction、TLS builder composition、prost patch alignment。

## 7. Cross-cutting — Version matrix / Shared seams

### 7.1 Workspace baseline

| 用途 | 推奨 pin | confidence |
|---|---|---|
| HTTP/WS | axum `0.8.9` | high: documented core API |
| middleware | tower `0.5.3`、tower-http `0.6.6` | medium: ASSUMPTION |
| OpenAPI | utoipa `5.4.0`、Swagger UI `9.0.2` | high: selected API/features、medium: graph |
| runtime | Tokio `1.48.0` | medium: ASSUMPTION |
| streams | futures-util `0.3.31`、tokio-stream `0.1.17` | medium: ASSUMPTION |
| CLI | clap `4.5.50`、reqwest `0.12.24` | medium: ASSUMPTION |
| gRPC | tonic family `0.14.2`、prost family `0.14.1` | medium |
| MCP | rmcp `0.8.5` | high: selected API/features |
| A2A | model `0.4.2`、server `0.4.3` | low: pair |
| DTO | serde `1.0.228`、serde_json `1.0.145` | medium: ASSUMPTION |
| secret helpers | rpassword `7.4.0`、zeroize `1.8.2` | low: ASSUMPTION |

Workspace policy:

```toml
# Cargo.toml
[workspace]
resolver = "2"

[workspace.package]
edition = "2021"
rust-version = "1.95"
```

Packet の pin を root `[workspace.dependencies]` に集約する。member は `workspace = true` と member-specific features を使う。root requirement と resolved version の両方を検査する。

A2A default features は明示例外。metadata を取得して不要機能を削除する。default 無効化だけを目的として未確認 feature 名を作らない。

### 7.2 Shared bridge の実装核

```rust
// crates/adapter-support/src/bridge.rs
// NOT-COMPILED. project module re-exports the actual contract crate.
use std::sync::Arc;
use serde_json::Value;
use crate::project::{
    Dispatcher, AccessTokenVerifier, VerifiedIdentity,
    Audience, InterfaceId, OperationId, WireContext,
    SemanticReply, OperationResultBody, PeerInfo, AuthenticationError,
};

#[derive(Clone)]
pub struct BoundCall {
    pub identity: Arc<VerifiedIdentity>,
    pub wire: WireContext,
}

pub trait Codec: Send + Sync {
    fn operation(&self, name: &str) -> OperationId;
    fn reply(&self, body: OperationResultBody) -> SemanticReply;
}

pub struct Bridge {
    pub dispatcher: Arc<Dispatcher>,
    pub verifier: Arc<dyn AccessTokenVerifier>,
    pub codec: Arc<dyn Codec>,
    pub interface: InterfaceId,
    pub audience: Audience,
}

impl Bridge {
    pub fn verify_bearer(
        &self, token: &str,
    ) -> Result<Arc<VerifiedIdentity>, AuthenticationError> {
        self.verifier.verify(token, &self.audience)
    }

    pub async fn verified(
        &self, identity: Arc<VerifiedIdentity>, name: &str,
        wire: WireContext, request: Value,
    ) -> SemanticReply {
        let body = self.dispatcher.execute_verified(
            identity, self.interface.clone(), self.audience.clone(),
            self.codec.operation(name), wire, request,
        ).await;
        self.codec.reply(body)
    }

    pub async fn anonymous(
        &self, name: &str, wire: WireContext,
        request: Value, peer: PeerInfo,
    ) -> SemanticReply {
        let body = self.dispatcher.execute_anonymous(
            self.interface.clone(), self.audience.clone(),
            self.codec.operation(name), wire, request, peer,
        ).await;
        self.codec.reply(body)
    }
}
```

ASSUMPTION: identifiers と `WireContext` に Clone を付与できる。不可なら借用 ID または明示再構築に置換する。

`Codec` は実際の `OperationResultBody` fields に依存する変換を吸収する。提示されていない fields を adapter ごとに推測しない。

| Bridge/helper | 実装 |
|---|---|
| `server_stream` | `execute_server_stream_verified` に直接 forwarding |
| `client_stream` | `execute_client_stream_verified` に直接 forwarding |
| `bidi` | `execute_bidi_verified` に直接 forwarding |
| anonymous stream variants | 対応する anonymous method、必ず `PeerInfo` |
| `http_wire` | request_id/deadline/idempotency/trace の共有 parser |
| `http_identity` | Authorization 重複検査、Bearer parse、同期 verifier |
| `task_owner` | verified identity の subject/tenant accessor |
| `operation_for_skill` | generated finite mapping |
| `render` | category/status、SemanticReply JSON、request_id header |
| `outbound` | stream polling、redacted error、cancel-on-drop |

`execute_with_credential` は dispatcher に verification を委ねる facade のみで使う。auth layer が既に verification 済みなら `execute_verified` を使い、二重 verify しない。

### 7.3 WireContext / request_id / errors

- 外部 request_id を検査し、未指定なら生成して `Some`。
- `SemanticReply.request_id` を response の authoritative ID とする。
- JSON-RPC ID、A2A task ID、SSE event ID、WS correlation ID は別 namespace。
- deadline は transport/application の早い方。
- idempotency key は transport header/metadata と operation policy を接続。
- error category は shared pure mapping。message text から分類しない。
- 内部 error chain は request_id 付き log、wire は redacted detail。
- DTO validation と OpenAPI/MCP schema は同じ manifest から生成。

### 7.4 初期 config defaults

全値は ASSUMPTION。既存 behavior 値があれば既存値を優先し conflict record を残す。

| Config | 初期値 |
|---|---:|
| body/message limit | 1 MiB |
| WS outbound queue | 64 |
| WS per-resource queue | 32 |
| WS resource count | 128 |
| WS dispatch concurrency | 16 |
| WS heartbeat / pong deadline | 20s / 40s |
| socket write / close timeout | 5s / 2s |
| MCP standard profile | L1 SSE + separate JSON mount |
| A2A live queue | 64 |
| task lease / renewal | 30s / 10s |
| event retention | 24h |
| secret max size | 16 KiB |
| remote connect / unary timeout | 5s / 30s |

## 8. Cross-cutting — Enforcement

### 8.1 cargo metadata 条件

添付 `implementation-policy.json` は baseline pin、features、defaults、dependency kind を保持する。resolved feature closure は初回 review 前なので未確定としており、その状態では gate を通さない。

| 検査 | 条件 |
|---|---|
| package | role map が一つの workspace member を解決 |
| pin | manifest requirement が `=x.y.z` |
| identity | package 名、alias、resolved version、source |
| kind | normal/build/dev を区別 |
| feature declaration | required feature が宣言されている |
| resolved features | required を包含し、承認済み profile union を超えない |
| source | approved registry、承認済み internal path |
| required edge | adapter → dispatcher/identity contract |
| forbidden edge | adapter → operation implementation/business storage |
| core boundary | core/operation → protocol SDK を拒否 |
| failure | missing/ambiguous node、parse error、tool failure を拒否 |

`cargo tree -e features` は review evidence。判定は structured metadata と profile-specific build。

必要 profile:

```text
rest
ws
cli-local
cli-rest
cli-grpc
grpc-server
mcp-l1-json
mcp-l1-sse
mcp-l2
a2a
```

`--all-features` 一回だけで各 deployment profile を代用しない。

### 8.2 Source detector

```js
// New detector definitions. Scope selection precedes matching.
export const candidates = {
  ws_unbounded:
    /\b(?:unbounded_channel|UnboundedSender|blocking_send)\b/g,
  cli_domain_attrs:
    /#\[(?:arg|command)\b|derive\([^\n]*(?:Parser|Subcommand|Args)/g,
  direct_identity:
    /VerifiedIdentity\s*\{|VerifiedIdentity::(?:new|default)\s*\(/g,
  mcp_manual_rpc:
    /["']jsonrpc["']\s*:/g,
  stream_buffering:
    /(?:try_)?collect\s*(?:::<[^\n]*Vec|\()/g,
  local_authority:
    /\b(?:HashMap|DashMap|InMemoryTaskStore|LocalSessionManager)\b/g,
};
```

実装方針:

1. role/path で scope を限定。
2. regex は候補抽出。
3. 生成 adapter は approved template からの再生成一致を authoritative check とする。
4. 非生成 shim は Rust AST と review。
5. runtime method probe で verifier/dispatcher/store の実通過を確認。
6. macro/alias を解決できない検査は silent pass せず review-required。

`HashMap` 一律禁止にはしない。禁止対象は authoritative session/task store。correlation map、DTO map、cache、test fixture は別扱い。

### 8.3 Scaffold files

| Role | Files |
|---|---|
| shared | `project.rs`, `bridge.rs`, `error_map.rs`, `wire.rs`, `cancel.rs` |
| MCP | `api/mod.rs`, `tools/generated.rs`, `mcp_compat.rs`, `session/external.rs` |
| A2A | `api/mod.rs`, `sdk_compat.rs`, `task/store.rs`, `events.rs`, `stream/mod.rs`, `card/generated.rs` |
| REST | `api/mod.rs`, `rest_compat.rs`, `openapi/generated.rs` |
| WS | `api/mod.rs`, `ws_engine.rs`, `frame/generated.rs` |
| CLI | `commands/generated.rs`, `api/mod.rs`, `cli_support.rs` |
| gRPC | `build.rs`, `proto/*`, `service/mod.rs`, `auth/mod.rs`, `grpc_compat.rs` |
| all adapters | `tests/contract.rs` |

各生成物に generator/input/template/output digest を記録。生成マーカーだけで合格にしない。template と policy の変更も protected review 対象。

### 8.4 Gate commands

以下の `implementation-check` は新設 command contract。既存 command の実在主張ではない。

```sh
# Bootstrap branch only; review and commit Cargo.lock afterward.
cargo +1.95 generate-lockfile

mkdir -p target/law
cargo +1.95 metadata --locked --format-version 1 \
  > target/law/metadata.json
cargo +1.95 tree --locked -e features \
  > target/law/features.txt

# Prototype metadata checker supplied with this packet.
node .claude/skills/rust-interface-law/scripts/lib/check-implementation-metadata.mjs \
  target/law/metadata.json contract/implementation-policy.json

# NEW skill command to implement.
node .claude/skills/rust-interface-law/dist/skill.mjs implementation-check \
  --profile RULES-PROFILE.toml \
  --map contract/workspace-map.toml \
  --policy contract/implementation-policy.json

cargo +1.95 check --locked --workspace --all-targets

# Test runner supplied with this packet.
node .claude/skills/rust-interface-law/scripts/lib/run-contract-tests.mjs \
  contract/implementation-tests.json
```

添付 test runner は `--list` で test の存在を検査してから exact execution する。0 tests、ignored test、missing target を成功にしない。

| Exit | Meaning |
|---:|---|
| 0 | selected checks succeeded |
| 10 | invalid input / role |
| 20 | dependency / features |
| 30 | source / scaffold |
| 40 | compile |
| 50 | method tests |
| 60 | supply-chain policy |
| 70 | attestation |
| 80 | tool / network failure |

既存 cargo-deny/vet/audit の pin/config は維持する。未検証 `deny.toml` を上書きしない。research 素材の完成と production admission を分離し、production gate は fail-closed。

## 9. Skill integration

下記関数名は追加する責務名。既存コードを読んだかのように line number や既存 signature を作らない。

| File | 改修関数・責務 | Test |
|---|---|---|
| `okf/source.md` | interface 規範と横断 enforcement の corpus 更新 | `source-implementation-roundtrip.test.mjs` |
| `source/skill-registry.toml` | packet/template/detector/profile/test source mapping | `registry-implementation-coverage.test.mjs` |
| `scripts/ingest.mjs` | `ingestImplementationRules()`、ID/hash/reference 整合 | `ingest-implementation-id.test.mjs` |
| `scripts/lib/closure.mjs` | `resolveImplementationRequirements()` | `closure-implementation.test.mjs` |
| `scripts/lib/gate.mjs` | `runImplementationGate()` | `gate-implementation-failclosed.test.mjs` |
| `scripts/lib/scaffold.mjs` | `emitImplementationPacket()`、`validateSdkBindings()` | `scaffold-six-adapters.test.mjs` |
| `scripts/lib/explain.mjs` | `explainImplementationDependency()` | `explain-sdk-dependency.test.mjs` |
| `scripts/lib/autoconfig.mjs` | `discoverInterfaceRoles()` | `autoconfig-adapter-role.test.mjs` |
| NEW `scripts/lib/implementation-contract.mjs` | dependency/source/template orchestration | `implementation-contract.test.mjs` |
| NEW `scripts/lib/check-implementation-metadata.mjs` | structured metadata checker | `implementation-metadata.test.mjs` |
| NEW `scripts/lib/run-contract-tests.mjs` | test existence/exact execution | `contract-test-driver.test.mjs` |
| CLI entry | `implementation-check` subcommand | `cli-implementation-command.test.mjs` |
| `dist/skill.mjs` | deterministic build で再生成 | `bundle-implementation-parity.test.mjs` |

### 9.1 既存採番を維持する方法

`MCP-IMPL-001` 等は proposal key。最終 registry ID を勝手にこの形式へ変更しない。既存 prefix の数値 ID を機械割当し、ledger に固定する。

```js
// NEW helper. Input is the existing canonical registry ID set.
export function allocateRuleId(existingIds, prefix) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const numbers = [...existingIds].flatMap(id => {
    const m = re.exec(id);
    return m ? [Number(m [docs](https://docs.rs/rmcp/0.8.5/rmcp/))] : [];
  });
  let n = Math.max(0, ...numbers) + 1;
  while (existingIds.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
```

`source/implementation-rule-ids.json` に proposal key → allocated ID を保存。再実行時は再利用し、並行変更衝突を拒否する。

横断 enforcement だけを `IMP-*` に置く。interface-specific rule は `REST-`、`WS-`、`CLI-`、`GRPC-`、`MCP-`、`A2A-` を維持。

### 9.2 OKF integration

- `type`、`phase`、`delivery` は提示された観測値を使う。
- MCP の新 atom は `Rule` / `adapter` / `must` / `mcp`。
- 他界面の `applies_to` は既存 atom を ingest して再利用。
- 新 enum を類推しない。
- `content_sha256` は実本文から算出。
- `requires` / `references` は割当済み ID で閉包検査。
- atom を直接手修正せず source → ingest → lock/coverage → bundle の既存経路を使う。

## 10. Spec integration / Conflicts

### 10.1 改修章

| File | 変更 |
|---|---|
| `30-REST.md` | Cargo、state factory、public/protected、layer order、renderer、OpenAPI equality |
| `31-WEBSOCKET.md` | ticket 対象 client、bounded queues/tasks、1013、half-close、cleanup |
| `32-CLI.md` | command DTO、local/remote、secret sources、stdio、固定 exit table |
| `33-GRPC.md` | build、generated traits、interceptor、four shapes、deadline/cancel、TLS builder |
| `34-MCP.md` | rmcp factory、tools、L1/L2、JSON/SSE profiles、progress/cancel |
| `35-A2A.md` | sdk_compat、TaskStore adapter、durable claims/events、shared send/stream |
| `15-RULE-REGISTRY.md` | 18 interface rules と横断 enforcement を allocator 経由登録 |
| `40-CONFORMANCE.md` | method proof、cross-instance、restart、replay、zero-test rejection |
| `50-PROJECT-TEMPLATE.md` | exact workspace pins、profiles、lockfile、template/compat files |
| `48-IMPLEMENTATION-BLUEPRINT.md` | generator→docgen→detector→compile→tests |
| `10-CONTRACTS.md` | adapter-support composition 責務の注記。既存 seam 本体は保持 |

### 10.2 Conflict records

| ID | Conflict | Resolution |
|---|---|---|
| `R003-C01` | 引数なし factory と state 注入 | 新 stateful factory を推奨。既存 wrapper は composition facade として保持 |
| `R003-C02` | SUSPECT SDK return types | 不存在断定をせず project Router factory へ移行 |
| `R003-C03` | no-session と resume | L1/L2 を分離。capability と test を対応 |
| `R003-C04` | MCP-15 adapter-owned state と external DB | ownership と物理配置を分離。business tables に入れない |
| `R003-C05` | load/save だけで restart/dedup | seam 維持、claim/event/CAS infrastructure を追加 |
| `R003-C06` | generic gRPC Frame と typed proto | typed rule 優先。generic は scaffold fixture |
| `R003-C07` | argv secret 禁止と local mode | argv は source selector。verifier/issuer が secret を処理 |
| `R003-C08` | stream disconnect と cancellation | operation/profile ごとに分離。A2A detach を即 cancel としない |
| `R003-C09` | proposal key と既存数値採番 | allocator ledger で append。既存 ID を再採番しない |

## 11. Test delivery / 実行範囲

添付 `implementation-tests.json` に 39 件の test 名と exact command を収録した。test 本体は未実装。初回 gate は missing test を拒否する設計。

| Driver | 対象 |
|---|---|
| in-process | REST route、auth order、schema equality、mapping |
| loopback protocol | WS upgrade、tonic four shapes、MCP wire behavior |
| subprocess | CLI exit/stdout/stderr/SIGINT |
| multi-instance | MCP/A2A affinity independence、resume、ownership |
| process kill/restart | durable recovery、dedup、claim expiry |
| actual ingress/TLS | proxy buffering、idle timeout、TLS boundary |
| actual filesystem/PTY | secret permission、TTY、stdin conflict |

Production store、restart、proxy、TLS、OS permission を純粋 in-process test だけで証明した扱いにしない。

人間 attestation は SDK shim signature review、business logic 非混入、tenant binding、TLS trust、retention/privacy、behavior 非衝突。`approval_ref` を要求する。未実行 compile を attestation で compile 成功へ置換しない。

## 12. Migration order

| 順序 | 作業 | 着手目安 |
|---:|---|---|
| 1 | role discovery、rule ledger、pins、Bridge/Codec、MCP/A2A compat files | 0–2h |
| 2 | MCP L1 tools/auth、JSON/SSE mounts、cancel/progress hooks | 2–5h |
| 3 | A2A shared executor、owner-bound store、claim/event schema、SDK handler | 5–8h |
| 4 | REST/WS templates、CLI DTO/secrets、gRPC build/four shapes | 8–11h |
| 5 | skill ingest/closure/scaffold/gate、spec/rule integration | 11–14h |
| 6 | cross-instance/restart/cancel の最小 test、残作業分割 | 14–16h |

ASSUMPTION: これは実装開始・最小経路の計画。production-grade durable replay、全 ingress、security review の完了を二日で保証する計画ではない。

## Ready to implement?

| Interface | 判定 | 最初に実装時確認する一項目 |
|---|---|---|
| MCP | WITH-ASSUMPTIONS | `0.8.5` の HTTP config field と sessionless JSON/SSE policy |
| A2A | WITH-ASSUMPTIONS | server `0.4.3` の trait signatures と model dependency を `sdk_compat` に取り込む |
| REST | WITH-ASSUMPTIONS | SemanticReply の renderer/schema を実 project 型へ接続 |
| WebSocket | WITH-ASSUMPTIONS | ticket 対応 client と `WsEngine` の非blocking enqueue |
| CLI | WITH-ASSUMPTIONS | local verifier/issuer を `cli_support::local_verified` に接続 |
| gRPC | WITH-ASSUMPTIONS | 既存 typed proto から生成される四形の trait signature |

全六界面に推奨 pin、Cargo、skeleton、wiring、fallback、detector、test、規範行を提示した。着手時の不確実性は compat/support module に隔離し、SDK 調査と adapter 全体の改修を直列待ちにしない。
