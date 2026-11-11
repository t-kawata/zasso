# Implementation Rules for Multi-Interface Rust Systems

**Status:** Normative
**Version:** 0.3.2
**Applies to:** Rust projects that split a system into `*-core`, `*-operation`,
`*-conformance`, and interface crates (`*-rest`, `*-websocket`, `*-cli`,
`*-grpc`, `*-mcp`, `*-a2a`).
**Reference targets:** gaia, crystal, doors.

This document defines the rules. It does not define any single project's
operations; those belong in the project's own `SYSTEM-DESIGN.md`.

---

## 0. How to Read This Document

### 0.1 Keywords

| Keyword | Meaning |
|---|---|
| MUST / MUST NOT | Mandatory. A violation is a defect. |
| SHOULD / SHOULD NOT | Expected. A deviation requires a declared exception. |
| MAY | Optional. |

### 0.2 Rule format

Every rule has four parts:

1. **Fixed** — the seam or invariant the rule freezes. This is what makes
   implementations comparable across projects.
2. **Open** — what the rule deliberately leaves free. This is what prevents the
   rule from limiting what a project can build.
3. **Verification** — how compliance is proven. A rule without verification is
   not yet a rule.
4. **Exceptions** — none unless stated. An exception must be declared in the
   project's `RULES-PROFILE.toml` with a reason and an expiry.

A rule that cannot name its **Open** part is over-specified and must be
rewritten, unless it is a safety invariant with no permissible variation (for
example, "secrets MUST NOT appear in logs"). A rule that cannot name its
**Fixed** part is not a rule.

### 0.3 Precedence

When rules conflict, the higher row wins:

| Priority | Domain |
|---|---|
| 1 | Security and secret handling |
| 2 | Identity, authentication, authorization |
| 3 | Crate boundaries and dependency direction |
| 4 | Operation contract |
| 5 | Interface adapter behavior |
| 6 | Naming, layout, style |

A lower-priority rule never weakens a higher-priority rule.

### 0.4 Stable identifiers

Rule IDs are permanent. A removed rule keeps its ID and is marked `REMOVED`;
IDs are never reused. New rules receive new IDs.

### 0.5 Profiles

A project declares which profiles it implements:

```toml
# RULES-PROFILE.toml
[project]
name = "doors"
spec_version = "0.3.2"

[profiles]
rust = true
rest = true
websocket = true
cli = true
grpc = true
mcp = false
a2a = false

[auth]
jwt = true
sso = "disabled"   # disabled | planned | enabled
local_only = false
```

Profiles are booleans in `[profiles]`. An unimplemented interface is `false`,
not omitted. `sso = "planned"` is allowed only with a target in the project's
`SYSTEM-DESIGN.md`; it is not an implementation.

| Profile | Required |
|---|---|
| `rust` | Yes for every target of this document |
| `rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a` | Only when implemented |
| `auth-jwt` | Yes |
| `auth-sso` | When SSO is implemented |
| `local-only` | Only for single-process local tools; see AUTH-20 |

An unimplemented interface profile MUST be declared as absent. Silence is not
an absence.

### 0.6 Verification levels

| Level | Meaning |
|---|---|
| V1 | Compile-time or type-level proof |
| V2 | Static check (dependency graph, import scan, schema) |
| V3 | Automated test (unit, integration, conformance) |
| V4 | Review checklist |

A MUST rule requires V1, V2, or V3. V4 alone is not sufficient for a MUST rule.

### 0.7 Rule classes

Every rule belongs to exactly one class. The class states what the rule is
allowed to constrain.

| Class | Purpose | May constrain | Must not constrain |
|---|---|---|---|
| **C — Closed contract** | Freeze a seam that every project and interface must share. | Type shape, wire format, token validation order, error categories, dependency direction, authorization location. | The set of operations, scopes, error codes, features, algorithms, storage, or domain model. |
| **G — Generated** | Define mechanical output derived from the operation catalog. | File layout, adapter skeletons, route/CLI/proto bindings, conformance matrix rows. | Hand-written domain logic or extension behavior. |
| **O — Open extension** | Define how a project adds something new without changing the seams. | The extension trait, registration point, and conformance obligation. | Which operations, scopes, auth methods, interfaces, or storage a project may add. |
| **P — Proof** | Define how compliance is demonstrated. | Test harness shape, oracle obligations, negative cases. | Implementation strategy. |

A rule MUST NOT enumerate a closed set of features. It may only define the seam
through which features are added. For example:

- Correct: “Every operation implements `Operation` and appears in the catalog.”
  (open set of operations)
- Incorrect: “Only the following operations may exist.” (would limit what can be
  built)

The concrete contracts referenced by class C rules live in Part III. That part
fixes exact Rust types and traits; this document fixes the obligations.

### 0.8 Canonical rule registry

Part III.15 is the canonical registry. It records, for every rule ID:

- class (C/G/O/P);
- profile applicability;
- the normative statement;
- parent rule, when the rule details a higher-level rule;
- verification level and command.

