---
type: "Section"
title: "8. Authentication and Binding"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/8-authentication-and-binding"
    title: "8. Authentication and Binding"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/8-authentication-and-binding"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5495-5495"
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

## 9. Security Proofs

## Rules in this section

- [CONF-13 — Every required interface rejects a token for another audience.](../../rules/p/conf-13.md)
- [CONF-14 — An identity with a mismatched interface or audience binding is rejected.](../../rules/p/conf-14.md)
- [CONF-15 — An expired binding is rejected even when the signature is valid.](../../rules/p/conf-15.md)
- [CONF-16 — A session ticket creates a new binding; the ticket redemption deadline and co...](../../rules/p/conf-16.md)
- [CONF-17 — Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized dele...](../../rules/p/conf-17.md)
- [CONF-18 — Negative authentication cases include missing claims, future `nbf`, wrong cla...](../../rules/p/conf-18.md)

