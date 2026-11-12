---
type: Table
id: table/55-implementation-contracts-4-source-policy/1/46d46ef3b70c
phase: adapter
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 46d46ef3b70cfd70b96220c89cb56274eee6a1233d43248b304d72ea2f32a5b1
source: docs/archive/IMPLEMENTATION-SPEC/55-IMPLEMENTATION-CONTRACTS.md
---
| Rule | Requirement |
|---|---|
| Resolved identity | Required calls are resolved to crate and item identity, not string matches |
| Adapter entry | Adapter calls the dispatcher or adapter bridge only |
| No business logic | Adapter contains no domain decision, storage query, or transaction |
| No manual framing | JSON-RPC, SSE, and protocol envelopes use the admitted SDK |
| No hidden state | Authoritative session and task state live in the external store |
| Failure | Unresolved analysis, macro expansion, or generated code fails closed |
