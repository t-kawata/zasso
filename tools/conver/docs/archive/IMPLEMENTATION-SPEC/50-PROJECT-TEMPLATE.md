# 50 — Project Template

**Status:** Normative
**Version:** 0.3.2
**Parent:** Part II
**Contracts:** Part III.2

This document defines the workspace every project starts from. It is
profile-driven: a project includes only the crates, files, and generated
outputs for the interfaces it actually implements.

---

## 1. Workspace Layout

```text
<project>/
├── Cargo.toml
├── RULES-PROFILE.toml
├── SYSTEM-DESIGN.md
├── contract/
│   ├── operation-catalog.toml
│   ├── proto-field-ledger.toml
│   └── audience.toml
├── proto/
│   └── <project>.v1.proto          # generated, checked in, grpc profile only
└── crates/
    ├── operation-contract/          # shared
    ├── interface-contract/          # shared
    ├── contract-macros/             # shared input/rule macros
    ├── validation-contract/         # shared runtime validator and registry
    ├── identity-core/               # shared
    ├── identity-jwt/                # shared facade
    ├── identity-local/              # shared
    ├── identity-operation/          # shared
    ├── identity-sso/                # shared, optional
    ├── <project>-core/
    ├── <project>-operation/
    ├── <project>-conformance/
    ├── <project>-rest/              # only if rest profile
    ├── <project>-websocket/         # only if websocket profile
    ├── <project>-cli/               # only if cli profile
    ├── <project>-grpc/              # only if grpc profile
    ├── <project>-mcp/               # only if mcp profile
    ├── <project>-a2a/               # only if a2a profile
    └── <project>-assembly/
```

The shared crates are consumed from a versioned contract repository or vendored
for bootstrapping. They are never forked. A local modification is proposed
upstream and versioned.

A project MAY add `tooling`, `test-support`, `build-support`, or `utility`
crates. Their dependency edges are declared in `RULES-PROFILE.toml`; forbidden
runtime edges still apply.

---

## 2. `RULES-PROFILE.toml`

```toml
[project]
name = "doors"
spec_version = "0.3.2"

[profiles]
rust = true
rest = true
websocket = true
cli = true
grpc = true
mcp = true
a2a = true

[auth]
jwt = true
sso = "disabled"   # disabled | planned | enabled
local_only = false

[docs]
generate = true    # MUST be true for every project
english = true     # MUST be true
out_dir = "docs/generated"

[roles]
# Additional, non-runtime roles. Dependency edges still obey ARC-02..ARC-08.
tooling = []
test-support = ["<project>-core", "<project>-operation"]
build-support = []
```

Profiles are booleans. An unimplemented interface is `false`, not omitted.
`sso = "planned"` is allowed only with a target in `SYSTEM-DESIGN.md`; it is not
an implementation.

---

## 3. Operation Catalog

The catalog is the single source of truth for operations. The generator
consumes it; the conformance matrix is derived from it.

```toml
[project]
name = "doors"
spec_version = "0.3.2"

[[operation]]
id = "account.add"
authentication = "required"          # required | anonymous
scope = "control"                    # required operations only
mode = "unary"                       # unary | server_stream | client_stream | bidi
request = "AccountAddRequest"
response = "AccountAddResponse"
prepared = "PreparedAccountAdd"
handler = "crates/doors-operation/src/handlers/account/add.rs"
conformance = "CF_account_add"

# Documentation inputs (English only)
docs = { summary = "Create an account", description = "Creates an account in the caller's tenant.", examples = ["account.add --name 'Example' --email user@example.com"] }

# Idempotency
idempotency = "same-transaction"     # none | same-transaction | external

# External effects
recovery = "compensate"              # compensate | forward | isolate

# Interface bindings
rest = { method = "POST", path = "/accounts", success = 200 }
websocket = { operation_id = "account.add" }
cli = { command = "account add" }
grpc = { service = "DoorsService", method = "AccountAdd", request = "AccountAddRequest", response = "AccountAddResponse" }
mcp = { tool = "account_add", applicable = true }
a2a = { skill = "account_add", applicable = true }

# Result store / cancellation
result_store = "on-cancel"           # none | on-cancel | always
```

Required fields:

