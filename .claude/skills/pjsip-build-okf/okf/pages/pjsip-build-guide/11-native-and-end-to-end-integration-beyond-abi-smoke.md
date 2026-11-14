---
type: "Page"
title: "11. Native and end-to-end integration beyond ABI smoke"
description: "Build/library integration acceptance can stop only at desired contract; product phone/SIP correctness requires actual peers. Maintain separate layers: native suite; C probe; bindgen/layout; Rust..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-14"
    title: "11. Native and end-to-end integration beyond ABI smoke"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "1ce578b00e45f1d1e92a41882637004a3d7cb54e9ba63f103bc3beb0552c2a0b"
x-requires: [pages/pjsip-build-guide/10-threading-callbacks-ownership-non-negotiable-ffi-rules]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "389-403"
x-topic: "pjsip-build-guide"
---
## 11. Native and end-to-end integration beyond ABI smoke
Build/library integration acceptance can stop only at desired contract; product phone/SIP correctness requires actual peers. Maintain separate layers: native suite; C probe; bindgen/layout; Rust lifecycle/callback/thread; application protocol/media/security. Null sound uses clock without hardware; not `pjsua_set_no_snd_dev` (detaches different media port/clock relationship). Runtime media test must supply/pump PCM and assert samples, not merely successful INVITE.

Concrete required product fixture specification (implement against actual product API; no fake app interface invented):
1. Peer CLI starts on OS loopback, known ephemeral/fixed reserved test ports; readiness requires protocol success; credentials/certs/audio fixtures hashed.
2. UDP and TCP registration positive/negative; account IDs distinguish all events; unregister one account leaves other active; no callbacks after destroyed account/session.
3. Two local endpoints or local PBX: INVITE/180/183+SDP/200/ACK/BYE; rejected call/timeout/CANCEL/re-INVITE; exact terminal event and resource cleanup.
4. Deterministic PCM -> selected PCMU/PCMA/Opus -> RTP send/receive -> decoded PCM nonempty/sample count/energy within codec tolerance; DTMF required inband/INFO/RFC4733 tested separately; early media before200.
5. TLS: local CA valid hostname positive; wrong hostname/untrusted/expired certificates negative; capture backend-specific PJ status/log; a generic failed connect without live peer positive-control is not cert-verification proof. Test embedded-NUL SAN only in isolated regression after known fix; fresh2.17 must not be promoted based on ordinary positive test.
6. SRTP: actual negotiated required mode, encrypted packet evidence, mismatched key/policy negative; compile PJMEDIA_HAS_SRTP=1 not negotiation proof.
7. ICE/STUN/TURN: controlled local topology, restart/receive regression for advisory; SLIRP alone not every NAT model. Protected peer/auth/cert material; loopback initial tests avoid QEMU RTP forwarding pitfalls.
8. Cancel/timeouts/shutdown: stop all native/peer processes, bounded queues, no stale callbacks/use-after-free; loop soak under release; ASan/UBSan diagnostic variant where compiler supports, FFI under Miri not direct substitute.

Do not expose pristine2.17 to arbitrary SIP/RTP/registrars. Trusted local peer fixtures only until security approval. Fixed port conflicts fail readiness, not auto-connect unknown service. Windows/headless audio backend tests may enumerate0 devices; that is not failure of null-clock library smoke nor proof physical backend works. Device/permission/hotplug GUI app tests are independent of this library build contract.

[^pjsip-build-guide-14]

[^pjsip-build-guide-14]: 11. Native and end-to-end integration beyond ABI smoke — sources/pjsip-build-guide.md, lines 389-403.

