---
type: "Page"
title: "23. QUIC/iroh/custom P2P specifics"
description: "Use actual locked library version and source; relay/discovery builder names/schema change. For iroh, relay is not coturn. Local relay URL, authenticated endpoint identity, ALPN and candidate policy"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-25"
    title: "23. QUIC/iroh/custom P2P specifics"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "d9ef3d9493cecea4d9807505a641b8d7970339fb91add5ba401fd99fdee6cd26"
x-requires: 
  - "pages/pre-okf-original/22-coturn-stun-turn-tls"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "636-647"
x-topic: "pre-okf-original"
---
## 23. QUIC/iroh/custom P2P specifics

Use actual locked library version and source; relay/discovery builder names/schema change. For iroh, relay is not coturn. Local relay URL, authenticated endpoint identity, ALPN and candidate policy explicit; disable production relays/address lookups/PKARR/DNS/mDNS when excluded. Static ticket transfer bypasses discovery and must be scoped accordingly.

Reference relay on Ubuntu: choose compatible full source commit, inspect repository workspace/package/features/binary/config schema, build `--locked --release` with those actual names; freeze artifact. Do not guess an obsolete monorepo package path. Reference HTTP/dev mode may omit QUIC address discovery/TLS; health endpoint success is not NAT-traversal certification. For TLS/address-discovery production mode inspect listeners and actual protocol response, import local trust correctly.

If relay itself is custom native SUT, run on native S instead of substituting Ubuntu reference service. Distinguish these roles in inventory.

Cases: WAN-direct baseline; A/B NAT; double; direct unavailable; relay-only; both unavailable; direct->relay fallback; relay outage during direct; endpoint restart; NAT reset/rebind; address churn; many streams/datagrams; half-close/cancel/backpressure/slow receiver; ALPN/identity mismatch; duplicate-delivery exclusion; bounded memory. Direct success is conditional on measured NAT behavior, not universal expectation.

Events: node/peer IDs, local/remote tuples, path enum/history, relay URL, transition timestamps, direct/relay bytes, handshake/RTT/loss/congestion data where API exposes it, stream error, app sequence/hash, reconnect cause. If no path counters, instrument crate or corroborate qualified packet/server counters. Low latency and successful connect are not direct-path proof. Encrypted PCAP does not reveal plaintext integrity.

[^pre-okf-original-25]

[^pre-okf-original-25]: 23. QUIC/iroh/custom P2P specifics — sources/pre-okf-original.md, lines 636-647.

