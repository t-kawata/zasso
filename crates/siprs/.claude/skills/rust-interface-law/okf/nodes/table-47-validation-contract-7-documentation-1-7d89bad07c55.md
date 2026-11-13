---
type: Table
id: table/47-validation-contract-7-documentation/1/7d89bad07c55
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 7d89bad07c55a0a1130a3f0cc0878bf2b8e1cdac5c02056de81fb81d37c5c855
source: sources/47-VALIDATION.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-15 | Every field rule appears in every applicable interface's documentation. | Coverage. | Presentation. | V3 completeness test. |
| VAL-16 | Hand-written constraint lists are forbidden; documentation is generated from descriptors. | Source of truth. | — | V2 scan; V3 test. |
| VAL-17 | Custom rules appear as readable English text in every interface reference, not only in an extension field. | Readability. | Formatting. | V3 test. |
| VAL-18 | Validation descriptions, messages, and examples are English-only. | Language. | — | V2 scan; V3 test. |
| VAL-19 | Validation descriptors and generated documentation contain no secrets or sensitive examples. | Secret-free. | — | V2 scan; V3 test. |
| VAL-20 | Generation is deterministic for the same descriptor set and version. | Determinism. | Renderer. | V3 digest test. |
