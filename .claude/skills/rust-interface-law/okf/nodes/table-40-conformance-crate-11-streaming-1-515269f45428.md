---
type: Table
id: table/40-conformance-crate-11-streaming/1/515269f45428
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 515269f45428a08173f8e92ea393f8bdec24fbc8cc0e4f3588fc43b4b9c0cf50
source: docs/archive/IMPLEMENTATION-SPEC/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-30 | Server stream items, EOF, error, and cancel match the operation contract. | Semantics. | Encoding. | V3 test. |
| CONF-31 | Client stream input, EOF, and cancel match the contract. | Semantics. | Encoding. | V3 test. |
| CONF-32 | Bidi streams preserve independent half-close and cancellation. | Semantics. | Encoding. | V3 test. |
| CONF-33 | Backpressure is observable and bounded. | Bound. | Threshold. | V3 load test. |
| CONF-34 | A cancelled operation's result is queryable through the authorized result lookup when the catalog declares it; a bare request ID is insufficient. | Result authorization. | Store backend. | V3 test. |
