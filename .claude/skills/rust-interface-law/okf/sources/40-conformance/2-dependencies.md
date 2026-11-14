---
type: "Section"
title: "2. Dependencies"
description: "```toml"
sources: 
  - resource: "sources/40-CONFORMANCE.md"
    id: "40-conformance-2-dependencies"
    title: "2. Dependencies"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-document: "sources/40-CONFORMANCE.md"
x-source-span: "22-45"
---
## 2. Dependencies

```toml
[dependencies]
operation-contract = { workspace = true }
identity-core = { workspace = true }
interface-contract = { workspace = true }

[dev-dependencies]
<project>-core = { workspace = true }
<project>-operation = { workspace = true }
<project>-rest = { workspace = true }        # only if profile rest
<project>-websocket = { workspace = true }   # only if profile websocket
<project>-cli = { workspace = true }         # only if profile cli
<project>-grpc = { workspace = true }        # only if profile grpc
<project>-mcp = { workspace = true }         # only if profile mcp
<project>-a2a = { workspace = true }         # only if profile a2a
```

Dependencies are profile-conditional. A project that implements only MCP does
not depend on REST, WebSocket, CLI, or gRPC.

---

