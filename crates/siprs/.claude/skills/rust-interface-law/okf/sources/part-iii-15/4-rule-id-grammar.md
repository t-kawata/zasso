---
type: "Section"
title: "4. Rule ID Grammar"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-15/4-rule-id-grammar"
    title: "4. Rule ID Grammar"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-15/4-rule-id-grammar"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6874-6874"
---
## 4. Rule ID Grammar

```text
^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]{1,3}$
```

IDs are permanent. A removed rule keeps its ID and is marked `REMOVED`; IDs
are never reused. Detailed rules may reference a parent rule, but they must
not reuse the parent ID for a different obligation.

## 5. Generation

