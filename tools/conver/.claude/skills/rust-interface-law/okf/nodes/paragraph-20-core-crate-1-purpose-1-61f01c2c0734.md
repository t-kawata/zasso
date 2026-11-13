---
type: Paragraph
id: paragraph/20-core-crate-1-purpose/1/61f01c2c0734
phase: core
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 61f01c2c0734f23c7b6cafbc81187b83042b1358be7b61ff057c1fd63fec0ef0
source: sources/20-CORE.md
---
`*-core` owns the domain model, invariants, value objects, state machines, and
the **ports** through which the domain reaches the outside world. It knows
nothing about HTTP, WebSocket, gRPC, MCP, A2A, CLI, JWT, SSO, or databases.
