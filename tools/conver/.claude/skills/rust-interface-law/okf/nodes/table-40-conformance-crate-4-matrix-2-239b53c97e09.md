---
type: Table
id: table/40-conformance-crate-4-matrix/2/239b53c97e09
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 239b53c97e098cbc8739e45511ad037a1868aeb9ef047cb00de429e359e04b05
source: sources/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-01 | Every catalog operation appears in the matrix. | Coverage. | Operation set. | V3 matrix test. |
| CONF-02 | Every implemented interface has a driver. | Coverage. | Driver. | V3 test. |
| CONF-03 | Every cell is required or not applicable with a reason. | Cell rule. | Reason. | V3 test. |
| CONF-04 | A profile absent from `RULES-PROFILE.toml` is not a non-applicable cell. | Distinction. | — | V3 test. |
