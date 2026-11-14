---
type: "Section"
title: "1. Target State"
description: "Every project has the same shape:"
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-1-target-state"
    title: "1. Target State"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "14-47"
---
## 1. Target State

Every project has the same shape:

```text
<project>/
├── RULES-PROFILE.toml
├── SYSTEM-DESIGN.md
├── contract/operation-catalog.toml
├── proto/<project>.v1.proto
└── crates/
    ├── operation-contract/      # shared
    ├── interface-contract/      # shared
    ├── identity-core/           # shared
    ├── identity-jwt/            # shared facade
    ├── identity-local/          # shared
    ├── identity-operation/      # shared
    ├── identity-sso/            # shared, optional
    ├── <project>-core/
    ├── <project>-operation/
    ├── <project>-conformance/
    ├── <project>-rest/
    ├── <project>-websocket/
    ├── <project>-cli/
    ├── <project>-grpc/
    ├── <project>-mcp/
    ├── <project>-a2a/
    └── <project>-assembly/
```

The shared crates are consumed by version. They are not forked per project.

---

