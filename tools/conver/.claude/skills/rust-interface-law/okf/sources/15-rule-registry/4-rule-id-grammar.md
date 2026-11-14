---
type: "Section"
title: "4. Rule ID Grammar"
description: "```text"
sources: 
  - resource: "sources/15-RULE-REGISTRY.md"
    id: "15-rule-registry-4-rule-id-grammar"
    title: "4. Rule ID Grammar"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/15-RULE-REGISTRY.md"
x-source-span: "497-506"
---
## 4. Rule ID Grammar

```text
^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*-[0-9]{1,3}$
```

IDs are permanent. A removed rule keeps its ID and is marked `REMOVED`; IDs
are never reused. Detailed rules may reference a parent rule, but they must
not reuse the parent ID for a different obligation.

