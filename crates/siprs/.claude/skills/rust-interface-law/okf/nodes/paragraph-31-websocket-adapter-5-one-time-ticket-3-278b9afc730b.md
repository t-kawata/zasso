---
type: Paragraph
id: paragraph/31-websocket-adapter-5-one-time-ticket/3/278b9afc730b
phase: adapter
delivery: reference
applies_to: websocket
requires: []
references: []
content_sha256: 278b9afc730bbdb0c67dc6656ce7caf2552f886f043ce1c6415a7eb06040418f
source: sources/31-WEBSOCKET.md
---
The ticket's `redeem_before` is the **redemption deadline**. The redeemed
identity's `binding.expires_at` is the **connection authentication deadline**.
They are distinct values and must not be conflated.