Part II tables may omit the class column because the registry is authoritative.
A rule ID that appears in two documents with different obligations is a defect.
Detailed interface and conformance rules use the canonical IDs defined in
Part III.6–III.12; Part II does not duplicate them.

---

## 1. Definitions

| Term | Definition |
|---|---|
| **Operation** | A named business capability with a typed request and response. Example: `account.add`. |
| **OperationId** | A stable dotted identifier for an operation. |
| **Interface** | A transport boundary: REST, WebSocket, CLI, gRPC, MCP, A2A. |
| **Adapter** | The crate that implements one interface and calls operations. |
| **Assembly** | The binary or crate that wires configuration, adapters, operations, and authentication. |
| **SubjectId** | The internal, immutable identifier of an authenticated actor. |
| **VerifiedIdentity** | The only identity value an operation may receive. |
| **Scope** | A named permission. Necessary but never sufficient for authorization. |
| **Audience** | The interface or resource a token is issued for (`aud`). |
| **Conformance** | Executable proof that every interface produces the same operation behavior and authorization result. |
| **Operation catalog** | The project's list of operations, each with its contract and interface bindings. |

---

## 2. Invariants

These invariants hold for every project that adopts this document.

| ID | Invariant |
|---|---|
| INV-01 | One business implementation exists per operation. Interfaces do not reimplement it. |
| INV-02 | Every interface calls the same operation implementation. |
| INV-03 | Authentication happens once per request; authorization happens inside the operation. |
| INV-04 | `*-core` and `*-operation` contain no transport, JWT-library, or SSO-provider types. |
| INV-05 | SSO is added without changing business operations, `VerifiedIdentity`, or business tables. |
| INV-06 | Conformance tests, not documentation, prove compliance. |
| INV-07 | A token issued for one interface is not accepted by another. |
| INV-08 | No side effect occurs before authorization succeeds. |

---

## 3. Crate Architecture

### 3.1 Required crate roles

| Crate pattern | Role |
|---|---|
| `*-core` | Domain model, invariants, value objects, and ports (traits). |
| `*-operation` | Operation handlers, authorization, transactions, compensation, idempotency, event publication. |
| `*-conformance` | Operation oracles, cross-interface tests, negative tests, rule gates. |
| `*-rest` | HTTP input/output, credential extraction, operation invocation, HTTP error mapping. |
| `*-websocket` | WebSocket upgrade, connection auth state, message envelope, backpressure. |
| `*-cli` | Argument parsing, credential acquisition, operation invocation, output formatting. |
| `*-grpc` | Protobuf generation, metadata auth, operation invocation, gRPC status mapping. |
| `*-mcp` | MCP protocol handling, tool/resource mapping, operation invocation. |
| `*-a2a` | A2A protocol handling, task/message mapping, operation invocation. |
| `identity-core` | Subject identity, `VerifiedIdentity`, scopes, authentication and authorization contracts. |
| `identity-jwt` | JWT issuance and verification, key resolution. |
| `identity-local` | Initial login method (for example password credentials). |
| `identity-operation` | Login orchestration: credential result → subject resolution → token issuance. |
| `identity-sso` | Optional OIDC/SSO adapter. |
| `*-assembly` or the binary | Configuration, dependency injection, router/service composition. |
| `*-adapter-*` | External-system adapters (payment, identity proofing, transport). |

The table is a minimum role set, not a closed list. A project MAY add
`tooling`, `test-support`, `build-support`, or `utility` crates. It declares
their dependency edges in `RULES-PROFILE.toml`; the forbidden edges in ARC-02
through ARC-08 still apply. A test or benchmark crate is never a reason to
violate a runtime dependency rule.

### 3.2 Rules

| ID | Rule | Verification |
|---|---|---|
| ARC-01 | Each crate MUST have one primary runtime role from §3.1. Additional roles (`tooling`, `test-support`, `build-support`, `utility`) are allowed when declared in `RULES-PROFILE.toml` with their allowed dependency edges. A crate MUST NOT mix incompatible runtime roles. | V4 review; crate manifest and module layout. |
| ARC-02 | Dependencies MUST follow `interface-* → *-operation → *-core` and `interface-* → identity-core`. | V2 `cargo metadata` edge check. |
| ARC-03 | `*-core` and `*-operation` MUST NOT depend on `axum`, `tonic`, `rmcp`, `a2a-*`, `clap`, or any protocol SDK. | V2 dependency and import scan. |
| ARC-04 | An interface crate MUST NOT depend on another interface crate. | V2 `cargo metadata` edge check. |
| ARC-05 | `*-conformance` MAY depend on every public boundary; no runtime crate may depend on `*-conformance`. | V2 `cargo metadata` edge check. |
| ARC-06 | Only the assembly/binary MAY depend on concrete authentication implementations (`identity-jwt`, `identity-local`, `identity-sso`) and wire them together. | V2 dependency check. |
| ARC-07 | `*-core` MUST define ports (traits) for external effects; it MUST NOT call infrastructure directly. | V1/V3; review of public traits and tests with fakes. |
| ARC-08 | `*-operation` MUST depend on `identity-core` traits, never on `identity-jwt` or `identity-sso`. | V2 dependency check. |
| ARC-09 | Crate names MUST use the project prefix and the role suffix (`doors-core`, `doors-operation`, `doors-rest`, and so on). | V4 review; manifest check. |
| ARC-10 | Inside a crate, modules SHOULD follow `api/`, `model/`, `state/`, `error/`, `security/`, `config/`, `tests/`. | V4 review. |

