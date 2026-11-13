---
type: List
id: list/34-mcp-adapter-10-conformance-obligations/1/cf2084ddd887
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: cf2084ddd887f4f5aef5f65202cc733a43c5f194238e2b78c9dc71bf3c55b181
source: sources/34-MCP.md
---
1. Every applicable operation has a tool; every tool maps to one operation.
2. Tool input/output schemas match the operation types.
3. Unauthenticated requests receive the spec-required challenge.
4. A token for another audience is rejected.
5. No token passthrough to a downstream API.
6. Every error category maps; no secrets in details.
7. No business state in MCP tables.
8. No direct handler call; dispatcher only.
9. `cargo test -p <project>-mcp` and `cargo clippy -p <project>-mcp -- -D
   warnings`.
10. The conformance report names `MCP-01` through `MCP-21`.
