---
type: CodeBlock
id: codeblock/90-migration-2-migration-order/1/f10556f9d68b
phase: review
delivery: must
applies_to: all
requires: []
references: []
content_sha256: f10556f9d68b5fc197cee78d0aadb6ce5873d1843b7e727c761e8e6cb41aa1cd
source: docs/archive/IMPLEMENTATION-SPEC/90-MIGRATION.md
---
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