**Rationale for ARC-02 and ARC-03.** The dependency direction is the
architecture. If an operation can see an HTTP request or a JWT, the same
operation cannot be called from CLI, gRPC, MCP, or A2A without leaking that
transport into the other interfaces. The boundary is therefore enforced at the
crate graph level, not by review alone.

---

## 4. Operation Contract

### 4.1 Operation catalog

Every project MUST maintain an operation catalog. Each entry MUST contain:

| Field | Content |
|---|---|
| `operation_id` | Stable dotted ID, for example `account.add`. |
| `types` | Typed `Request` and `Response`. |
| `scope` | `read`, `control`, `admin`, or a project-defined scope. Anonymous operations declare authentication separately. |
| `mode` | `U` unary, `S` server stream, `C` client stream, `B` bidirectional. |
| `preconditions` | Required state and authority. |
| `procedure` | Ordered steps, including authorization and reservation. |
| `failure` | Failure handling and compensation. |
| `postconditions` | Observable result and invariants. |
| `interfaces` | REST, WS, CLI, gRPC, MCP, A2A bindings. |
| `conformance` | Conformance test identifier. |

### 4.2 Envelope

| ID | Rule | Verification |
|---|---|---|
| OPS-01 | Every operation MUST have a stable `operation_id` and a typed request/response pair. | V1 types; V3 catalog test. |
| OPS-02 | The wire envelope MUST be `{context, request}` and the reply `{request_id, result}` or `{request_id, error}`. | V3 schema test. |
| OPS-03 | `context` MAY contain `request_id`, `deadline`, `idempotency_key`, and `trace_id`. It MUST NOT contain identity, tenant, role, scope, or lease. | V1 type; V3 rejection test. |
| OPS-04 | `request_id` MUST be generated when absent and MUST be stable across retries of the same logical request. | V3 test. |
| OPS-05 | The execution pipeline MUST follow this order: decode/size → authenticate or establish anonymity → authentication requirement → scope → deadline/admission → generated input validation → idempotency claim → replay branch (`replay_authorize` then stored result) or acquire branch (`prepare` then execute) → commit/outbox → result/reply. | V3 instrumented pipeline test. |
| OPS-06 | No side effect MAY occur before authorization succeeds. | V3 failure-injection test. |
| OPS-07 | Authorization MUST run inside the operation, not only in the adapter. | V3 bypass test. |
| OPS-08 | Tenant and ownership MUST be derived from `VerifiedIdentity` and the target resource, never from request-supplied IDs alone. | V3 cross-tenant test. |
| OPS-09 | Mutating operations MUST define idempotency semantics: same key + same canonical request reuses the result; same key + different request returns a conflict. | V3 test. |
| OPS-10 | Mutations that touch multiple resources MUST use a transaction or a compensating action. | V3 failure-injection test. |
| OPS-11 | Streaming operations MUST declare their mode and MUST define EOF, error, cancellation, and backpressure semantics. | V3 streaming test. |
| OPS-12 | One operation MUST have one handler. Adapter-specific branching inside the handler is forbidden. | V2 import/scan; V4 review. |
| OPS-13 | Operation inputs and outputs MUST be protocol-independent. Protobuf-generated types, HTTP types, and CLI types MUST NOT appear in `*-operation`. | V2 import scan. |
| OPS-14 | An operation MUST declare `AuthenticationRequirement::Required` or `AuthenticationRequirement::Anonymous`. Anonymous is not a scope, and `Option<Identity>` or an implicit anonymous path is forbidden. | V1 type; V3 test. |
| OPS-15 | Every operation MUST publish domain events only after commit. | V3 test. |
| OPS-16 | Every operation MUST have a conformance identifier and at least one oracle for normal and failure behavior. | V3 rule coverage. |
| OPS-17 | `ErasedPrepared` MUST be opaque: it preserves the authentication kind and operation mode, and is consumed only by the erased operation that produced it. | V1/V2 visibility; V3 test. |
| OPS-18 | The generated `ContractValidate::validate()` MUST run in the common dispatch path for every interface, before idempotency claim and business logic. | V3 test. |

**Rationale for OPS-05 and OPS-07.** Interfaces are replaceable; authorization
is not. If authorization lives only in the REST middleware, the CLI and MCP
paths become authorization bypasses. The operation is the only place every
interface must pass through.

---

## 5. Identity and Authentication

### 5.1 Identity model

