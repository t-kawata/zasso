---
type: "Section"
title: "5.1 Validation Constraints"
description: "Every input constraint is documented from the `ValidationDescriptor` produced by"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-16/5-1-validation-constraints"
    title: "5.1 Validation Constraints"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-16/5-1-validation-constraints"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "7002-7002"
---
## 5.1 Validation Constraints

Every input constraint is documented from the `ValidationDescriptor` produced by
the shared input macro (Part III.17). The generator does not infer constraints
from implementation code and does not accept a hand-written constraint list.

Each constraint entry includes:

- field name;
- rule kind and parameters (minimum, maximum, length, items, pattern, enum, or
  custom rule ID);
- unit and regex engine when they affect interpretation;
- error code;
- English description;
- applicability condition for conditional custom rules.

Custom rules are rendered as readable English text in every applicable
interface reference, not only in a vendor extension.

---

## 6. English-Only

