# 30 — REST Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-rest` is a thin HTTP adapter. It extracts the bearer token, verifies it,
converts the HTTP body to the operation request, calls the dispatcher, converts
the result, and maps errors to HTTP. It contains no business logic.

---

## 2. Dependencies

```toml
[dependencies]
axum = { workspace = true, features = ["json"] }
tower = { workspace = true }
tower-http = { workspace = true, features = ["cors", "trace"] }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
utoipa = { workspace = true }
utoipa-swagger-ui = { workspace = true, features = ["axum"] }
```

`*-rest` MUST NOT depend on `*-core`, `*-operation` internals, or another
interface crate. It depends on the contract crates and the dispatcher.

---

## 3. Layout

```text
*-rest/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # router, state, public re-exports
    ├── state.rs                # RestState, RestConfig
    ├── auth/
    │   ├── mod.rs
    │   └── bearer.rs           # Bearer extraction and middleware
    ├── routes/
    │   ├── mod.rs
    │   ├── public.rs           # /health, /auth/*
    │   └── protected.rs        # generated route registration
    ├── handlers/
    │   └── generated.rs        # generated per-operation handlers
    ├── schema/
    │   ├── mod.rs
    │   └── generated.rs        # generated REST request/response schemas
    ├── response/
    │   ├── mod.rs
    │   └── error.rs            # OperationError -> HTTP
    ├── openapi/
    │   └── generated.rs        # generated OpenApi document
    └── tests/
```

---

## 4. Public API

```rust
pub struct RestState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: RestConfig,
}

pub struct RestConfig {
    pub audience: identity_core::Audience,
    pub public_paths: Vec<&'static str>,
    pub cors_origins: Vec<String>,
    pub max_body_bytes: usize,
}

pub fn router(state: RestState) -> axum::Router;
```

`router` builds two routers and merges them:

- **Public router**: `/health` and operations whose catalog authentication is
  `anonymous` (`auth.token.issue`, `auth.refresh`). They still go through
  `Dispatcher::execute_anonymous`; a public route is not a dispatcher bypass.
- **Protected router**: every operation whose catalog authentication is
  `required`, wrapped with the bearer middleware. The middleware verifies the
  token and its binding, then the operation authorizes the target.

Every endpoint uses the semantic envelope `{context?, request}` and returns
`{request_id, result}` or `{request_id, error}`. Aliases are path/method sugar
over the same envelope; they do not use a different wire shape.

---

## 5. Generated Bindings

The generator emits one handler per operation. A generated handler has this
fixed shape:

```rust
async fn account_add(
    State(state): State<RestState>,
    Extension(identity): Extension<Arc<VerifiedIdentity>>,
    headers: axum::http::HeaderMap,
    Json(envelope): Json<SemanticRequest>,
) -> Result<Json<SemanticReply>, RestError> {
    let header_wire = WireContext::from_headers(&headers);
    let body_request_id = envelope.context.request_id;
    let wire = header_wire
        .merge(envelope.context)
        .map_err(|error| RestError::from_contract(error, body_request_id))?;
    let result = state
        .dispatcher
        .execute_verified(
            identity,
            INTERFACE_REST,
            state.config.audience,
            OperationId::new("account.add"),
            wire,
            envelope.request,
        )
        .await;
    Ok(Json(SemanticReply::from_result(result)))
}
```

The generator also emits:

- route registration in `routes/protected.rs`;
- `schema::<Operation>Request` / `Response` with `utoipa::ToSchema`;
- the OpenAPI path entry;
- a conformance matrix row.

Generated files carry `// @generated` and are not edited by hand.

---

