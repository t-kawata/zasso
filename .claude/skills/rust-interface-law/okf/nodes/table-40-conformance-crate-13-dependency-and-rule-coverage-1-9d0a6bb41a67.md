---
type: Table
id: table/40-conformance-crate-13-dependency-and-rule-coverage/1/9d0a6bb41a67
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 9d0a6bb41a6730b604af8a6f108af68ef4e104e0b4149681bdd724b9dfb42530
source: sources/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-37 | The crate graph passes the forbidden-edge checks. | Edge rules. | — | V2 `cargo metadata`. |
| CONF-38 | Every rule ID in the registry has a verdict. | Coverage. | — | V3 rule-coverage test. |
| CONF-39 | A missing verification is a failure, not a skip. | Fail-closed. | — | V3 test. |
| CONF-40 | Documentation, file existence, and fixture names are not proof. | Forbidden. | — | V3 report inspection; V4 review. |
| CONF-41 | The report names every failed row and every rule without evidence. | Report shape. | Presentation. | V3 test. |
