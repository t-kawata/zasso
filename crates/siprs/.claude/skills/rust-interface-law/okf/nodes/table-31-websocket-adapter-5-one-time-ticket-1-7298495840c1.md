---
type: Table
id: table/31-websocket-adapter-5-one-time-ticket/1/7298495840c1
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 7298495840c19899f1cb28d8e8cd64c0a89b8f55b7bf1f593d6455acbfdd863b
source: docs/archive/IMPLEMENTATION-SPEC/31-WEBSOCKET.md
---
| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-01 | The ticket is random, hashed at rest, single-use, and short-lived (30 seconds). | Properties. | Length and storage. | V3 test. |
| WS-02 | The ticket is bound to the subject, audience, and scopes it was issued for. | Binding. | Extra claims. | V3 test. |
| WS-03 | A redeemed ticket cannot be redeemed again. | Single use. | — | V3 test. |
| WS-04 | The upgrade is rejected before the socket is accepted if redemption fails. | Rejection point. | Error detail. | V3 test. |
| WS-05 | The ticket is sent in a header, never in a query parameter. | Transport. | Header name. | V3 test. |