## 6. HTTP Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| REST-01 | Credentials come only from `Authorization: Bearer`. | Header and scheme. | Token contents. | V3 test. |
| REST-02 | Tokens MUST NOT appear in query strings or paths. | Forbidden. | — | V3 test. |
| REST-03 | Public and protected routers are separate; protected routes use `route_layer`. | Structure. | Middleware implementation. | V3 test. |
| REST-04 | The audience is configured per router and passed to the verifier. | Audience parameter. | Value. | V3 audience test. |
| REST-05 | All REST success replies use 200 with the semantic envelope. 201, 202, and 204 are not used; aliases use 200. | Status rule. | — | V3 contract test. |
| REST-06 | Error mapping uses the fixed category table from `Part III.2` §5.8. | Category table. | Error codes. | V3 mapping test. |
| REST-07 | 401 responses include `WWW-Authenticate: Bearer`. | Header. | — | V3 test. |
| REST-08 | Mutating requests accept `Idempotency-Key` and pass it in `WireContext`. | Header name. | — | V3 test. |
| REST-09 | List endpoints define `limit`, `offset`, and optional `cursor`. | Parameter names. | Ranges and defaults. | V3 schema test. |
| REST-10 | Request bodies are bounded by `max_body_bytes`. | Rejection. | Limit value. | V3 test. |
| REST-11 | CORS and Origin allowlists are configured; unspecified origins are denied. | Deny-by-default. | Allowed list. | V3 test. |
| REST-12 | The OpenAPI document lists exactly the routes the router serves. | Equality. | Descriptions and examples. | V2 diff; V3 test. |
| REST-13 | Aliases call the same operation; they do not contain logic. | Delegation. | Alias set. | V3 catalog test. |
| REST-14 | Binary and multipart endpoints declare their media types and size limits. | Declaration. | Media types. | V3 test. |
| REST-15 | Every endpoint uses the semantic envelope for requests and replies. | Envelope. | Payload schema. | V3 contract test. |
| REST-16 | Aliases use the same envelope; they do not introduce a second wire shape. | Equality. | Alias paths. | V3 contract test. |
| REST-17 | Anonymous operations use the public router and `execute_anonymous`; they are not a dispatcher bypass. | Path. | Anonymous operation set. | V3 bypass test. |
| REST-18 | The reply `request_id` is the operation's `request_id`, including on errors. | Field. | — | V3 test. |

---

## 7. Error Mapping

```rust
pub struct RestError {
    pub request_id: RequestId,
    pub error: OperationErrorBody,
}

impl RestError {
    /// Adapter-level failure before dispatch. Uses the supplied request ID,
    /// or generates one when the request did not carry one.
    pub fn from_contract(error: ContractError, request_id: Option<RequestId>) -> Self;
}
```

`RestError` implements `IntoResponse`. It is used for pre-dispatch adapter
failures (malformed body, context conflict, missing or malformed bearer
header). Operation failures are returned as
`SemanticReply { request_id, error }`; they are not converted to `RestError`.

For adapter-level errors, `RestError` writes the same semantic error shape and
uses a generated request ID when the request did not carry one.

```json
{
  "request_id": "0190f3c2-...",
  "error": {
    "code": "invalid_input",
    "domain": "account",
    "retryable": false,
    "details": {}
  }
}
```

The body never contains a token, a password, a provider response, or a stack
trace.

---

## 8. OpenAPI

- `openapi/generated.rs` derives `utoipa::OpenApi`.
- Every operation path and schema is generated from the catalog.
- Security scheme: `Bearer` (`bearerFormat = "JWT"`).
- Swagger UI is mounted at `/swagger-ui`; the JSON is at
  `/api-docs/openapi.json`.
- The document is part of the conformance check: a route that is not documented,
  or a documented route that is not served, is a failure.

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, state, router split, middleware placement. | Middleware internals, extractor helpers. |
| Bearer-only authentication. | Token acquisition flow. |
| Status and error category tables. | Error codes within categories. |
| Idempotency header name and wire context. | Idempotency store implementation. |
| Pagination parameter names. | Page size limits and filters. |
| OpenAPI generation obligation. | Descriptions, examples, tags. |
| Aliases delegate to operations. | Alias paths. |

---

## 10. Conformance Obligations

1. Every documented route is served, and every served operation is documented.
2. Bearer-only enforcement; query/path tokens rejected.
3. Audience isolation: a token for another interface is rejected.
4. Error mapping matches the category table for every code.
5. Idempotency key is propagated.
6. CORS/Origin denial for unlisted origins.
7. No business logic: import scan and review.
8. `cargo test -p <project>-rest` and `cargo clippy -p <project>-rest -- -D
   warnings`.
9. The conformance report names `REST-01` through `REST-18`.