| ID | Rule | Verification |
|---|---|---|
| ID-01 | `SubjectId` MUST be an internal, immutable identifier. Email addresses and external provider IDs MUST NOT be used as `sub`. | V1 newtype; V3 token test. |
| ID-02 | Operations MUST receive exactly one identity type: `VerifiedIdentity`. A duplicate `Principal` type is forbidden. | V2 type scan; V4 review. |
| ID-03 | `VerifiedIdentity` MUST be constructible only by the verifier. Fields MUST be private; the constructor MUST be `pub(crate)` or equivalent. | V1 visibility; V3 compile-fail test. |
| ID-04 | `VerifiedIdentity` MUST NOT implement `Deserialize` or any public constructor. | V1; V3 compile-fail test. |
| ID-05 | Delegated execution MUST distinguish the actor from the subject: `actor` and `on_behalf_of` MUST be separate fields. | V1 type; V3 test. |
| ID-06 | Operations MUST NOT receive a raw JWT, `iss`, external account ID, or provider name. | V2 import/type scan. |

### 5.2 Authentication contracts

| ID | Rule | Verification |
|---|---|---|
| AUTH-01 | Token verification MUST be expressed as a protocol-independent `AccessTokenVerifier` trait in `identity-core`. | V1 trait; V2 import scan. |
| AUTH-02 | Token issuance MUST be expressed as a `TokenIssuer` trait; every login method MUST use this single issuance path. | V1 trait; V3 test. |
| AUTH-03 | Access tokens MUST be JWS. JWE is not used. | V3 token test. |
| AUTH-04 | The default signing algorithm MUST be asymmetric (`EdDSA` or `ES256`). HS256 is allowed only under the `local-only` profile. | V2 config check; V3 negative test. |
| AUTH-05 | The verifier MUST enforce an explicit algorithm allowlist and MUST reject `none`, unknown algorithms, and algorithm/operation mismatches. | V3 negative tests N-1, N-2, N-3. |
| AUTH-06 | Tokens MUST contain `iss`, `sub`, `aud`, `exp`, `iat`, and `jti`. `nbf` and `scope` MAY be present. | V3 token test. |
| AUTH-07 | `sub` MUST be the internal `SubjectId`. | V3 token test. |
| AUTH-08 | `aud` MUST identify one interface or resource. Wildcard audiences are forbidden. A token for one interface MUST be rejected by another. | V3 audience-isolation test. |
| AUTH-09 | Access-token lifetime MUST be short and configurable (recommended 5–15 minutes). | V2 config check. |
| AUTH-10 | Verification keys MUST be resolved through a `KeyStore` keyed by `kid`. Multiple active public keys MUST be supported for rotation. | V1 trait; V3 rotation test. |
| AUTH-11 | Key material MUST NOT be fetched from `jku`, `x5u`, or any URL carried by the token. JWKS URLs MUST be fixed by configuration. | V3 negative test N-11. |
| AUTH-12 | Validation order MUST be: algorithm allowlist → signature → `iss` → `aud` → `exp`/`nbf` → `typ` → `sub` → tenant/delegation → `ver` → `jti`. | V3 instrumented test. |
| AUTH-13 | Access tokens, ID tokens, and other token types MUST be mutually exclusive by `typ`, required claims, key, and audience. An external ID token MUST NOT be accepted as an access token. | V3 negative test N-9. |
| AUTH-14 | Revocation MUST be checked after signature validation, using `jti` and/or a user-level token version. Revocation checks MUST NOT replace cryptographic validation. | V3 test. |
| AUTH-15 | Refresh tokens MUST be opaque random values, stored only as hashes, rotated on every use, and revoked as a session family on reuse detection. | V3 test. |
| AUTH-16 | Auth failures exposed to clients MUST collapse to 401 or 403. Detailed reasons MUST be logged, never returned. | V3 response test. |
| AUTH-17 | Secrets, tokens, authorization codes, verifiers, and passwords MUST NOT appear in logs, `Debug`, error bodies, or metrics. | V2 log scan; V3 redaction test. |
| AUTH-18 | Login MUST be an operation (`auth.token.issue` or equivalent). It MUST NOT be a transport-specific router contract in `identity-core`. | V1 type; V2 import scan. |
| AUTH-19 | Each interface MAY implement its own credential acquisition flow, but all flows MUST end at the same `TokenIssuer`. | V3 test. |
| AUTH-20 | HS256 is permitted only when all of the following hold: single process, no cross-interface token use, explicit `local-only` profile, key length ≥ 32 bytes. | V2 profile check; V3 negative test. |

**Rationale for AUTH-04.** Asymmetric signatures let the API verify with public
keys only. Moving issuance to another process or an external identity provider
then changes configuration, not the verifier's secret material. HS256 couples
issuer and verifier through a shared secret and does not survive that move.

**Rationale for AUTH-08.** A token leaked from the CLI must not become a REST,
gRPC, or MCP credential. Audience separation is the boundary that makes a leak
local to one interface.

### 5.3 Per-interface authentication

