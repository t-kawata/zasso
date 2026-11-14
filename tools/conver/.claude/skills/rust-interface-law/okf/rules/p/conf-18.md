---
type: "Rule"
title: "CONF-18 — Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation."
description: "Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-18"
    title: "CONF-18"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-applies-to: "conformance"
x-enforcement: "cargo test -p <project>-conformance"
x-parent: "CONF"
x-phase: "conformance"
x-requires: [rules/c/arc-01, rules/o/app-01]
x-rule-class: "P"
x-rule-id: "CONF-18"
x-source-part: "Part III.12"
x-source-span: "174-174"
x-verification: "V3 test."
---
# CONF-18

Negative authentication cases include missing claims, future `nbf`, wrong claim types, token version mismatch, and revocation.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[8. Authentication and Binding](../../sources/part-iii-12/8-authentication-and-binding.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-13 — Every required interface rejects a token for another audience.](conf-13.md)
- [CONF-14 — An identity with a mismatched interface or audience binding is rejected.](conf-14.md)
- [CONF-15 — An expired binding is rejected even when the signature is valid.](conf-15.md)
- [CONF-16 — A session ticket creates a new binding; the ticket redemption deadline and co...](conf-16.md)
- [CONF-17 — Delegation preserves `actor` and `on_behalf_of` and rejects unauthorized dele...](conf-17.md)

[^conf-18]: sources/EXPERT-REVIEW-PACKAGE.md

