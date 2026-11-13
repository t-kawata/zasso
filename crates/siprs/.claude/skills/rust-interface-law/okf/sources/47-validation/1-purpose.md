---
type: "Section"
title: "1. Purpose"
description: "Validation is declared once on the request type. The same declaration generates:"
sources: 
  - resource: "sources/47-VALIDATION.md"
    id: "47-validation-1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/47-VALIDATION.md"
x-source-span: "11-26"
---
## 1. Purpose

Validation is declared once on the request type. The same declaration generates:

1. the runtime validator;
2. the schema used by `utoipa`/`schemars` and the neutral schema registry;
3. the machine-readable `ValidationDescriptor` consumed by documentation.

Validation and `#[schema(...)]` are not written twice. Documentation does not
infer constraints from implementation code.

The mandatory implementation method — macro expansion, runtime types,
`inventory` registration, docgen dumps, and gates — is Part III.18.

---

