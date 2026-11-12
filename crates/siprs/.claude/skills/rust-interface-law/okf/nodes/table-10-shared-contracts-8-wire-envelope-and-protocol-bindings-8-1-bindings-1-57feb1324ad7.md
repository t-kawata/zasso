---
type: Table
id: table/10-shared-contracts-8-wire-envelope-and-protocol-bindings-8-1-bindings/1/57feb1324ad7
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 57feb1324ad7dc270f64b315cc925ba2ab2fe0f6af9cfef255df4fa265ca5c5c
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
| Interface | Request binding | Reply binding |
|---|---|---|
| REST | JSON `{context?, request}` | JSON `{request_id, result}` or `{request_id, error}` |
| WebSocket | `{type:"request", request_id, operation_id, payload, context?}` | `{type:"response", request_id, result|error}` |
| CLI | typed arguments converted to the operation request | JSON/JSONL with `request_id` |
| gRPC | typed message with `Context` and typed request fields | typed message with `request_id` and `oneof result/error` |
| MCP | tool input plus context | tool result plus `request_id` |
| A2A | task/message mapped to the operation request | task artifact plus `request_id` |
