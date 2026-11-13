---
type: Paragraph
id: paragraph/32-cli-adapter-6-modes-6-2-remote-mode/3/fd1e9916db9b
phase: adapter
delivery: reference
applies_to: cli
requires: []
references: []
content_sha256: fd1e9916db9bbade124d04ca9d82cb15cae4a88248b94b8e35759733403b7a55
source: sources/32-CLI.md
---
The CLI remote client is a **protocol client**, not an interface adapter. It may
speak REST or gRPC over the network. IF-06 forbids one adapter crate from
depending on another adapter crate; it does not forbid a client from calling a
server.
