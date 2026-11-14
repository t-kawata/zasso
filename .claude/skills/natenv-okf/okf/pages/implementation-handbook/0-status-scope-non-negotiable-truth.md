---
type: "Page"
title: "0. Status; scope; non-negotiable truth"
description: "Reference implementation + operator/build/test specification. Three standalone Compose documents;"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-2"
    title: "0. Status; scope; non-negotiable truth"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "d5a2d5512cc41cbee8d20f3bc7e7c2496b12a1bbed40cebd1be61702866487e3"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "3-26"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/preamble"
---
## 0. Status; scope; non-negotiable truth

Reference implementation + operator/build/test specification. Three standalone Compose documents;
common Dockerfile; namespace routing/NAT; bounded fault injection/capture; dependency-free Rust TCP/UDP
probes and host-side integration tests; Asterisk/coturn configurations (Ubuntu24.04 packages available [web:95][web:101]); optional PJSUA surrogate;
Rust-SUT namespace overlay; pinned-source iroh-relay build/overlay. No GUI/audio hardware required.

Execution status: generated/static-reviewed here; Docker daemon/runtime unavailable here. NOT runtime-certified.
`./lab config`, image build, daemon health, `./lab smoke`, surrogate tests and YOUR Rust-SUT acceptance
are mandatory target-machine gates. Never translate this document into a claim of already-tested binaries.
Existing Rust/PJSIP/iroh application sources, binding ABI, Cargo.lock, peer protocol and quality SLOs were
not supplied: no honest guide can provide their already-working integration adapters. Concrete integration
contracts below; unsupported or unimplemented checks MUST report NOT_RUN/FAIL, never implicit PASS.

Closed IPv4 baseline, Linux kernel dataplane. All runtime bridges internal; no bridge gateway IP assigned;
Docker masquerading disabled. Containers retain their directly-connected routes; defaults replaced by
explicit experimental routers. WAN servers have NO default route. Source/content restrictions implemented
inside namespaces. Agent controls Docker from host; no Docker socket inside containers. No real public
IPs needed. Same-WAN connectivity represents public reachability. Linux conntrack SNAT+APDF-like forwarding
is NOT automatically certified full-cone/symmetric/endpoint-independent behavior. Classify by measurement.

Mechanisms: Compose namespace sharing [web:5]; bridge isolation/options [web:48]; first-packet NAT/conntrack
[web:3]; mapping vs filtering [web:18]; behavior discovery [web:19]; netem constraints [web:20].

[^implementation-handbook-2]

[^implementation-handbook-2]: 0. Status; scope; non-negotiable truth — sources/implementation-handbook.md, lines 3-26.