| Field | Rule |
|---|---|
| `id` | Dotted, stable, unique. Grammar: `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`. |
| `authentication` | `required` or `anonymous`. |
| `scope` | Required when `authentication = "required"`; MUST be omitted for anonymous. |
| `mode` | `unary`, `server_stream`, `client_stream`, or `bidi`. |
| `request` / `response` / `prepared` | Rust type names. |
| `handler` | Path to the create-once hand-written handler. |
| `conformance` | `CF_<id with dots replaced by underscores>`. |
| `idempotency` | `none`, `same-transaction`, or `external`. |
| `recovery` | Required when the operation has external effects. |
| Interface bindings | Required for every profile in `RULES-PROFILE.toml`; absent profiles are omitted. |
| `mcp` / `a2a` | `applicable = false` requires a reason. |

The generator rejects:

- a duplicate operation ID;
- a tool/skill/CLI name collision after `.` → `_` and kebab-case conversion;
- a binding for a profile that is `false`;
- a missing binding for a profile that is `true`;
- a missing conformance ID or handler;
- a `scope` on an anonymous operation;
- a `recovery` value not declared for an operation with external effects.

---

## 4. Schema Source

Request and response types declare input constraints once with the shared
input macro. The macro generates the runtime validator, the schema, and the
validation descriptor:

```rust
#[contract::input]
#[derive(serde::Serialize, serde::Deserialize)]
pub struct AccountAddRequest {
    #[rule(length(min = 1, max = 100), code = "invalid_name")]
    pub name: String,

    #[rule(pattern = "^[^@]+@[^@]+$", code = "invalid_email")]
    pub email: String,
}
```

The generator consumes the neutral schema registry and the validation
descriptor registry. It emits REST schemas, MCP tool schemas, A2A skill
schemas, CLI flags, OpenAPI entries, and validation constraint tables.
Protocol-specific annotations (for example `utoipa`) belong to the adapter, not
to the operation DTO. Do not hand-write a second constraint list in the
documentation.

The proto field ledger is separate and authoritative:

```toml
# contract/proto-field-ledger.toml
[[message]]
name = "AccountAddRequest"
[[message.field]]
name = "context"
tag = 1
type = "Context"
[[message.field]]
name = "name"
tag = 2
type = "string"
optional = true

[[message.reserved]]
name = "AccountAddRequest"
tags = [7, 8]
names = ["legacy_email"]
```

The generator reads the ledger for tag assignment and rejects tag reuse,
renumbering, or a field without a ledger entry.

---

## 5. Cargo.toml

```toml
[workspace]
resolver = "2"
members = [
  "crates/operation-contract",
  "crates/interface-contract",
  "crates/contract-macros",
  "crates/validation-contract",
  "crates/identity-core",
  "crates/identity-jwt",
  "crates/identity-local",
  "crates/identity-operation",
  "crates/<project>-core",
  "crates/<project>-operation",
  "crates/<project>-conformance",
  "crates/<project>-docgen",
  "crates/<project>-assembly",
  # add the interface members that are true in RULES-PROFILE.toml
]

[workspace.package]
edition = "2021"
rust-version = "1.95"

[workspace.dependencies]
operation-contract = { path = "crates/operation-contract" }
interface-contract = { path = "crates/interface-contract" }
contract-macros = { path = "crates/contract-macros" }
validation-contract = { path = "crates/validation-contract" }
identity-core = { path = "crates/identity-core" }
identity-jwt = { path = "crates/identity-jwt" }
identity-local = { path = "crates/identity-local" }
identity-operation = { path = "crates/identity-operation" }
# interface SDKs are pinned here and included per profile
```

The workspace verifies that every member required by a true profile is present
and every member for a false profile is absent.

---

## 6. Required Files by Profile

| File | Required when |
|---|---|
| `RULES-PROFILE.toml` | Always. |
| `SYSTEM-DESIGN.md` | Always. |
| `contract/operation-catalog.toml` | Always. |
| `contract/proto-field-ledger.toml` | `grpc = true`. |
| `proto/<project>.v1.proto` | `grpc = true`. |
| `crates/<project>-docgen/` | Always. |
| `docs/generated/INDEX.md` | Always. |
| `docs/generated/rest/` | `rest = true`. |
| `docs/generated/websocket/` | `websocket = true`. |
| `docs/generated/cli/` | `cli = true`. |
| `docs/generated/grpc/` | `grpc = true`. |
| `docs/generated/mcp/` | `mcp = true`. |
| `docs/generated/a2a/` | `a2a = true`. |
| `<project>-conformance/src/matrix/generated.rs` | Always. |
| `<project>-conformance/src/cases/generated.rs` | Always. |

