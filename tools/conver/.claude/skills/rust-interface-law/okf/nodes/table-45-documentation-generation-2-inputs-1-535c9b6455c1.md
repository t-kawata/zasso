---
type: Table
id: table/45-documentation-generation-2-inputs/1/535c9b6455c1
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 535c9b6455c1ddfc41b8f868323fdca186977248bbc436fb943f42b2a880b133
source: sources/45-DOCUMENTATION.md
---
| Input | Authority |
|---|---|
| Operation catalog | The authoritative operation list, authentication, scope, mode, idempotency, recovery, bindings, and conformance ID. |
| Neutral schema registry | Request/response types, fields, required/optional, enums, descriptions, examples. |
| Validation descriptor registry | Runtime validation rules, standard schema keywords, custom rules, error codes, and English descriptions. |
| Interface bindings | REST method/path/status/headers; WebSocket envelope/stream lifecycle; CLI command/flags/exit codes; gRPC service/method/proto fields/stream mode/metadata; MCP tool/auth/result representation; A2A skill/task/artifact/auth. |
| Shared contracts | Envelope, identity/binding, error categories, streaming, idempotency, authorization, revocation. |
| Operation documentation fields | Summary, description, examples, errors, preconditions, postconditions, failure/compensation, authorization notes. |
| `ApiDoc::openapi()` | Optional additional REST schema input when REST is implemented. |
