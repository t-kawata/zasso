---
type: Paragraph
id: paragraph/32-cli-adapter-2-dependencies/1/944297402280
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: 944297402280e97d55e0845396c84cc30ed7180227db1faf2e35cfcccd53399a
source: docs/archive/IMPLEMENTATION-SPEC/32-CLI.md
---
`*-cli` MUST NOT depend on `*-rest`, `*-grpc`, `*-websocket`, `*-mcp`, or
`*-a2a`. It may speak the protocol directly or use a generated client module.