A profile that is `false` must not require its files. A project that implements
only MCP must not be required to add REST, WebSocket, CLI, or gRPC.

---

## 7. Generated Files and Create-Once Files

Generated files carry:

```rust
// @generated by conver. Do not edit.
```

The generated set is profile-conditional:

- operation registry (`register_all.rs`);
- REST route registration, schemas, OpenAPI;
- WebSocket envelope/dispatch bindings;
- CLI command tree;
- gRPC proto, service, conversions;
- MCP tools and schemas;
- A2A agent card and task mapping;
- conformance matrix and cases.

Hand-written handler skeletons are **create-once**, not overwritten:

```rust
// @generated:create-once <operation_id>. Replace this body with the implementation.
// [::STUB::] <ticket>: implement <operation_id>
```

Subsequent generation leaves an existing create-once file untouched and reports
a conflict if the file is missing or malformed.

A generation gate proves determinism:

- same `spec_version` + profile + operation catalog + proto field ledger +
  request/response `JsonSchema` output + generator version → byte-identical
  generated output;
- a hand edit to a generated file is overwritten;
- a hand edit to a create-once file is preserved;
- the generated output hash is recorded and checked in CI.

---

## 8. Naming

| Item | Rule |
|---|---|
| Crates | `<project>-<role>`; shared crates have no project prefix. |
| Modules | `snake_case`; public module layout follows the role spec. |
| Types | `PascalCase`; request/response end with `Request`/`Response`. |
| Operation IDs | `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$`. |
| Handler file | `<project>-operation/src/handlers/<domain>/<action>.rs`. |
| REST path | `<domain>/<action>` with path parameters for targets. |
| CLI command | `<domain> <action>` with kebab-case flags. |
| gRPC method | PascalCase of the operation ID. |
| MCP/A2A tool/skill | operation ID with `.` replaced by `_`. |
| Audience | one per interface (`rest`, `websocket`, `cli`, `grpc`, `mcp`, `a2a`). |
| Conformance ID | `CF_<operation_id with dots replaced by underscores>`. |

The generator rejects collisions after applying these transformations.

---

## 9. Build and Verification

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test -p <project>-conformance
cargo test --workspace
cargo metadata --format-version 1 > /dev/null
cargo run -p <project>-docgen -- dump-schema --out target/schema/registry.json
cargo run -p <project>-docgen -- dump-validation --out target/validation/registry.json
cargo run -p <project>-docgen -- render --catalog contract/operation-catalog.toml --out docs/generated
cargo run -p <project>-docgen -- check all
node scripts/rules/check-registry.mjs
node scripts/generate/check-determinism.mjs
```

The conformance crate is the authoritative gate. `cargo test --workspace` alone
does not prove cross-interface parity, rule coverage, documentation coverage, or
generation determinism. The docgen `--check all` gate covers completeness,
English-only, secret-free, and deterministic output.

---

## 10. Versioning

`spec_version` covers the rules, contracts, generator, and conformance kit.
Protocol SDK versions are recorded separately in `Cargo.toml` and the protocol
config.

| Artifact | Version source |
|---|---|
| Rules + contracts + generator + conformance kit | `spec_version` |
| Protocol SDKs | `Cargo.toml` + `Cargo.lock` |
| MCP/A2A specification | `McpConfig`/`A2aConfig` and `SYSTEM-DESIGN.md` |

A project upgrade changes `spec_version`, regenerates, and reruns conformance.
It is never implicit drift.

---

## 11. Fixed and Open

| Fixed | Open |
|---|---|
| Workspace layout, role names, profile schema, catalog schema. | Domain modules and operation contents. |
| Required files per profile. | Additional project crates and tooling. |
| Generated-file boundary and create-once rule. | Generator implementation details, provided determinism holds. |
| Naming grammar and collision checks. | Human-readable descriptions. |
| Verification commands. | CI provider and scheduling. |
| Version pinning. | Release cadence. |