| ID | Rule | Verification |
|---|---|---|
| AUTH-21 | REST MUST accept only `Authorization: Bearer <token>`. Other schemes, multiple headers, and empty tokens MUST return 401. | V3 test. |
| AUTH-22 | WebSocket MUST use a short-lived, single-use, client-bound one-time ticket. Long-lived JWT query parameters are forbidden. | V3 test. |
| AUTH-23 | gRPC MUST read credentials from metadata and map auth failures to `UNAUTHENTICATED` or `PERMISSION_DENIED`. | V3 test. |
| AUTH-24 | CLI MUST store tokens in an OS-protected store or a `0600` file, never in argv or shell history. | V2 argv scan; V3 test. |
| AUTH-25 | CLI local execution MUST establish an explicit principal and MUST NOT grant implicit administrator rights. | V3 test. |
| AUTH-26 | MCP MUST implement the authentication discovery/challenge required by the adopted MCP specification, and MUST NOT pass a received token through to a downstream API. | V3 protocol test. |
| AUTH-27 | A2A MUST implement the security mechanism required by the adopted A2A specification. | V3 protocol test. |
| AUTH-28 | Authentication requirement (`Required`/`Anonymous`) MUST be separate from scope. Anonymous operations use `AnonymousOperation` and never receive a `VerifiedIdentity`. | V1 type; V3 test. |
| AUTH-29 | `VerifiedIdentity` MUST carry the credential binding: interface, audience, method, authentication time, expiry, token ID, and token version. The dispatcher MUST reject a binding mismatch. | V1 type; V3 test. |
| AUTH-30 | A session ticket and a local identity issuer MUST create a new binding. A token or identity verified for one interface/audience MUST NOT be reused for another. | V3 test. |
| AUTH-31 | Delegation MUST preserve `actor` and `on_behalf_of`, and the verifier MUST reject an unauthorized actor or an excessive scope set. | V3 test. |

---

## 6. SSO Extension

SSO is optional. When planned, the following contracts are fixed now.

| ID | Rule | Verification |
|---|---|---|
| SSO-01 | SSO MUST live in `identity-sso`. It MUST NOT be imported by `*-operation` or `*-core`. | V2 dependency check. |
| SSO-02 | OIDC MUST use Authorization Code with PKCE (`S256`). Implicit grant and ROPC are forbidden. | V3 protocol test. |
| SSO-03 | `state` MUST be generated per request and bound to the browser session; OIDC `nonce` MUST be used. Both MUST be single-use. | V3 test. |
| SSO-04 | Redirect URIs MUST be registered by exact match. Wildcards and open redirectors are forbidden. | V2 config check; V3 test. |
| SSO-05 | The external issuer (`iss`) MUST be validated per provider to prevent mix-up attacks. | V3 test. |
| SSO-06 | The external ID token MUST be verified inside `identity-sso` and discarded. It MUST NOT be forwarded to the API or operation layer. | V2 import scan; V3 test. |
| SSO-07 | SSO output MUST be `AuthenticatedUser`; the flow MUST then call `TokenIssuer` to issue an internal access token. | V1 type; V3 test. |
| SSO-08 | External accounts MUST be stored in `external_identities` with `UNIQUE(issuer, subject)`. Business tables MUST NOT store external provider IDs. | V2 schema check; V3 test. |
| SSO-09 | Accounts MUST NOT be linked automatically by email address. Linking requires an explicit, auditable action. | V3 test. |
| SSO-10 | Provider client IDs and secrets MUST come from configuration or environment variables, never source code. | V2 secret scan. |
| SSO-11 | Adding SSO MUST change only: the `identity-sso` crate, authentication adapters, assembly wiring, configuration, and `external_identities`. Business operations, `VerifiedIdentity`, and business tables MUST remain unchanged. | V3 regression test; V4 review. |
| SSO-12 | External ID tokens and internal access tokens MUST be mutually rejected by their verification rules. | V3 negative test N-9. |

**Fixed SSO contract:**

```text
external login verified
        ↓
internal SubjectId resolved
        ↓
allowed scopes and audience decided
        ↓
internal access token issued
```

**Rationale for SSO-09.** Email addresses are not a stable cross-provider
identity. Automatic linking by email enables account takeover when a provider
recycles or reassigns an address.

---

## 7. Authorization

| ID | Rule | Verification |
|---|---|---|
| AUTHZ-01 | Authorization MUST be expressed as `Authorizer::require(identity, action, resource)`. | V1 trait; V4 review. |
| AUTHZ-02 | Scope is necessary but never sufficient. Ownership, tenant, and resource state MUST also be checked. | V3 test. |
| AUTHZ-03 | Tenant and owner checks MUST use the identity and the loaded resource, not request-supplied IDs. | V3 cross-tenant test. |
| AUTHZ-04 | Anonymous operations MUST be explicitly declared. `Option<Identity>` must not be used to express "maybe anonymous". | V1 type; V3 test. |
| AUTHZ-05 | A target in another tenant MUST return not-found. A target in the caller's tenant with insufficient rights MUST return permission-denied. | V3 test. |
| AUTHZ-06 | Scope strings MUST NOT be compared in handlers or adapters; policy belongs in one authorizer implementation. | V2 string scan; V4 review. |
| AUTHZ-07 | Authorization and mutation races MUST be handled with a transaction or a conditional update. | V3 race test. |
| AUTHZ-08 | An interface-level pre-check MAY exist, but it MUST NOT replace the operation-level authorization. | V3 bypass test. |
| AUTHZ-09 | The same identity, action, and resource MUST produce the same authorization result through every interface. | V3 conformance test. |

