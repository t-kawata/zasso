---
type: "Section"
title: "11. Per-Operation Specification Template"
description: "Every operation in a project's `SYSTEM-DESIGN.md` MUST use this template."
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/11-per-operation-specification-template"
    title: "11. Per-Operation Specification Template"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/11-per-operation-specification-template"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "897-897"
---
## 11. Per-Operation Specification Template

Every operation in a project's `SYSTEM-DESIGN.md` MUST use this template.

```text
OP-xxx <operation_id>
  Types:          <Request> → <Response>
  Authentication: required | anonymous
  Scope:          read | control | admin (required operations only)
  Mode:           U | S | C | B
  Preconditions:  ...
  Procedure:      ... (prepare: validation/load/authorize; execute: reserve/mutate/commit/outbox)
  Failure:        ... (compensation, forward recovery, isolation, retryability)
  Postconditions: ...
  Interfaces:
    REST:         <METHOD> <path>
    WebSocket:    operation_id = "<operation_id>"
    CLI:          <command>
    gRPC:         <service>/<method>
    MCP:          <tool name>
    A2A:          <skill/task mapping>
  Conformance:    CF_<operation_id>
  Rules:          <rule IDs that need special attention>
```

A missing interface binding MUST be declared as `not applicable` with a reason.
An operation without a conformance identifier is not complete.

---

## 12. Application to Projects

