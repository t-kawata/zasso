---
type: Rule
id: GRPC-11
phase: adapter
delivery: must
applies_to: grpc
requires: []
references: []
content_sha256: 9ea2a67015cc9ec112497bf04ea5778105a1f0e2a65946445ebd177f92e155e9
source: sources/15-RULE-REGISTRY.md
---
| `GRPC-11` | C | grpc | GRPC | Part III.9 | Rich details are encoded as `google.rpc.Status` details or the JSON detail field; they never contain secrets. | V3 redaction test. | conformance driver |
