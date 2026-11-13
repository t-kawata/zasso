---
type: Table
id: table/21-operation-crate-6-anonymous-operations/1/d73a6abc64ba
phase: operation
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: d73a6abc64ba045ad5d2f9ec5ad6e114fcab11137ddef10df3a9378354877093
source: sources/21-OPERATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| OP-09 | Anonymous operations are registered separately. | Registry variant. | Operation set. | V3 test. |
| OP-10 | No anonymous operation receives a `VerifiedIdentity`. | Type. | — | V1. |
| OP-11 | Anonymous operations do not bypass rate limits or validation. | Both required. | Limits and rules. | V3 test. |
| OP-12 | Idempotency for anonymous operations is opt-in and keyed by peer plus operation. | Namespace rule. | Policy. | V3 test. |
