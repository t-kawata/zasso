# 33 — gRPC Adapter

**Status:** Normative
**Version:** 0.3.2
**Parent:** `Part II`
**Contracts:** `Part III.2`, `Part III.4`

---

## 1. Purpose

`*-grpc` is a thin gRPC adapter. It generates the protobuf service from the
operation catalog, extracts metadata credentials, verifies them, converts
protobuf messages to operation requests, calls the dispatcher, and maps the
result and errors to gRPC statuses. Generated protobuf types never leave this
crate.

---

## 2. Dependencies

```toml
[dependencies]
tonic = { workspace = true, features = ["transport", "codegen"] }
prost = { workspace = true }
tonic-prost = { workspace = true }
tokio = { workspace = true, features = ["sync", "time"] }
serde_json = { workspace = true }
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }

[build-dependencies]
tonic-prost-build = { workspace = true }
```

---

## 3. Layout

```text
*-grpc/
├── Cargo.toml
├── build.rs                     # tonic-prost-build
├── proto/
│   └── <project>.v1.proto       # generated from the catalog, checked in
└── src/
    ├── lib.rs
    ├── api/
    │   └── mod.rs               # service(), GrpcState, GrpcConfig
    ├── generated/
    │   └── mod.rs               # include_proto!
    ├── service/
    │   ├── mod.rs
    │   ├── unary.rs             # generated per-operation methods
    │   └── stream.rs            # S/C/B methods
    ├── auth/
    │   ├── mod.rs
    │   └── metadata.rs          # Bearer extraction and verification layer
    ├── conversion/
    │   ├── mod.rs
    │   └── generated.rs         # proto <-> operation request/response
    ├── error/
    │   └── status.rs            # OperationError -> Status
    └── tests/
```

Generated files carry `// @generated`. `proto/<project>.v1.proto` is generated
and checked in so that field numbers are reviewed; it is not edited by hand.

---

## 4. Public API

```rust
pub struct GrpcState {
    pub dispatcher: std::sync::Arc<operation_contract::Dispatcher>,
    pub verifier: std::sync::Arc<dyn identity_core::AccessTokenVerifier>,
    pub config: GrpcConfig,
}

pub struct GrpcConfig {
    pub audience: identity_core::Audience,
    pub max_message_bytes: usize,       // default 1 MiB
    pub keepalive_interval: std::time::Duration,
    pub keepalive_timeout: std::time::Duration,
}

pub fn service(state: GrpcState) -> tonic::transport::server::Router;
```

The service is generated from the catalog. Every operation has one RPC. The
mode (`U`, `S`, `C`, `B`) is declared in the catalog and reflected in the proto.

---

## 5. Generated Proto

```proto
syntax = "proto3";
package <project>.v1;

service <Project>Service {
  rpc AccountAdd(AccountAddRequest) returns (AccountAddResponse);
  rpc AccountWatch(AccountWatchRequest) returns (stream AccountEvent);
  // one RPC per catalog operation
}

message Context {
  optional string request_id = 1;
  optional int64 deadline_unix_ns = 2;
  optional string idempotency_key = 3;
  optional string trace_id = 4;
}

message AccountAddRequest {
  Context context = 1;
  optional string name = 2;
  optional string email = 3;
}

message AccountAddResponse {
  string request_id = 1;
  string id = 2;
}
```

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-01 | The proto is generated from the catalog and checked in. | Generation and check-in. | Message fields. | V2 diff. |
| GRPC-02 | Field numbers are never reused. Removed numbers are `reserved`. | Reserved rule. | — | V2 schema check. |
| GRPC-03 | Scalars that need presence are declared `optional`. | Presence rule. | Field set. | V2 schema check. |
| GRPC-04 | `Context` uses the fixed field numbers from Part III.2 §8.1. | Field numbers. | — | V2 schema check. |
| GRPC-05 | Generated protobuf types do not appear in `*-core` or `*-operation`. | Import ban. | — | V2 scan. |
| GRPC-17 | Every reply message carries the operation's `request_id`. | Field. | — | V3 test. |
| GRPC-18 | Typed protobuf messages are the gRPC binding; the universal JSON-bytes envelope is not required. | Binding. | Message shape. | V3 contract test. |
| GRPC-19 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | Result authorization. | Store backend. | V3 test. |

---

## 6. Authentication

The adapter uses a tower layer or per-request extraction with this fixed order:

