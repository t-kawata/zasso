---
type: Paragraph
id: paragraph/31-websocket-adapter-5-one-time-ticket/1/f3cadbd2002b
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: f3cadbd2002be6c3bee2bfc248cf937902cc4a0305d109be3fe2e67d6d89b2bf
source: sources/31-WEBSOCKET.md
---
The ticket service is a shared operation, `auth.session_ticket.issue`, exposed by
at least one authenticated interface of the project (for example REST, gRPC, or
CLI). A WebSocket-only deployment may expose it through a minimal authenticated
entry point; it is not required to implement REST or gRPC. The WebSocket crate
does not issue tickets itself; it redeems them through `SessionTicketStore`.
