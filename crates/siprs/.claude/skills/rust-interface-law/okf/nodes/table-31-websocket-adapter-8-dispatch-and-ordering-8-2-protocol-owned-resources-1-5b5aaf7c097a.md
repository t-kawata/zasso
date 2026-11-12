---
type: Table
id: table/31-websocket-adapter-8-dispatch-and-ordering-8-2-protocol-owned-resources/1/5b5aaf7c097a
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 5b5aaf7c097a93058139080740cecb425dec29d66a3daad0db636970ee17c786
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-30 | The adapter authorizes protocol-owned subscriptions and streams against the connection identity. | Adapter auth. | Policy. | V3 test. |
| WS-31 | The adapter MUST NOT authorize business resources; that belongs to the operation. | Boundary. | — | V3 bypass test. |
| WS-32 | A subscription or stream is bound to the connection; disconnect cancels it. | Binding. | Cleanup timing. | V3 test. |
