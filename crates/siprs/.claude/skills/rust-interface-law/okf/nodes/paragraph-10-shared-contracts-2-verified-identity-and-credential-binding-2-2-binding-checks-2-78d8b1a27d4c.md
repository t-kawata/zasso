---
type: Paragraph
id: paragraph/10-shared-contracts-2-verified-identity-and-credential-binding-2-2-binding-checks/2/78d8b1a27d4c
phase: contract
delivery: reference
applies_to: all
requires: []
references: []
content_sha256: 78d8b1a27d4c6711bc875f392160356a5d1a69ff21ab187d23821a323a9a159f
source: docs/archive/IMPLEMENTATION-SPEC/10-CONTRACTS.md
---
A verified REST identity cannot be reused with a WebSocket audience. A session
ticket redeemed for WebSocket creates a **new binding** with the WebSocket
interface and the WebSocket audience; the ticket's redemption deadline and the
connection's authentication expiry are separate values.
