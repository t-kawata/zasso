---
type: "Documentation"
title: "2.4 Current projects"
description: "- **<project-a>**: core, foundation, ports, operation, conformance, REST, WebSocket,"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-i/2-4-current-projects"
    title: "2.4 Current projects"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-i/2-4-current-projects"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "85-85"
---
### 2.4 Current projects

- **<project-a>**: core, foundation, ports, operation, conformance, REST, WebSocket,
  CLI. No gRPC, MCP, or A2A yet. No root `Cargo.toml` in the current scaffold.
- **<project-b>**: core, operation, conformance, testkit, bootstrap, protocol
  crates, adapters, transports. No interface crates yet.
- **<project-c>**: core, operation, conformance, REST, WebSocket, CLI, gRPC. A
  `SYSTEM-DESIGN.md` with roughly 105 operations. No MCP or A2A yet.
- **Future `<platform>` projects**: expected to follow the same roles, with a
  different operation catalog and domain.

The projects are not yet frozen. This specification is intended to fix their
shared shape before they diverge further.

---

## 3. What You Are Reviewing

