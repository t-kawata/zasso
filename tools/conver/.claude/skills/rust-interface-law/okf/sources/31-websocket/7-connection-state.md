---
type: "Section"
title: "7. Connection State"
description: "```rust"
sources: 
  - resource: "sources/31-WEBSOCKET.md"
    id: "31-websocket-7-connection-state"
    title: "7. Connection State"
generated: 
  by: "build-law-skill"
  at: "2026-11-13"
verified: 
  - by: "human:law-review"
    at: "2026-11-13"
status: "stable"
x-document: "sources/31-WEBSOCKET.md"
x-source-span: "214-234"
---
## 7. Connection State

```rust
pub enum ConnectionState {
    Connecting,
    Authenticated { identity: Arc<VerifiedIdentity>, expires_at: Instant },
    Expired,
    Closing { code: u16, reason: &'static str },
    Closed,
}
```

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-06 | A successful upgrade is not permanent authentication. | Expiry check. | Re-auth policy. | V3 expiry test. |
| WS-07 | On expiry, the server either rejects new requests and requests re-auth, or closes with a policy code. | Behavior is explicit. | Choice per config. | V3 test. |
| WS-08 | Expired connections MUST NOT execute new operations. | Rejection. | — | V3 test. |
| WS-09 | Connection state transitions are explicit; illegal transitions are rejected. | State machine. | Transition table. | V3 test. |

---

