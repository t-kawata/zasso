---
type: "Section"
title: "9. Security Proofs"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-12/9-security-proofs"
    title: "9. Security Proofs"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-12/9-security-proofs"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "5508-5508"
---
## 9. Security Proofs

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CONF-19 | No interface can bypass operation authorization. | Bypass test. | Technique. | V3 test. |
| CONF-20 | An adapter cannot construct `VerifiedIdentity`. | Compile-fail test. | — | V1; V3. |
| CONF-21 | The trusted constructor is not reachable from adapter crates; allowed call sites are audited. | Public API audit. | — | V2 scan; V4 review. |
| CONF-22 | A compile-fail test is not treated as a general proof of non-bypass. | Explicit limitation. | — | V4 review. |
| CONF-23 | Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are authorized by the adapter; business resources are not. | Boundary. | — | V3 test. |

---

## 10. Idempotency, Transactions, and Recovery

## Rules in this section

- [CONF-19 — No interface can bypass operation authorization.](../../rules/p/conf-19.md)
- [CONF-20 — An adapter cannot construct `VerifiedIdentity`.](../../rules/p/conf-20.md)
- [CONF-21 — The trusted constructor is not reachable from adapter crates; allowed call si...](../../rules/p/conf-21.md)
- [CONF-22 — A compile-fail test is not treated as a general proof of non-bypass.](../../rules/p/conf-22.md)
- [CONF-23 — Protocol-owned resources (WS subscriptions, A2A tasks, MCP sessions) are auth...](../../rules/p/conf-23.md)

