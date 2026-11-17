---
type: "Page"
title: "1. Terms, layers, fidelity"
description: "Node: independent IP stack/routing/socket context. Role: process function; client/bootstrap/relay may share a node only when intended. Process count is not node count. WAN/public: locally simulated"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-3"
    title: "1. Terms, layers, fidelity"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "5081fb447bd742672a1944cf35d7517a665012cef92b36e927667fb7417018d8"
x-requires: 
  - "pages/pre-okf-original/0-execution-contract"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "23-30"
x-topic: "pre-okf-original"
---
## 1. Terms, layers, fidelity

Node: independent IP stack/routing/socket context. Role: process function; client/bootstrap/relay may share a node only when intended. Process count is not node count. WAN/public: locally simulated public reachability, not ownership of Internet-routable space. Inner: application packets after WireGuard decapsulation. Outer/underlay: WireGuard UDP carrier over VM/host networking. OOB: management path outside experimental inner routing. SUT: actual product implementation. Oracle: programmatic expected-result evaluator.

Layer order: hypervisor -> underlay -> WireGuard ingress -> experimental routers -> services/peers -> application protocol -> decoded payload/quality. Diagnose in that order. Underlay NAT does not count as an experimental NAT stage: routers classify decapsulated inner tuples. Outer PersistentKeepalive does not refresh inner SIP/RTP/P2P conntrack entries.

Fidelity supplied: native target OS sockets, actual TCP/UDP/QUIC/RTP, Linux packet forwarding/NAT state, actual server implementations, real encode/decode where product supports file media. Fidelity not implied: every consumer-router/ALG behavior, cellular radio, BGP/geography, independent physical oscillators, Ethernet wire preambles/offload checksum behavior, Internet-scale capacity. Add only required fixtures; do not turn limitations into unrelated construction blockers.

[^pre-okf-original-3]

[^pre-okf-original-3]: 1. Terms, layers, fidelity — sources/pre-okf-original.md, lines 23-30.

