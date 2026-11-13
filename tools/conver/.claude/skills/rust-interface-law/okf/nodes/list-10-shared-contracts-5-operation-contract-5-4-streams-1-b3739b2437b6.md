---
type: List
id: list/10-shared-contracts-5-operation-contract-5-4-streams/1/b3739b2437b6
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: b3739b2437b66cc72e62d18a83ccd4af3fbf74a3db65da150cc6af9639556840
source: sources/10-CONTRACTS.md
---
- `None` from `next` means normal EOF.
- `Some(Err(_))` means abnormal termination.
- `cancel` is idempotent and must release resources.
- Backpressure is explicit; the producer must not buffer unboundedly.
- The dispatcher owns cancellation propagation from the interface to the
  operation.