```text
read `authorization` metadata
  → require Bearer
  → verifier.verify(token, audience)
  → insert Arc<VerifiedIdentity> into request extensions
  → dispatch
```

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-06 | Credentials come from gRPC metadata, not from the message body. | Source. | Metadata key. | V3 test. |
| GRPC-07 | Missing, malformed, or wrong-audience tokens return `UNAUTHENTICATED`. | Mapping. | Detail text. | V3 test. |
| GRPC-08 | The adapter does not construct `VerifiedIdentity`. | Opaque type. | — | V1; V3 compile-fail. |
| GRPC-09 | The interceptor does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |

---

## 7. Error Mapping

| Operation category | gRPC status |
|---|---|
| `invalid_input`, `invalid_config` | `INVALID_ARGUMENT` |
| `unauthenticated` | `UNAUTHENTICATED` |
| `permission_denied` | `PERMISSION_DENIED` |
| `not_found` | `NOT_FOUND` |
| `already_exists` | `ALREADY_EXISTS` |
| `invalid_state` | `FAILED_PRECONDITION` |
| `conflict` | `ABORTED` |
| `resource_exhausted` | `RESOURCE_EXHAUSTED` |
| `unsupported` | `UNIMPLEMENTED` |
| `timeout` | `DEADLINE_EXCEEDED` |
| `cancelled` | `CANCELLED` |
| `unavailable` | `UNAVAILABLE` |
| `internal` | `INTERNAL` |

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-10 | Every category maps to the status above. | Table. | Detail payload. | V3 mapping test. |
| GRPC-11 | Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets. | Detail channel. | Encoding. | V3 redaction test. |

---

## 8. Deadlines, Streaming, and Limits

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-12 | The request deadline is propagated into `WireContext`. | Propagation. | — | V3 test. |
| GRPC-13 | `U` maps to unary; `S`, `C`, `B` map to the corresponding stream. | Mode mapping. | Stream internals. | V3 test. |
| GRPC-14 | Client cancellation cancels the operation when the operation supports it; otherwise the result is queryable by request ID. | Cancellation policy. | Per-operation support. | V3 test. |
| GRPC-15 | Message size and keepalive limits are configured. | Presence. | Values. | V3 load test. |
| GRPC-16 | Transport uses TLS outside loopback-only local mode. | TLS rule. | Certificate source. | V2 config check. |

---

## 9. Fixed and Open

| Fixed | Open |
|---|---|
| Crate layout, build script, service generation. | Message fields beyond the fixed envelope. |
| Proto field-number rules and `Context` numbers. | RPC names derived from operation IDs. |
| Metadata Bearer extraction and verification. | Interceptor implementation. |
| Status mapping table. | Error detail payload. |
| Mode mapping and deadline propagation. | Streaming buffer strategy. |
| Generated types do not leak. | Internal conversion helpers. |

---

## 10. Conformance Obligations

1. Every catalog operation has one RPC.
2. Proto field numbers are stable; removed numbers are reserved.
3. Missing/wrong-audience token returns `UNAUTHENTICATED`.
4. Every error category maps to the fixed status.
5. Deadline propagation.
6. Streaming modes match the catalog.
7. Generated types do not appear in core/operation.
8. No direct handler call; dispatcher only.
9. Audience isolation: a REST token is rejected.
10. `cargo test -p <project>-grpc` and `cargo clippy -p <project>-grpc -- -D
    warnings`.
11. The conformance report names `GRPC-01` through `GRPC-19`.

## 11. Implementation Contract

### 11.1 Cargo contract

`tonic = { version = "=0.14.2", features = ["transport", "codegen", "router", "tls-ring"] }`; `prost = { version = "=0.14.1", features = ["derive", "std"] }`; `tonic-prost = { version = "=0.14.2" }`; build `tonic-prost-build = { version = "=0.14.2" }`.

### 11.2 Required API sequence

build.rs proto generation -> generated trait implementation -> interceptor metadata auth -> dispatcher unary/stream method -> status mapping -> deadline/cancel propagation.

### 11.3 Forbidden patterns

protobuf types in core or operation contracts, manual HTTP/2, service business logic, whole-stream collect, unredacted status details.

### 11.4 Template

`templates/grpc/`.

### 11.5 Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| GRPC-20 | gRPC services MUST implement generated tonic traits and MUST keep protobuf types outside core and operation contracts. | Generation and boundary. | Message fields. | V2 graph; V3 service test. |
| GRPC-21 | Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method. | Four shapes. | Stream internals. | V3 four-shape tests. |
| GRPC-22 | Non-loopback gRPC exposure MUST use the declared TLS boundary and shared redacted status mapping. | TLS and details. | Certificate source. | V3 TLS/status test. |
