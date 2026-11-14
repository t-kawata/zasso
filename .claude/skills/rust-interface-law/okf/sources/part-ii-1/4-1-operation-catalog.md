---
type: "Section"
title: "4.1 Operation catalog"
description: "Every project MUST maintain an operation catalog. Each entry MUST contain:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-ii-1/4-1-operation-catalog"
    title: "4.1 Operation catalog"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-ii-1/4-1-operation-catalog"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "651-651"
---
### 4.1 Operation catalog

Every project MUST maintain an operation catalog. Each entry MUST contain:

| Field | Content |
|---|---|
| `operation_id` | Stable dotted ID, for example `account.add`. |
| `types` | Typed `Request` and `Response`. |
| `scope` | `read`, `control`, `admin`, or a project-defined scope. Anonymous operations declare authentication separately. |
| `mode` | `U` unary, `S` server stream, `C` client stream, `B` bidirectional. |
| `preconditions` | Required state and authority. |
| `procedure` | Ordered steps, including authorization and reservation. |
| `failure` | Failure handling and compensation. |
| `postconditions` | Observable result and invariants. |
| `interfaces` | REST, WS, CLI, gRPC, MCP, A2A bindings. |
| `conformance` | Conformance test identifier. |

### 4.2 Envelope

