---
type: "Section"
title: "8.1 Bindings"
description: "| Interface | Request binding | Reply binding |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-2/8-1-bindings"
    title: "8.1 Bindings"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-2/8-1-bindings"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "2706-2706"
---
### 8.1 Bindings

| Interface | Request binding | Reply binding |
|---|---|---|
| REST | JSON `{context?, request}` | JSON `{request_id, result}` or `{request_id, error}` |
| WebSocket | `{type:"request", request_id, operation_id, payload, context?}` | `{type:"response", request_id, result|error}` |
| CLI | typed arguments converted to the operation request | JSON/JSONL with `request_id` |
| gRPC | typed message with `Context` and typed request fields | typed message with `request_id` and `oneof result/error` |
| MCP | tool input plus context | tool result plus `request_id` |
| A2A | task/message mapped to the operation request | task artifact plus `request_id` |

Every binding returns the `request_id` in a place the client can read. REST
aliases use the same semantic envelope; an alias is path/method sugar, not a
different wire shape.

The protobuf schema may use typed messages. It MUST carry the semantic
`Context` fields and the `request_id` on the reply. The universal "JSON bytes in
protobuf" rule from the previous version is withdrawn.

---

## 9. Interface Contract

