---
type: "Section"
title: "3. Operation Catalog"
description: "The catalog is the single source of truth for operations. The generator"
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-3-operation-catalog"
    title: "3. Operation Catalog"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "98-167"
---
## 3. Operation Catalog

The catalog is the single source of truth for operations. The generator
consumes it; the conformance matrix is derived from it.

```toml
[project]
name = "<project-c>"
spec_version = "0.3.2"

[[operation]]
id = "account.add"
authentication = "required"          # required | anonymous
scope = "control"                    # required operations only
mode = "unary"                       # unary | server_stream | client_stream | bidi
request = "AccountAddRequest"
response = "AccountAddResponse"
prepared = "PreparedAccountAdd"
handler = "crates/<project-c>-operation/src/handlers/account/add.rs"
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

