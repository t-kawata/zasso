---
type: "Page"
title: "18. Native bootstrap/discovery server"
description: "Default S10.79.0.10, real product port/protocol. A/B register and lookup via S. Ticket/address distribution by host files allowed only for transport isolation fixtures; never discovery acceptance."
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-20"
    title: "18. Native bootstrap/discovery server"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "a31fc79ca4aabb067185e5833beebd58f32eb5f2832e134f4893923add1ec647"
x-requires: 
  - "pages/pre-okf-original/17-product-build-native-dependencies-adapter-contract"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "527-536"
x-topic: "pre-okf-original"
---
## 18. Native bootstrap/discovery server

Default S10.79.0.10, real product port/protocol. A/B register and lookup via S. Ticket/address distribution by host files allowed only for transport isolation fixtures; never discovery acceptance.

Observe: authenticated peer ID, registrations, observed source, advertised candidates/relay, TTL/refresh, lookup hit/miss, expiry, authorization/error, request/byte counts, process resources. Distinguish bootstrap availability from established connection viability.

Cases: normal A/B discovery; unknown peer; bad auth; refresh; expiry; stale candidates; server stop/restart; reconnect after state reset. Product design defines whether existing peer sessions survive bootstrap loss. Record expected behavior before run.

NAT-side bootstrap: use Section16, explicit published façade/DNAT/advertisement. Closed inbound with no traversal mechanism is expected reachability failure, not an infrastructure bug. Distinct discovery backend/local DNS may be added when product requires it; public defaults invalidate closed-lab assumptions.

[^pre-okf-original-20]

[^pre-okf-original-20]: 18. Native bootstrap/discovery server — sources/pre-okf-original.md, lines 527-536.

