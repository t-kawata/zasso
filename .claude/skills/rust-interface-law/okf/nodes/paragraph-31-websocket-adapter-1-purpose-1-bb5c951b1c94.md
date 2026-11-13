---
type: Paragraph
id: paragraph/31-websocket-adapter-1-purpose/1/bb5c951b1c94
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: bb5c951b1c946ef58ba938bc3b9ac143a9eee327df3dbe735fbac844a18caa36
source: sources/31-WEBSOCKET.md
---
`*-websocket` is a thin, long-lived adapter. It authenticates the upgrade with a
one-time session ticket, converts messages to operation invocations, correlates
responses, forwards events and streams, and manages connection state,
backpressure, expiry, and cleanup.
