---
type: "Section"
title: "5. Custom Rules"
description: "Custom rules MUST carry:"
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "47-validation-5-custom-rules"
    title: "5. Custom Rules"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/47-VALIDATION.md"
x-source-span: "172-198"
---
## 5. Custom Rules

Custom rules MUST carry:

| Field | Meaning |
|---|---|
| `id` | Stable rule identifier. |
| `check` | Rust validation function. |
| `fields` | Fields the rule observes. |
| `description` | English explanation used in documentation. |
| `code` | Stable error code. |
| `when` | Optional applicability condition, with an English description. |

A custom rule without a description is a definition error. The generator does
not invent a description from the function name or body.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-07 | Custom rules require `id`, `check`, `fields`, `description`, and `code`. | Required set. | Function body. | V1 macro check; V3 test. |
| VAL-08 | Conditional rules require `when` and an English condition description. | Required set. | Condition expression. | V1/V3. |
| VAL-09 | A custom rule without a description fails compilation. | Fail-closed. | — | V3 compile-fail test. |
| VAL-10 | The runtime and the descriptor use the same `check` function and `code`. | Single source. | — | V3 test. |

---

