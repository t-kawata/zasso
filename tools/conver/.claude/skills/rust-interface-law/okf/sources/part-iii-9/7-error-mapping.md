---
type: "Section"
title: "7. Error Mapping"
description: "| Operation category | gRPC status |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-9/7-error-mapping"
    title: "7. Error Mapping"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-9/7-error-mapping"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4880-4880"
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

## Rules in this section

- [GRPC-10 — Every category maps to the status above.](../../rules/c/grpc-10.md)
- [GRPC-11 — Rich details are encoded as `google.rpc.Status` details or the JSON detail fi...](../../rules/c/grpc-11.md)

