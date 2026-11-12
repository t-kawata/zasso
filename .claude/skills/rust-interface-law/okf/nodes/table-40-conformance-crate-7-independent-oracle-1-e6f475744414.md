---
type: Table
id: table/40-conformance-crate-7-independent-oracle/1/e6f475744414
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: e6f4757444141d4058baeafc27c6ccd3276813d9a284dd7caec24556618032cc
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-10 | Expected results are derived from the operation specification, not from one interface. | Independent oracle. | Oracle implementation. | V3 review of oracle source. |
| CONF-11 | All interfaces answering the same wrong result is a failure. | Independent expectation. | — | V3 test. |
| CONF-12 | The oracle covers normal, failure, state, authorization, idempotency, and streaming. | Coverage. | Case content. | V3 test. |
