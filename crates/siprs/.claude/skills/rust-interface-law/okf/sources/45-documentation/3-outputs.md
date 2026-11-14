---
type: "Section"
title: "3. Outputs"
description: "```text"
sources: 
  - resource: "sources/45-DOCUMENTATION.md"
    id: "45-documentation-3-outputs"
    title: "3. Outputs"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/45-DOCUMENTATION.md"
x-source-span: "44-64"
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