---

## 8. Interface Adapters

### 8.1 Common rules

| ID | Rule | Verification |
|---|---|---|
| IF-01 | An adapter MUST only: extract credentials, convert input, call the verifier, call the operation, convert output, and map errors. | V4 review; V2 business-logic scan. |
| IF-02 | An adapter MUST NOT implement business rules, authorization policy, or persistence. | V2 import scan; V4 review. |
| IF-03 | Credential extraction MUST be adapter-specific; verification MUST call the shared `AccessTokenVerifier`. | V2 import scan; V3 test. |
| IF-04 | Protocol errors MUST be mapped from the protocol-independent error vocabulary. Adapters MUST NOT invent operation errors. | V3 mapping test. |
| IF-05 | Every implemented interface MUST expose every operation unless the operation is explicitly declared not applicable, with a reason. | V3 matrix test. |
| IF-06 | No interface may call another interface to reach an operation. | V2 dependency check. |
| IF-07 | Protocol state (connection, subscription, task, stream) MUST remain in the adapter or in `*-operation` state, never duplicated in both. | V4 review; V3 state test. |
| IF-08 | Every response MUST carry the operation's `request_id`; streaming messages MUST carry a correlation identifier. | V3 test. |

### 8.2 Interface-specific rules

The canonical interface rules are defined in Part III:

- Part III.6 — REST: `REST-01` through `REST-18`.
- Part III.7 — WebSocket: `WS-01` through `WS-32`.
- Part III.8 — CLI: `CLI-01` through `CLI-14`.
- Part III.9 — gRPC: `GRPC-01` through `GRPC-19`.
- Part III.10 — MCP: `MCP-01` through `MCP-21`.
- Part III.11 — A2A: `A2A-01` through `A2A-24`.

Part II §8.1 remains the common adapter rule. The interface specifications are
normative and use unique IDs recorded in Part III.15. Part II does not restate
them.

---

## 9. Errors, Observability, and Security

### 9.1 Error model

| ID | Rule | Verification |
|---|---|---|
| ERR-01 | Operations MUST return a protocol-independent error value with `code`, `domain`, `retryable`, and optional structured details. | V1 type. |
| ERR-02 | Error codes MUST be stable identifiers; adapters MUST map them to protocol statuses. | V3 mapping test. |
| ERR-03 | Error values MUST NOT contain secrets, tokens, passwords, or raw provider responses. | V2 scan; V3 redaction test. |
| ERR-04 | Retryability MUST be explicit. Validation and authentication errors are not retryable. | V3 test. |
| ERR-05 | Each interface MUST have one error-mapping table and one test per code. | V3 coverage test. |

### 9.2 Observability

| ID | Rule | Verification |
|---|---|---|
| OBS-01 | Logs MUST be structured and include `request_id`, `operation_id`, `subject`, result, and duration. | V3 log test. |
| OBS-02 | Logs MUST NOT include tokens, secrets, authorization codes, or passwords. | V2 scan; V3 test. |
| OBS-03 | Metrics MUST cover operation latency, error rate, authentication failures, and audience rejections. | V2 metric inventory. |
| OBS-04 | Metrics and logs MUST distinguish interface, operation, and error code. | V3 test. |
| OBS-05 | Health endpoints MUST be minimal in public mode; detailed readiness is privileged. | V3 test. |

### 9.3 Security

| ID | Rule | Verification |
|---|---|---|
| SEC-01 | Transport MUST use TLS outside loopback-only local mode. | V2 config check. |
| SEC-02 | Authentication endpoints and mutating operations MUST be rate-limited. | V3 load test. |
| SEC-03 | Configuration and secrets MUST come from environment or a secret store; source code MUST NOT contain them. | V2 secret scan. |
| SEC-04 | Dependencies MUST be audited for known vulnerabilities before release. | V2 audit command. |
| SEC-05 | Debug output MUST NOT leak request bodies or credentials. | V2 scan; V3 test. |

---

## 10. Conformance

Conformance is the executable form of this document. The canonical conformance
rules are `CONF-01` through `CONF-44` in Part III.12. Part II does not duplicate
that table. The minimum obligations are:

- every operation appears in the operation × interface matrix;
- every implemented interface passes the negative authentication suite;
- the same identity, input, and resource produce the same result, error code,
  state, and authorization outcome through every interface;
- no interface bypasses operation authorization;
- every rule ID has a verdict in the canonical registry.

---

## 11. Per-Operation Specification Template

Every operation in a project's `SYSTEM-DESIGN.md` MUST use this template.

