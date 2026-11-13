---
type: Table
id: table/31-websocket-adapter-10-close-codes-and-cleanup/2/31c64331eece
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 31c64331eeceb74e0793654ec4056ebf52f5a44975a5aecf940dbb834d1c7dd0
source: sources/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-19 | Close codes use the table above. | Table. | Reason text. | V3 test. |
| WS-20 | Disconnect cleans up connection-owned subscriptions, streams, and temporary resources. | Cleanup required. | Implementation. | V3 leak test. |
| WS-21 | In-flight operations may complete after disconnect; their results are discarded unless the operation is explicitly cancel-on-disconnect. | Policy explicit. | Per-operation policy. | V3 test. |
| WS-22 | Origin allowlisting is applied before authentication. | Order. | Allowed list. | V3 test. |
