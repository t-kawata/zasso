---
type: "Section"
title: "5. One-Time Ticket"
description: "The ticket service is a shared operation, `auth.session_ticket.issue`, exposed by"
sources: 
  - resource: "sources/EXPERT-REVIEW-PACKAGE.md"
    id: "part-iii-7/5-one-time-ticket"
    title: "5. One-Time Ticket"
generated: 
  by: "build-law-skill"
  at: "2026-11-14"
verified: 
  - by: "human:law-review"
    at: "2026-11-14"
status: "stable"
x-coverage-path: "part-iii-7/5-one-time-ticket"
x-document: "sources/EXPERT-REVIEW-PACKAGE.md"
x-source-span: "4224-4224"
---
## 5. One-Time Ticket

The ticket service is a shared operation, `auth.session_ticket.issue`, exposed by
at least one authenticated interface of the project (for example REST, gRPC, or
CLI). A WebSocket-only deployment may expose it through a minimal authenticated
entry point; it is not required to implement REST or gRPC. The WebSocket crate
does not issue tickets itself; it redeems them through `SessionTicketStore`.

```rust
pub struct Ticket {
    pub value: secrecy::SecretString,
    pub redeem_before: std::time::SystemTime,
}

pub trait SessionTicketStore: Send + Sync {
    fn issue(
        &self,
        identity: &VerifiedIdentity,
        audience: Audience,
        ttl: std::time::Duration,
    ) -> Result<Ticket, AuthenticationError>;

    /// Returns a new identity whose binding has the WebSocket interface,
    /// the WebSocket audience, and a fresh connection deadline.
    fn redeem(&self, ticket: &str) -> Result<Arc<VerifiedIdentity>, AuthenticationError>;
}
```

The ticket store implementation lives in `identity-core` behind a `ticket`
feature, for the same sealed-construction reason as the JWT verifier: only code
inside `identity-core` may construct `VerifiedIdentity`.

The ticket's `redeem_before` is the **redemption deadline**. The redeemed
identity's `binding.expires_at` is the **connection authentication deadline**.
They are distinct values and must not be conflated.

Rules:

| ID | Rule | Fixed | Open | Verification |
|---|---|---|---|---|
| WS-01 | The ticket is random, hashed at rest, single-use, and short-lived (30 seconds). | Properties. | Length and storage. | V3 test. |
| WS-02 | The ticket is bound to the subject, audience, and scopes it was issued for. | Binding. | Extra claims. | V3 test. |
| WS-03 | A redeemed ticket cannot be redeemed again. | Single use. | — | V3 test. |
| WS-04 | The upgrade is rejected before the socket is accepted if redemption fails. | Rejection point. | Error detail. | V3 test. |
| WS-05 | The ticket is sent in a header, never in a query parameter. | Transport. | Header name. | V3 test. |

---

## 6. Envelope

## Rules in this section

- [WS-01 — The ticket is random, hashed at rest, single-use, and short-lived (30 seconds).](../../rules/c/ws-01.md)
- [WS-02 — The ticket is bound to the subject, audience, and scopes it was issued for.](../../rules/c/ws-02.md)
- [WS-03 — A redeemed ticket cannot be redeemed again.](../../rules/c/ws-03.md)
- [WS-04 — The upgrade is rejected before the socket is accepted if redemption fails.](../../rules/c/ws-04.md)
- [WS-05 — The ticket is sent in a header, never in a query parameter.](../../rules/c/ws-05.md)

