---
type: "Page"
title: "14. Packet path and NAT semantics"
description: "A -> observer, single: ```text A 10.78.1.10:42000 -> WG encryption -> published UDP51821 -> ingress-a wg0 decapsulation, same inner source -> LAN-A -> ra SNAT10.77.0.2:mapped ->"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-16"
    title: "14. Packet path and NAT semantics"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "bd9940f26d914d2e9b5c8ae6f70e3218dfda9d25e983797b6607f67ba0590d42"
x-requires: 
  - "pages/pre-okf-original/13-native-firewall-and-cooperative-routing-contract"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "433-449"
x-topic: "pre-okf-original"
---
## 14. Packet path and NAT semantics

A -> observer, single:
```text
A 10.78.1.10:42000 -> WG encryption -> published UDP51821
 -> ingress-a wg0 decapsulation, same inner source
 -> LAN-A -> ra SNAT10.77.0.2:mapped -> observer10.77.0.20:9000
 -> conntrack reverse -> ra route10.78.1/24 via10.77.1.2 -> WG -> A
```
Double: ra source10.77.10.2 then cga source10.77.0.4. Observer sees .4 only; capture ra and cga to prove two translations. B remains .77.0.3. S source10.79.0.10 preserved to WAN observers; WAN nodes route10.79/24 via .77.0.50. S sees client NAT sources, not original private addresses.

Router baseline: invalid drop; established/related accept; declared LAN->WAN sources accept; remaining forward drop; fixed egress-IP SNAT. Does not automatically certify full-cone/symmetric/EIM/EIF. Mapping and filtering are independent measurable properties.

Ingress forward: wg0->LAN only declared lab destinations; LAN->wg0 only its endpoint /32. Underlay output/default route only carries WG/control. NAT routers are not connected to Docker underlay. WAN services cannot default-route to Internet. Container output guard blocks embedded resolver127.0.0.11 and non-lab output; only WireGuard ciphertext carrying fwmark0x77 may use underlay destinations. Numeric-IP baseline; unserved lab DNS10.77.0.53 intentional. No unintended IPv6 inside infrastructure; native IPv6 disabled/restricted or separately scoped to prevent shortcut.

Probe RTT is request/echo duration; not RTP jitter, one-way delay, MOS or calibrated throughput. Tunnel MTU1280 is initial reference, not universal optimum. Fragmentation/PMTUD and carrier bottlenecks are separate measurements.

[^pre-okf-original-16]

[^pre-okf-original-16]: 14. Packet path and NAT semantics — sources/pre-okf-original.md, lines 433-449.

