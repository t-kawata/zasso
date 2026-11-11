---
type: List
id: list/45-documentation-generation-5-completeness/1/be2a76c0db42
phase: docs
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: be2a76c0db421f6b633b5f804d83f982905e238110de70548b5e60f05f180cf1
source: docs/archive/IMPLEMENTATION-SPEC/45-DOCUMENTATION.md
---
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
