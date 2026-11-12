---
type: Paragraph
id: paragraph/34-mcp-adapter-1-purpose/1/40b839eb3952
phase: adapter
delivery: reference
applies_to: mcp
requires: []
references: []
content_sha256: 40b839eb395211a67d1db55d9595c1e76bf724092bfbfcea8c30eaafaab6e095
source: docs/archive/IMPLEMENTATION-SPEC/34-MCP.md
---
`*-mcp` exposes operations as MCP tools. It owns the MCP protocol surface,
including the authorization discovery and challenge required by the adopted MCP
specification. It does not implement business logic and does not forward a
received token to another API.
