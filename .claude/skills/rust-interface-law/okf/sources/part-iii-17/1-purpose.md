---
type: "Section"
title: "1. Purpose"
description: "Validation is declared once on the request type. The same declaration generates:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-17/1-purpose"
    title: "1. Purpose"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-17/1-purpose"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7146-7146"
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

## 2. Declaration Syntax

