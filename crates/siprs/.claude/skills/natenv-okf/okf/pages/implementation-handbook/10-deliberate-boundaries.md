---
type: "Page"
title: "10. Deliberate boundaries"
description: "Not emulated by this baseline: every vendor NAT/ALG; arbitrary general EIF/ADF/APDM allocator; automatic"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-12"
    title: "10. Deliberate boundaries"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "d709bd5f0c83991ea1486f578bac916cf81b8735b609e3e8e318fb91476454ef"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "535-547"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/0-status-scope-non-negotiable-truth"
---
## 10. Deliberate boundaries

Not emulated by this baseline: every vendor NAT/ALG; arbitrary general EIF/ADF/APDM allocator; automatic
hairpin; PCP/UPnP; IPv6 firewall/NAT64/464XLAT; actual browser/WebRTC stack; cellular handover/radio/link layer;
real BGP/geographical routing; independent hardware clocks; Internet-scale capacity; production certificate
operations. Add explicit backends/fixtures/qualifiers when product needs them. TCP/UDP real packets and
media payloads work without claiming those extra behaviors. Specifying a feature is not implementing it.

Compose is orchestration, not the NAT specification. Routing/NAT/netem implement network semantics;
qualified probes prove network semantics; real Rust app tests prove product behavior; decoded-reference
oracles and distributions prove declared quality budgets. Preserve these four levels separately.

[^implementation-handbook-12]

[^implementation-handbook-12]: 10. Deliberate boundaries — sources/implementation-handbook.md, lines 535-547.