```text
OP-xxx <operation_id>
  Types:          <Request> → <Response>
  Authentication: required | anonymous
  Scope:          read | control | admin (required operations only)
  Mode:           U | S | C | B
  Preconditions:  ...
  Procedure:      ... (prepare: validation/load/authorize; execute: reserve/mutate/commit/outbox)
  Failure:        ... (compensation, forward recovery, isolation, retryability)
  Postconditions: ...
  Interfaces:
    REST:         <METHOD> <path>
    WebSocket:    operation_id = "<operation_id>"
    CLI:          <command>
    gRPC:         <service>/<method>
    MCP:          <tool name>
    A2A:          <skill/task mapping>
  Conformance:    CF_<operation_id>
  Rules:          <rule IDs that need special attention>
```

A missing interface binding MUST be declared as `not applicable` with a reason.
An operation without a conformance identifier is not complete.

---

## 12. Application to Projects

### 12.1 Project profile

Each project MUST declare its profiles in `RULES-PROFILE.toml` (see §0.5).
Projects that are not Rust do not adopt this document.

### 12.2 Crate mapping

Each project MUST record how its existing crates map to the roles in §3.1.
Unmapped crates are a finding, not an exception.

Example:

| Role | gaia | crystal | doors |
|---|---|---|---|
| core | `gaia-core`, `gaia-foundation`, `gaia-ports` | `crystal-core`, `crystal-protocol-types` | `doors-core` |
| operation | `gaia-operation` | `crystal-operation`, `crystal-protocol-*` | `doors-operation` |
| conformance | `gaia-conformance` | `crystal-conformance`, `crystal-testkit` | `doors-conformance` |
| rest | `gaia-rest` | to be created | `doors-rest` |
| websocket | `gaia-websocket` | to be created | `doors-websocket` |
| cli | `gaia-cli` | to be created | `doors-cli` |
| grpc | to be created | to be created | `doors-grpc` |
| mcp / a2a | to be created | to be created | to be created |

### 12.3 Application rules

| ID | Rule | Verification |
|---|---|---|
| APP-01 | A project MUST declare its profiles and MUST list every unimplemented interface as absent. | V2 profile check. |
| APP-02 | A project MUST maintain an operation catalog using the §11 template. | V3 catalog test. |
| APP-03 | A project MUST map its crates to §3.1 roles and record the mapping. | V4 review; V2 manifest check. |
| APP-04 | Exceptions MUST be declared with a reason, scope, owner, and expiry. Undeclared exceptions are defects. | V2 exception check. |
| APP-05 | This document is versioned. A project pins the version it applies. | V2 lock/check. |
| APP-06 | Adoption order SHOULD, within the interface profiles a project selects, be: identity-core and identity-jwt → operation authorization and conformance → REST → WebSocket → CLI → gRPC → MCP → A2A. A project MAY select any subset. | V4 review; project plan. |
| APP-07 | Each adopted rule MUST first have a failing conformance test, then an implementation, then a refactor. | V3 test history; V4 review. |

---

## 13. Rule Index

The following index is the normative checklist. A project's conformance report
MUST name every rule and its verdict. Detailed IDs, classes, and verification
are in Part III.15; this index is a navigation aid, not a second registry.

### Meta and invariants

INV-01 one implementation per operation · INV-02 every interface calls the same
operation · INV-03 authentication once, authorization inside the operation ·
INV-04 no transport/JWT/SSO types in core/operation · INV-05 SSO adds no
business changes · INV-06 conformance proves compliance · INV-07 no
cross-interface token reuse · INV-08 no side effect before authorization ·
FREE-01 no closed feature list · FREE-02 open additions · FREE-03 free
internals · FREE-04 any interface subset · FREE-05 project-local extension ·
FREE-06 extend, do not fork · FREE-07 amend a feature-blocking rule · FREE-08
versioned amendment · FREE-09 additional crate roles · FREE-10 lifecycle-only
state · FREE-11 open resource IDs · FREE-12 recommended interface order ·
FREE-13 hand-written internals free · VER-01 one spec version · VER-02 project
pinning · VER-03 major for closed-seam changes · VER-04 minor for new extension
points · VER-05 major for rejecting previously valid projects · VER-06 amend
by extending, not excepting

### Architecture

ARC-01 roles · ARC-02 dependency direction · ARC-03 no transport in
core/operation · ARC-04 no adapter-to-adapter · ARC-05 conformance direction ·
ARC-06 assembly-only wiring · ARC-07 ports in core · ARC-08 operation depends on
identity-core only · ARC-09 naming · ARC-10 module layout

### Operation

OPS-01 operation ID · OPS-02 envelope · OPS-03 context contents · OPS-04
request ID · OPS-05 pipeline · OPS-06 no pre-auth side effects · OPS-07
authorization inside operation · OPS-08 tenant/owner derivation · OPS-09
idempotency · OPS-10 transaction/compensation · OPS-11 streaming semantics ·
OPS-12 one handler per operation · OPS-13 no protocol types · OPS-14 public
operations explicit · OPS-15 publish after commit · OPS-16 conformance ID ·
OPS-17 opaque prepared state · OPS-18 generated validation

### Identity and authentication

