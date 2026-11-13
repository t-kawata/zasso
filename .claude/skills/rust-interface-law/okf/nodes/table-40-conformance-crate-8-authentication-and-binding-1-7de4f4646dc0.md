---
type: Table
id: table/40-conformance-crate-8-authentication-and-binding/1/7de4f4646dc0
phase: conformance
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 7de4f4646dc036a7085c3f69f829efde36ad0924473a3ccd63454bb31df10d2c
source: sources/40-CONFORMANCE.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-13 | Every required interface rejects a token for another audience. | Pairwise test. | — | V3 test. |
| CONF-14 | An identity with a mismatched interface or audience binding is rejected. | Binding check. | — | V3 test. |
| CONF-15 | An expired binding is rejected even when the signature is valid. | Expiry check. | — | V3 test. |
| CONF-16 | A session ticket creates a new binding; the ticket redemption deadline and connection expiry are distinct. | Two deadlines. | — | V3 test. |
| CONF-17 | Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized delegation. | Invariant. | Policy. | V3 test. |
| CONF-18 | Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation. | Coverage. | Extra cases. | V3 test. |
