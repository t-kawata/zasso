---
type: "Section"
title: "2. Inputs"
description: "| Input | Authority |"
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-2-inputs"
    title: "2. Inputs"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "26-43"
---
## 2. Inputs

| Input | Authority |
|---|---|
| Operation catalog | The authoritative operation list, authentication, scope, mode, idempotency, recovery, bindings, and conformance ID. |
| Neutral schema registry | Request/response types, fields, required/optional, enums, descriptions, examples. |
| Validation descriptor registry | Runtime validation rules, standard schema keywords, custom rules, error codes, and English descriptions. |
| Interface bindings | REST method/path/status/headers; WebSocket envelope/stream lifecycle; CLI command/flags/exit codes; gRPC service/method/proto fields/stream mode/metadata; MCP tool/auth/result representation; A2A skill/task/artifact/auth. |
| Shared contracts | Envelope, identity/binding, error categories, streaming, idempotency, authorization, revocation. |
| Operation documentation fields | Summary, description, examples, errors, preconditions, postconditions, failure/compensation, authorization notes. |
| `ApiDoc::openapi()` | Optional additional REST schema input when REST is implemented. |

The neutral schema registry is produced by `schemars::JsonSchema` (recommended)
or `utoipa::ToSchema` (allowed). The generator reads the resulting JSON Schema,
not the Rust source.

---