ID-01 SubjectId · ID-02 single identity type · ID-03 unconstructible · ID-04 no
Deserialize · ID-05 actor/delegation · ID-06 no raw token in operations ·
AUTH-01 verifier trait · AUTH-02 issuer trait · AUTH-03 JWS · AUTH-04
asymmetric default · AUTH-05 algorithm allowlist · AUTH-06 required claims ·
AUTH-07 internal subject · AUTH-08 per-interface audience · AUTH-09 short TTL ·
AUTH-10 key store · AUTH-11 no token-supplied key URLs · AUTH-12 validation
order · AUTH-13 token-type separation · AUTH-14 revocation · AUTH-15 refresh
tokens · AUTH-16 collapsed auth errors · AUTH-17 no secrets in logs · AUTH-18
login is an operation · AUTH-19 single issuance path · AUTH-20 local-only
HS256 · AUTH-21 REST bearer · AUTH-22 WebSocket ticket · AUTH-23 gRPC metadata ·
AUTH-24 CLI storage · AUTH-25 CLI local principal · AUTH-26 MCP auth · AUTH-27
A2A auth · AUTH-28 authentication requirement · AUTH-29 credential binding ·
AUTH-30 ticket/local binding · AUTH-31 delegation

### SSO

SSO-01 crate isolation · SSO-02 code+PKCE · SSO-03 state/nonce · SSO-04 exact
redirect · SSO-05 issuer validation · SSO-06 discard external token · SSO-07
AuthenticatedUser output · SSO-08 external identities · SSO-09 no email
linking · SSO-10 provider secrets · SSO-11 change scope · SSO-12 token-type
separation

### Authorization

AUTHZ-01 authorizer · AUTHZ-02 scope necessary not sufficient · AUTHZ-03
identity+resource · AUTHZ-04 explicit anonymous · AUTHZ-05 not-found vs
permission · AUTHZ-06 centralized policy · AUTHZ-07 race handling · AUTHZ-08 no
adapter substitution · AUTHZ-09 cross-interface parity

### Interfaces

Interface-specific rules are defined in Part III.6–III.11. Their canonical IDs
and classes are in Part III.15. Part II §8.1 defines the common adapter rules
`IF-01` through `IF-08`.

### Errors, observability, security

ERR-01 protocol-independent error · ERR-02 stable codes · ERR-03 secret-free ·
ERR-04 retryability · ERR-05 mapping tables · OBS-01 structured logs · OBS-02
no secrets in logs · OBS-03 metrics · OBS-04 dimensions · OBS-05 health ·
SEC-01 TLS · SEC-02 rate limiting · SEC-03 configuration secrets · SEC-04
dependency audit · SEC-05 debug output

### Conformance and application

Conformance rules are `CONF-01` through `CONF-64` in Part III.12. Application
rules are `APP-01` through `APP-07` in Part II §12. Documentation rules are
`DOC-01` through `DOC-17` in Part III.16. Validation rules are `VAL-01` through
`VAL-20` in Part III.17. Implementation blueprint rules are `BP-01` through
`BP-20` in Part III.18. Their classes and verification are in Part III.15.

---

## 14. Completion Criteria

A project is compliant when all of the following hold.

1. The crate graph passes ARC-02 through ARC-08.
2. Every operation has a complete §11 specification and a conformance ID.
3. Every implemented interface passes the operation × interface matrix.
4. The negative authentication suite passes for every interface.
5. Audience isolation passes between every pair of interfaces.
6. No adapter can construct a `VerifiedIdentity`.
7. Operation-level authorization cannot be bypassed from any interface.
8. SSO can be added without changing business operations, `VerifiedIdentity`,
   or business tables.
9. Every MUST rule has a named verification and a passing result.
10. Undeclared exceptions do not exist.
11. Every implemented interface has generated English documentation, and the
    `docgen --check all` gate passes.
12. Every request uses the shared input macro; validation parity and
    descriptor coverage pass.
13. The implementation blueprint in Part III.18 is followed; an alternate
    method has a versioned exception.

A project that cannot prove one of these is not compliant, regardless of
whether its code compiles or its documentation says otherwise.

---

## 15. Documentation

Every implemented interface MUST have generated English usage documentation.
Documentation is a build artifact, not a hand-maintained parallel text.

- Inputs: operation catalog, neutral schema registry, interface bindings, and
  shared contracts.
- The generator MUST NOT parse Rust source; it consumes the schema registry.
- `utoipa`/OpenAPI MAY supply schemas and the REST rendering, but MUST NOT be
  the only source for non-REST interfaces.
- Documentation generation MUST NOT require a running REST server or adapter.
- Completeness, English-only, secret-free, and determinism are build gates.
- Input constraints are declared once with the shared input macro; the same
  declaration generates the runtime validator, schema, and validation
  descriptor. Documentation consumes the descriptor, never a hand-written list.

The concrete rules are `DOC-01` through `DOC-17` in Part III.16 and
`VAL-01` through `VAL-20` in Part III.17. The mandatory implementation method is
`BP-01` through `BP-20` in Part III.18. A project MUST follow the blueprint or
declare a versioned exception.
