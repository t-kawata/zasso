---
type: "Page"
title: "2. Files; exact topologies; placement"
description: "`compose.single.yml`, `compose.double.yml`, `compose.private.yml`: complete standalone files; no cross-file"
sources: 
  - resource: "sources/implementation-handbook.md"
    id: "implementation-handbook-4"
    title: "2. Files; exact topologies; placement"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "603f68ec9d6fa03cfc0d7bafaa0528a8a143c8c9d9454373e57bbb38c561a84c"
x-source-alias: "sources/implementation-handbook.md"
x-source-span: "73-142"
x-topic: "implementation-handbook"
x-requires: 
  - "pages/implementation-handbook/1-host-contract-safety-preparation"
---
## 2. Files; exact topologies; placement

`compose.single.yml`, `compose.double.yml`, `compose.private.yml`: complete standalone files; no cross-file
network merge assumptions. Use exactly one as base. `lab` chooses via LAB_VARIANT=single|double|private;
project name natlab-${LAB_VARIANT}. Every interface determined by assigned IP, never guessed eth0/eth1.

Address plan:

| Domain | Subnet | Roles |
|---|---|---|
| WAN | 10.77.0.0/24 | ra=.2 (single/private); rb=.3; cga=.4 (double); pbx=.10 (single/double); obs1=.20; obs2=.21; turn=.30; optional iroh=.40 |
| LAN-A | 10.77.1.0/24 | ra=.1; a=.10; pbx=.20 (private only) |
| LAN-B | 10.77.2.0/24 | rb=.1; b=.10 |
| Transit-A | 10.77.10.0/24 | cga=.1; ra=.2 (double only) |

All Docker IPAM gateways .254 deliberately UNASSIGNED using inhibit_ipv4=true; node.sh deletes Docker's
default and installs GW. Internal bridge + no bridge gateway + no masquerade prevent normal host egress;
independent bypass test still mandatory. Namespaces drop outbound non-lab IPv4 and all non-loopback IPv6;
Compose disables IPv6. Docker embedded resolver 127.0.0.11 blocked explicitly; no accidental Internet DNS
proxy. /etc/resolv.conf points to unserved 10.77.0.53; use numeric IPs or explicit /etc/hosts. Tests requiring
DNS must add lab DNS, not host/public resolver. SUT sidecars have separate /etc/hosts/resolv.conf: supply
`extra_hosts`/DNS explicitly; do not assume helper container files are inherited.

Patterns:

```
single:  a--ra--WAN--rb--b; WAN:pbx,turn,obs1,obs2,[iroh]
double:  a--ra--transit--cga--WAN--rb--b; WAN services unchanged
private: a,pbx--ra--WAN--rb--b; WAN:turn,obs1,obs2,[iroh]
```

Single baseline:
```sh
LAB_VARIANT=single ./lab up
LAB_VARIANT=single ./lab smoke
```
Double: first tear down single; archive artifacts; then:
```sh
LAB_VARIANT=double ./lab up
LAB_VARIANT=double ./lab smoke
```
Double expectation: observer sees a as 10.77.0.4, not 10.77.10.2/10.77.1.10. Capture ra AND cga to establish
two translations; observer alone sees only composite behavior. Third+ NAT: clone transit/router pattern,
unique subnet, explicit next-hop, nested source CIDR, exact egress-IP assertions; not extra endpoint interfaces.
Overlapping private LAN addresses may be tested in separate bridges; adapt hardcoded plan/expectations first.

Private PBX: separate generated pjsip.private.conf, no shared-file mutation:
```sh
LAB_VARIANT=private ./lab up
LAB_VARIANT=private ./lab exec ra /lab/private-pbx.sh
LAB_VARIANT=private ./lab smoke
```
PBX=10.77.1.20, public facade=10.77.0.2. a uses registrar 10.77.1.20; b uses 10.77.0.2. Helper installs
UDP/TCP5060 and UDP10000:10199 DNAT + exact inbound forwarding; public address advertisements set in both
PBX transports. Port-preserving RTP mapping. Run helper ONCE after recreation; duplicate invocations append
rules. NAT-state-reset/capture required when changing. Hairpin deliberately NOT implemented: a using public
facade is a negative hairpin case, not equivalent to b's outside-in case. Infrastructure smoke does NOT
certify private-PBX signaling/media. Product-specific Rust test must assert registration/call/media here.

Asterisk config: password-auth endpoints1001/1002, ulaw/alaw, media anchored (`direct_media=no`), symmetric
RTP, force_rport, rewrite_contact; RTP10000:10199; dial1001/1002; Echo600. No unsolicited Internet access.
PBX public operation requires no external_* rewrite; private transport has explicit local_net/external_*
plus actual DNAT. Address advertising never opens NAT. Reference lacks SIP TLS/video negotiation: add
transport/codec fixtures and assertions; do not count audio-only success as video coverage. [web:24]

TURN: WAN10.77.0.30:3478 UDP/TCP, realm lab, lab/lab-secret, relay UDP/TCP50000:50199, explicit auth.
No TLS/DTLS in baseline. Deliberately closed-lab private peer addresses; never publish this configuration.
TURN is not SIP signaling, not an iroh relay, not a generic transparent proxy. Every protocol must actually
implement the relevant allocation/relay client. TCP-to-TURN is not TCP relaying to peer. [web:44][web:92]

[^implementation-handbook-4]

[^implementation-handbook-4]: 2. Files; exact topologies; placement — sources/implementation-handbook.md, lines 73-142.

