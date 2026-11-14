---
type: "Section"
title: "3. Outputs"
description: "```text"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-16/3-outputs"
    title: "3. Outputs"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-16/3-outputs"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6937-6937"
---
## 3. Outputs

```text
docs/generated/
├── INDEX.md
├── rest/
│   ├── openapi.json
│   ├── REFERENCE.md
│   └── swagger/              # optional static Swagger UI
├── websocket/REFERENCE.md
├── cli/REFERENCE.md
├── grpc/REFERENCE.md
├── mcp/REFERENCE.md
└── a2a/REFERENCE.md
```

Only the profiles present in `RULES-PROFILE.toml` are generated. A missing
reference for an implemented profile is a build failure.

---

## 4. Pipeline

