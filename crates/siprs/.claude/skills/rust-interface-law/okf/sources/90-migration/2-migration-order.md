---
type: "Section"
title: "2. Migration Order"
description: "```text"
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-2-migration-order"
    title: "2. Migration Order"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "48-72"
---
## 2. Migration Order

```text
0. Pin spec_version and record baseline behavior tests
1. Add shared contract crates
2. Add identity crates
3. Create the operation catalog
4. Map existing crates to roles
5. Introduce the dispatcher and operation authorization
6. Add the conformance crate and a minimal matrix
7. Adopt only the interface profiles the project needs
   (recommended order within the selected set:
    REST → WebSocket → CLI → gRPC → MCP → A2A)
8. Remove duplicate implementations and forbidden edges
9. Add further interfaces when needed
10. Verify, then retire the old paths
```

A project is not required to adopt every interface. The order is a
recommendation for the profiles the project selects; any subset is valid. Each
step ends with a conformance result. A step that cannot show a verdict is not
complete.

---

