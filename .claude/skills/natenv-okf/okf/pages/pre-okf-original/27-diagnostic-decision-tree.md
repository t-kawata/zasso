---
type: "Page"
title: "27. Diagnostic decision tree"
description: "27. Diagnostic decision tree"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-29"
    title: "27. Diagnostic decision tree"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "836a2073ed0a1eedf0b356fff68d6da275593c65f2f29dfd3bff64573b98a0c9"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "739-759"
x-topic: "pre-okf-original"
---
## 27. Diagnostic decision tree

|Observed boundary|Next investigation|
|---|---|
|VM stopped|hypervisor state/start; resources/image|
|guest exec fails|credential/agent/user-session/keychain, not NAT|
|WG no handshake|Endpoint reachability/publish/firewall/key pairing/clock|
|handshake but no inner send|SUT bind/routes/AllowedIPs/native firewall|
|ingress wg inner present, LAN absent|ingress routes/forward/counters|
|RA LAN present, WAN absent|router policy/route/rp_filter/current fault|
|WAN present, server absent|server route/listener/firewall/advertisement|
|server reply, RA WAN reply, LAN absent|conntrack/NAT reverse/filter|
|ingress WG TX, native no data|peer selector/native route/firewall|
|SIP success, no RTP|SDP/RTP range/slot/codec|
|RTP present, PCM wrong|decode/crypto/stimulus/loopback/recording|
|P2P success, path unknown|product telemetry + relay/router byte evidence|

Capture facts before mutation. One configuration change per hypothesis. Collect stdout/stderr/exit at every boundary. Repair narrowest failing layer, not automatic full reinstall. If state uncertain after fault, bounded recreation is valid; preserve failed-run evidence first.

Mac startup errors: inspect keychain and Virtualization log. `tart ip` failure: DHCP identifier/lease resolver before assigning random addresses. Carrier relay error: front allowlist, host reachability, infra IP changed, UDP publish; inner NAT not yet implicated. Windows Direct failure: host privilege/guest credential/guest OS compatibility/running state; guest IP firewall irrelevant to Direct.

[^pre-okf-original-29]

[^pre-okf-original-29]: 27. Diagnostic decision tree — sources/pre-okf-original.md, lines 739-759.

