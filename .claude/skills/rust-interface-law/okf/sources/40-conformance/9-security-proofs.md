---
type: "Section"
title: "9. Security Proofs"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-9-security-proofs"
    title: "9. Security Proofs"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "178-189"
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

