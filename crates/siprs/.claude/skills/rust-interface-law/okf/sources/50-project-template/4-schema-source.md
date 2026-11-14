---
type: "Section"
title: "4. Schema Source"
description: "Request and response types declare input constraints once with the shared"
sources: 
  - resource: "sources/50-PROJECT-TEMPLATE.md"
    id: "50-project-template-4-schema-source"
    title: "4. Schema Source"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/50-PROJECT-TEMPLATE.md"
x-source-span: "168-219"
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

