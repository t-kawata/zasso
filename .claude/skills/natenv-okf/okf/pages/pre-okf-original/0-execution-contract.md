---
type: "Page"
title: "0. Execution contract"
description: "Mission: run actual Windows/macOS/Linux application binaries against real IP packets traversing a closed, configurable WAN/NAT dataplane inside one development PC. Include native clients, native"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-2"
    title: "0. Execution contract"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "9af18087120079d155b14b6d0a01829623224a9f84fba7318e3741cbe06c0ff8"
x-requires: 
  - "pages/pre-okf-original/preamble"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "5-22"
x-topic: "pre-okf-original"
---
## 0. Execution contract

Mission: run actual Windows/macOS/Linux application binaries against real IP packets traversing a closed, configurable WAN/NAT dataplane inside one development PC. Include native clients, native application servers, native bootstrap/discovery servers, native relay servers. Keep Asterisk, coturn, routers, observers, tunnel ingress on Ubuntu containers. No substitution of Linux builds for Windows/macOS product validation; no GUI/audio-device/manual-listening oracle.

Separation:
- Product implementation: real target OS, target ABI, native socket/TLS/media implementation.
- Node isolation: Linux network namespace; Windows/macOS same-OS VM when independent network endpoints are required.
- Network semantics: Ubuntu kernel routing, nftables, conntrack, tc/netem.
- Connection carrier: WireGuard between native endpoints and Ubuntu ingress; encrypted underlay distinct from inner experimental traffic.
- Control: host agent, hypervisor CLI, guest command RPC, infrastructure SSH/Docker CLI; independent of experimental WAN availability.
- Evidence: application events, decoded payload, namespace packets/counters, node state, build/configuration provenance.

Initial success criterion: A and B behind independent NATs; S in routed WAN server segment; real UDP/TCP exchange; selective A-router cut stops A only; OOB remains usable; restoration recovers. Advanced NAT profiles/media quality/soak follow, not prerequisites for starting construction.

Status vocabulary: IMPLEMENTED, STATIC_CHECKED, RUN_PASS, RUN_FAIL, NOT_RUN, UNSUPPORTED, INPUT_REQUIRED, HUMAN_ACTION_REQUIRED, REBOOT_REQUIRED. Scope every verdict. A supplied script is not an executed result. Missing optional coverage does not erase valid infrastructure evidence; missing required product coverage cannot become release PASS.

Safety: dedicated lab directories/VMs; rootful Docker access treated as host-administrator authority; privileged setup limited to network construction. Run product binaries unprivileged. No privileged containers, host-network containers, Docker-socket mounts into SUTs, host-wide firewall flush, indiscriminate route deletion, global prune, public fallback, production credentials, secret-key collection. Trust assumptions explicit: cooperative SUT with configurable bind/bootstrap/relay/candidate policy; hostile arbitrary-binary containment is a separate hardening scope.

[^pre-okf-original-2]

[^pre-okf-original-2]: 0. Execution contract — sources/pre-okf-original.md, lines 5-22.

