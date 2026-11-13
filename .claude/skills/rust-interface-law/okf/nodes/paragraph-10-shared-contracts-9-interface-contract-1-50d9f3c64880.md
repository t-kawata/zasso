---
type: Paragraph
id: paragraph/10-shared-contracts-9-interface-contract/1/50d9f3c64880
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 50d9f3c648800a1208bed9991825931e9df231ba28773915062b99c694a5f6e5
source: sources/10-CONTRACTS.md
---
Adapters authorize **protocol-owned resources** (WebSocket subscriptions, A2A
tasks, MCP sessions) and MUST NOT authorize business resources; business
authorization belongs to the operation. This distinction is explicit.
