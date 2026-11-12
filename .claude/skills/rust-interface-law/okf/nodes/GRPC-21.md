---
type: Rule
id: GRPC-21
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: 6a4b99ef00e296625cb095cb8b743a72bc919a5fcfc67553b381edae7a2b7b17
source: docs/archive/IMPLEMENTATION-SPEC/15-RULE-REGISTRY.md
---
| `GRPC-21` | C | grpc | GRPC | Part III.9 | Every gRPC streaming shape MUST propagate deadlines, input half-close, and cancellation to the matching dispatcher stream method. | V3 four-shape tests. | conformance driver |
