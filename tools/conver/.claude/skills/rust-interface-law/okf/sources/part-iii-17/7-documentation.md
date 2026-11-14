---
type: "Section"
title: "7. Documentation"
description: "The documentation generator collects every `ValidationDescriptor` and combines"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-17/7-documentation"
    title: "7. Documentation"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-17/7-documentation"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7365-7365"
---
## 7. Documentation

The documentation generator collects every `ValidationDescriptor` and combines
it with the operation catalog and interface bindings.

Outputs:

- REST: OpenAPI standard keywords and a rendered constraint table. Custom rules
  appear in the schema `description`; they are not hidden in a vendor extension.
- WebSocket: payload field constraints per operation.
- CLI: argument and flag constraints.
- gRPC: request message field constraints.
- MCP: tool input constraints.
- A2A: operation input constraints.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| VAL-15 | Every field rule appears in every applicable interface's documentation. | Coverage. | Presentation. | V3 completeness test. |
| VAL-16 | Hand-written constraint lists are forbidden; documentation is generated from descriptors. | Source of truth. | — | V2 scan; V3 test. |
| VAL-17 | Custom rules appear as readable English text in every interface reference, not only in an extension field. | Readability. | Formatting. | V3 test. |
| VAL-18 | Validation descriptions, messages, and examples are English-only. | Language. | — | V2 scan; V3 test. |
| VAL-19 | Validation descriptors and generated documentation contain no secrets or sensitive examples. | Secret-free. | — | V2 scan; V3 test. |
| VAL-20 | Generation is deterministic for the same descriptor set and version. | Determinism. | Renderer. | V3 digest test. |

---

## 8. Fixed and Open

