---
type: Table
id: table/31-websocket-adapter-11-fixed-and-open/1/4bde8d69af8e
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 4bde8d69af8e67244f26359f6db45c9ba7d55c92379f4f1d863bc4ccd4150d21
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
| Fixed | Open |
|---|---|
| Crate layout, router, upgrade path, ticket header. | Ticket storage and crypto. |
| Ticket properties and single-use semantics. | Ticket length and TTL within the range. |
| Envelope shape and correlation. | Payload schemas (from the catalog). |
| Connection state machine and expiry behavior. | Re-auth vs close policy. |
| Per-resource FIFO; no global order. | Queue implementation. |
| Close code table and cleanup obligation. | Reason text and resource policy. |
| No handler calls; dispatcher only. | Middleware and instrumentation. |
