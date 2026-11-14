---
type: "Section"
title: "7. Security"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/35-A2A.md"
    id: "35-a2a-7-security"
    title: "7. Security"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/35-A2A.md"
x-source-span: "143-154"
---
## 7. Security

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-11 | The adopted A2A security scheme is implemented as declared in the agent card. | Scheme declaration and enforcement. | Scheme set. | V3 protocol test. |
| A2A-12 | Tokens are verified by the shared verifier with the A2A audience. | Verification path. | — | V3 test. |
| A2A-13 | A token for another interface is rejected. | Audience isolation. | — | V3 test. |
| A2A-14 | The adapter does not authorize the target; the operation does. | Separation. | — | V3 bypass test. |
| A2A-15 | Secrets and tokens are not written to task state, logs, or errors. | Forbidden. | — | V2 scan; V3 test. |

---

