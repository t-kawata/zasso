---
type: Paragraph
id: paragraph/31-websocket-adapter-5-one-time-ticket/2/7d121ac17faf
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 7d121ac17faf5a21ebf9d6844018321b7ad05a839f4b7ed4131c5d6f2618b108
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
The ticket store implementation lives in `identity-core` behind a `ticket`
feature, for the same sealed-construction reason as the JWT verifier: only code
inside `identity-core` may construct `VerifiedIdentity`.
