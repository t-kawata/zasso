---
type: "Section"
title: "5. Completeness"
description: "Every implemented interface × operation MUST have a section containing:"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-16/5-completeness"
    title: "5. Completeness"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-16/5-completeness"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "6977-6977"
---
## 5. Completeness

Every implemented interface × operation MUST have a section containing:

- operation ID, summary, and description;
- authentication requirement (`required`/`anonymous`) and required scopes;
- request and response schema, required/optional fields, enums, and examples;
- error categories and stable error codes;
- idempotency mode and replay semantics;
- streaming mode and lifecycle (items, EOF, cancel, backpressure), when applicable;
- authorization target, preconditions, postconditions, and failure/compensation;
- interface-specific invocation:
  - REST: method, path, status, headers;
  - WebSocket: envelope, operation ID, stream messages;
  - CLI: command, flags, stdin/stdout, exit codes;
  - gRPC: service, method, protobuf fields, stream mode, metadata;
  - MCP: tool name, applicability, auth/result representation;
  - A2A: skill, task, artifact, task operations, auth;
- conformance ID.

A missing operation, interface, field, error category, auth statement, or
example is a build failure.

---

## 5.1 Validation Constraints

