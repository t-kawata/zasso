---
type: "Section"
title: "12. Step 9 — Additional Interfaces (MCP, A2A)"
description: "Add MCP or A2A when the project needs them. They are not gated on REST,"
sources: 
  - resource: "sources/90-MIGRATION.md"
    id: "90-migration-12-step-9-additional-interfaces-mcp-a2a"
    title: "12. Step 9 — Additional Interfaces (MCP, A2A)"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/90-MIGRATION.md"
x-source-span: "248-262"
---
## 12. Step 9 — Additional Interfaces (MCP, A2A)

Add MCP or A2A when the project needs them. They are not gated on REST,
WebSocket, CLI, or gRPC. They are gated on:

1. the operation catalog entries they expose;
2. the authorization and audience binding being proven for those operations;
3. the adopted protocol specification version being recorded;
4. the conformance matrix including the new interface.

MCP and A2A add protocol-specific auth surfaces. They do not change operations,
`VerifiedIdentity`, or business tables.

---

