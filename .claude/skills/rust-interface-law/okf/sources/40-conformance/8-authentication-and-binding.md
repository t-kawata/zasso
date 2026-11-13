---
type: "Section"
title: "8. Authentication and Binding"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-8-authentication-and-binding"
    title: "8. Authentication and Binding"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "165-177"
---
## 8. Authentication and Binding

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-13 | Every required interface rejects a token for another audience. | Pairwise test. | — | V3 test. |
| CONF-14 | An identity with a mismatched interface or audience binding is rejected. | Binding check. | — | V3 test. |
| CONF-15 | An expired binding is rejected even when the signature is valid. | Expiry check. | — | V3 test. |
| CONF-16 | A session ticket creates a new binding; the ticket redemption deadline and connection expiry are distinct. | Two deadlines. | — | V3 test. |
| CONF-17 | Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized delegation. | Invariant. | Policy. | V3 test. |
| CONF-18 | Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation. | Coverage. | Extra cases. | V3 test. |

---

