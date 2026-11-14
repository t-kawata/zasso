---
type: "Rule"
title: "CONF-19 — No interface can bypass operation authorization."
description: "No interface can bypass operation authorization."
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "conf-19"
    title: "CONF-19"
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
x-rule-id: "CONF-19"
x-source-part: "Part III.12"
x-source-span: "182-182"
x-verification: "V3 test."
---
# CONF-19

No interface can bypass operation authorization.

| Field | Value |
|---|---|
| Class | P |
| Applies to | conformance |
| Parent | CONF |
| Source part | Part III.12 |
| Verification | V3 test. |
| Enforcement | cargo test -p <project>-conformance |

[9. Security Proofs](../../sources/part-iii-12/9-security-proofs.md)

## Related

- [APP-01 — A project MUST declare its profiles and MUST list every unimplemented interfa...](../o/app-01.md)
- [ARC-01 — Each crate MUST have one primary runtime role from §3.1. Additional roles (`t...](../c/arc-01.md)
- [CONF-20 — An adapter cannot construct `VerifiedIdentity`.](conf-20.md)
- [CONF-21 — The trusted constructor is not reachable from adapter crates; allowed call si...](conf-21.md)
- [CONF-22 — A compile-fail test is not treated as a general proof of non-bypass.](conf-22.md)
- [CONF-23 — Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are auth...](conf-23.md)

[^conf-19]: sources/EXPERT-REVIEW-PACKAGE.md

