---
type: Table
id: table/40-conformance-crate-6-fixtures-and-determinism/1/6342fe49f9ae
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 6342fe49f9ae5e0a26442978154cd01d0bdf1f444f31a3edd6308df79be2a978
source: sources/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-05 | Every case names a fixture with setup and reset. | Fixture boundary. | Fixture content. | V3 test. |
| CONF-06 | IDs and time are deterministic in fixtures. | Determinism. | Clock/id strategy. | V3 test. |
| CONF-07 | Generated IDs and timestamps use semantic matchers, not exact equality. | Matcher rule. | Matcher choice. | V3 test. |
| CONF-08 | A case must not depend on the order of another case. | Isolation. | — | V3 test. |
| CONF-09 | A mutation case must assert the resulting state, not only the response. | State oracle. | State shape. | V3 test. |
