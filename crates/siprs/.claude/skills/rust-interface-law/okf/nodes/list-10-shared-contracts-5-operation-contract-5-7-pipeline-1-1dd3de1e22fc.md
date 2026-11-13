---
type: List
id: list/10-shared-contracts-5-operation-contract-5-7-pipeline/1/1dd3de1e22fc
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 1dd3de1e22fcd063a02b34b27ea8ee90c9426e3ba0de8d4a43d9c3859eba49a8
source: sources/10-CONTRACTS.md
---
- **Validation (6):** runs for both replay and new requests, before the claim.
  It is stateless input validation; state-dependent preconditions, resource
  loading, and ownership authorization stay in `prepare`.
- **Replay branch (8a):** the dispatcher returns the stored result after
  `replay_authorize` confirms the current caller may access the recorded
  target. `prepare` is not run; delete, create, and approve operations must not
  fail their own retry because their first success changed the state.
- **Acquired branch (8b):** `prepare` validates and authorizes before
  `execute`. No side effect occurs before it succeeds.
