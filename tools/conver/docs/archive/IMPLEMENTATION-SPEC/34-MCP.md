# 34 — MCP Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-mcp` exposes operations as MCP tools. It owns the MCP protocol surface,
including the authorization discovery and challenge required by the adopted MCP
specification. It does not implement business logic and does not forward a
received token to another API.

---

## 2. Dependencies

```toml
[dependencies]
rmcp = { workspace = true }
tokio = { workspace = true }
serde = { workspace = true, features = ["derive"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }
```

`*-mcp` MUST NOT depend on `*-rest`, `*-grpc`, or another interface crate.

---

## 3. Layout

```text
*-mcp/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs              # server(), McpState, McpConfig
    ├── tools/
    │   ├── mod.rs
    │   └── generated.rs        # one tool per applicable operation
    ├── auth/
    │   ├── mod.rs
    │   ├── discovery.rs        # authorization server metadata
    │   └── challenge.rs        # WWW-Authenticate / resource metadata
    ├── schema/
    │   └── generated.rs        # tool input/output schemas
    ├── error/
    │   └── mapping.rs          # OperationError -> MCP error
    └── tests/
```

---

## 4. Public API

```rust
pub struct McpState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: McpConfig,
}

pub struct McpConfig {
    pub audience: identity_core::Audience,
    pub resource_metadata_url: String,
    pub authorization_server: String,
    pub tool_prefix: Option<&'static str>,
    pub protocol_version: &'static str,
    pub transport_profile: &'static str,
    pub capabilities: Vec<&'static str>,
}

pub fn server(state: McpState) -> rmcp::Server;
```

---

## 5. Tool Mapping

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-01 | Every applicable catalog operation has one MCP tool. | Mapping rule. | Applicable subset. | V3 catalog test. |
| MCP-02 | The tool name is `operation_id` with `.` replaced by `_`, optionally prefixed. | Name algorithm. | Prefix. | V3 test. |
| MCP-03 | The tool input schema is generated from the operation request. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-04 | The tool output schema is generated from the operation response. | Schema generation. | Descriptions. | V3 schema test. |
| MCP-05 | The tool handler converts input, calls the dispatcher, and maps the result. | Call path. | Conversion details. | V3 test. |
| MCP-06 | The tool handler contains no business logic. | Forbidden. | — | V2 scan; V4 review. |

A tool is applicable when the catalog marks it `mcp: true`. An operation marked
`mcp: false` must state a reason in the catalog.

---

## 6. Authorization

The adapter implements the authorization surface required by the adopted MCP
specification:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-07 | Authorization server metadata is exposed at the configured discovery endpoint. | Endpoint exists. | Metadata content. | V3 protocol test. |
| MCP-08 | Protected resource metadata identifies this MCP server as the audience. | Audience binding. | Metadata fields. | V3 test. |
| MCP-09 | Unauthenticated requests receive the spec-required challenge. | Challenge. | Realm text. | V3 test. |
| MCP-10 | Tokens are verified by the shared `AccessTokenVerifier` with the MCP audience. | Verification path. | — | V3 test. |
| MCP-11 | A received token MUST NOT be passed through to a downstream API. | Forbidden. | — | V2 scan; V3 test. |
| MCP-12 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |

---

## 7. Errors

| Operation category | MCP mapping |
|---|---|
| `invalid_input`, `invalid_config` | `InvalidParams` |
| `unauthenticated` | `Unauthorized` / spec challenge |
| `permission_denied` | `Forbidden` |
| `not_found` | `NotFound` |
| `already_exists`, `conflict`, `invalid_state` | `InvalidRequest` / conflict detail |
| `resource_exhausted` | `RateLimited` / capacity detail |
| `unsupported` | `MethodNotFound` / unsupported detail |
| `timeout`, `cancelled` | `Cancelled` / timeout detail |
| `unavailable` | `ServiceUnavailable` |
| `internal` | `InternalError` |

The exact JSON-RPC error code or MCP error variant is fixed by the adopted MCP
specification version. The adapter records that version in `McpConfig`.

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-13 | Every operation category has an MCP mapping. | Coverage. | Detail text. | V3 mapping test. |
| MCP-14 | Error details never contain tokens, secrets, or raw provider responses. | Forbidden. | — | V2 scan; V3 test. |

---

## 8. Session and State

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| MCP-15 | MCP session state lives in the adapter, not in business tables. | Boundary. | Session store. | V2 schema review. |
| MCP-16 | Business state is read and written only through operations. | Boundary. | — | V2 scan; V3 test. |
| MCP-17 | Resource and prompt surfaces that expose business data MUST read through a query operation; adapter-owned protocol metadata is the only exception. | Delegation. | Resource set. | V3 test. |
| MCP-18 | Protocol errors and business execution errors are mapped separately; a protocol failure is not reported as an operation error and vice versa. | Separation. | Detail. | V3 test. |
| MCP-19 | `McpConfig` records the adopted protocol version, transport profile, and capabilities. | Recorded. | Values. | V2 config check. |
| MCP-20 | The adapter authorizes MCP-protocol-owned resources (sessions, subscriptions) but never business resources. | Boundary. | Policy. | V3 bypass test. |
| MCP-21 | Every tool result carries the operation's `request_id` in a machine-readable field. | Field. | Placement. | V3 test. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, server entry point, tool mapping rule. | Applicable operation subset and tool descriptions. |
| Authorization discovery/challenge obligations. | Metadata fields and provider configuration. |
| Token audience and no-passthrough rule. | Token acquisition flow. |
| Error category coverage. | Detail payload. |
| Session/business state boundary. | Session storage. |
| No business logic. | Tool handler conversion details. |

---

## 10. Conformance Obligations

1. Every applicable operation has a tool; every tool maps to one operation.
2. Tool input/output schemas match the operation types.
3. Unauthenticated requests receive the spec-required challenge.
4. A token for another audience is rejected.
5. No token passthrough to a downstream API.
6. Every error category maps; no secrets in details.
7. No business state in MCP tables.
8. No direct handler call; dispatcher only.
9. `cargo test -p <project>-mcp` and `cargo clippy -p <project>-mcp -- -D
   warnings`.
10. The conformance report names `MCP-01` through `MCP-21`.
