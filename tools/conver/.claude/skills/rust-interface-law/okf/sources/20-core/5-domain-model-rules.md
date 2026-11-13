---
type: "Section"
title: "5. Domain Model Rules"
description: "| ID | Rule | Fixed | Open | Verification |"
sources: 
  - resource: "sources/20-CORE.md"
    id: "20-core-5-domain-model-rules"
    title: "5. Domain Model Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/20-CORE.md"
x-source-span: "93-109"
---
## 5. Domain Model Rules

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| CORE-01 | Every aggregate with a lifecycle has one root type and one state enum. Value objects and stateless aggregates are exempt. | Root and state are explicit when a lifecycle exists. | Fields, variants, and behavior. | V1 types; V4 review. |
| CORE-02 | Illegal states are unrepresentable. A state transition returns `Result<NextState, DomainError>`. | Transition returns a result. | Transition table. | V1; V3 transition tests. |
| CORE-03 | Value objects validate on construction. | Constructors return `Result`. | Validation rules. | V3 test. |
| CORE-04 | IDs are typed newtypes; a raw `u64` or `Uuid` is not used as an entity ID across boundaries. | Newtype per aggregate. | Underlying representation. | V1. |
| CORE-05 | Time is injected through `Clock`; `Utc::now()` is forbidden in core. | Port use. | Clock implementation. | V2 scan; V3 test. |
| CORE-06 | Randomness and ID allocation go through `IdGenerator`. | Port use. | Generator implementation. | V2 scan; V3 test. |
| CORE-07 | Domain errors are typed and carry a stable code. | `DomainError` shape. | Code set. | V1; V3 test. |
| CORE-08 | Core does not perform I/O. | No I/O imports. | — | V2 import scan. |
| CORE-09 | Core does not serialize wire envelopes or know protocol status codes. | No transport types. | Serde derives on domain values are allowed. | V2 scan. |
| CORE-10 | Domain events are values; publication happens outside core. | Event type shape. | Event set. | V1; V3 test. |

---

