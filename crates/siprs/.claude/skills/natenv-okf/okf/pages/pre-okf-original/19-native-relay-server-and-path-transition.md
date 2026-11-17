---
type: "Page"
title: "19. Native relay server and path transition"
description: "Default S, separate process/port/log from bootstrap. Actual product relay, not coturn unless product implements TURN. Authentication/identity/ALPN, session lifecycle, per-direction bytes"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-21"
    title: "19. Native relay server and path transition"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "32ebea8ea9231734496ab683b6ef2a103e24ae801861fb6bd935f6bcc5b53138"
x-requires: 
  - "pages/pre-okf-original/18-native-bootstrap-discovery-server"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "537-552"
x-topic: "pre-okf-original"
---
## 19. Native relay server and path transition

Default S, separate process/port/log from bootstrap. Actual product relay, not coturn unless product implements TURN. Authentication/identity/ALPN, session lifecycle, per-direction bytes, queue/backpressure, reconnect reason. Co-location does not imply protocol interchangeability.

Cases:
- R0 listener/auth/basic transfer oracle.
- R1 direct unavailable, relay available -> exact payload hash/sequence success, relay counters increase, no unexpected direct traffic.
- R2 direct+relay unavailable -> finite classified failure.
- R3 established direct then direct-only cut -> relay migration latency/data continuity where supported.
- R4 relay outage during direct -> documented behavior; relay-only fails; recovery after restart.
- R5 stale allocation/session expiry, reconnect, slow receiver, cancellation, half-close, overload.

Blocking all UDP also blocks UDP-based relay. For TCP relay fallback, all-UDP-cut may be valid; otherwise block peer direct destination tuples while allowing relay tuples. Implement filter at priority before established acceptance or existing direct flow survives. Application force-relay flag useful but requires packet/counter corroboration.

Native relay behind NAT: forward control AND data/allocation range; preserve port mapping expected by advertised address. A successful frontend connection does not prove returned relay candidates usable. Qualify traffic from independent NATed client nodes, not two utility sockets in one node.

[^pre-okf-original-21]

[^pre-okf-original-21]: 19. Native relay server and path transition — sources/pre-okf-original.md, lines 537-552.

