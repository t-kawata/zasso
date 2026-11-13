---
type: Table
id: table/31-websocket-adapter-7-connection-state/1/eb7deadb7415
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: eb7deadb7415d49d897bc0a3f99de602bce984713d912492f9844c22dec7f641
source: sources/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-06 | A successful upgrade is not permanent authentication. | Expiry check. | Re-auth policy. | V3 expiry test. |
| WS-07 | On expiry, the server either rejects new requests and requests re-auth, or closes with a policy code. | Behavior is explicit. | Choice per config. | V3 test. |
| WS-08 | Expired connections MUST NOT execute new operations. | Rejection. | — | V3 test. |
| WS-09 | Connection state transitions are explicit; illegal transitions are rejected. | State machine. | Transition table. | V3 test. |
