---
type: Table
id: table/33-grpc-adapter-7-error-mapping/1/f72dbf5ddf93
phase: adapter
delivery: reference
applies_to: grpc
requires: []
references: []
content_sha256: f72dbf5ddf93bf5465abea38463c2e35104105a6e34e20d5a76656a62707fcd3
source: sources/33-GRPC.md
---
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
