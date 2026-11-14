---
type: "Section"
title: "8. Streaming and Errors"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/35-A2A.md"
    id: "35-a2a-8-streaming-and-errors"
    title: "8. Streaming and Errors"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/35-A2A.md"
x-source-span: "155-165"
---
## 8. Streaming and Errors

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| A2A-16 | Task updates use the A2A-defined event model, not an ad-hoc envelope. | Event model. | Payload. | V3 test. |
| A2A-17 | Streaming termination distinguishes success, failure, and cancellation. | Distinction. | Detail. | V3 test. |
| A2A-18 | Every operation category has an A2A error mapping. | Coverage. | Detail text. | V3 mapping test. |
| A2A-19 | Error details never contain tokens, secrets, or raw provider responses. | Forbidden. | — | V2 scan; V3 test. |

---

