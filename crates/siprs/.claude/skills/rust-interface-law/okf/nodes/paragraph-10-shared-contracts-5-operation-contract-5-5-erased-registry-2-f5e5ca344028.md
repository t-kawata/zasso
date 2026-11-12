---
type: Paragraph
id: paragraph/10-shared-contracts-5-operation-contract-5-5-erased-registry/2/f5e5ca344028
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: f5e5ca344028e54bf51a66d23272ee7c5d38ae859b1b758f0bfebce6c3e3246c
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
`validate_json` runs before the idempotency claim. `prepare_validated` runs only
on the newly-acquired branch. Replay calls `replay_authorize` and never calls
`prepare_validated`.
