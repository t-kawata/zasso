---
type: "Page"
title: "3. Address plan: single source of truth"
description: "3. Address plan: single source of truth"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-5"
    title: "3. Address plan: single source of truth"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "d6071ab4cd2f4a844c22ec2cfc53d4782002ce2d8e851a555d6d967a6e4d99d2"
x-requires: 
  - "pages/pre-okf-original/2-architecture-and-placement"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "51-70"
x-topic: "pre-okf-original"
---
## 3. Address plan: single source of truth

|Domain|Prefix|Assignments|
|---|---|---|
|WAN|10.77.0.0/24|ra .2 single; rb .3; cga .4 double; PBX .10; obs .20; obs2 .21; TURN .30; ingress-s .50|
|LAN-A|10.77.1.0/24|ra .1; ingress-a .2|
|LAN-B|10.77.2.0/24|rb .1; ingress-b .2|
|Transit-A|10.77.10.0/24|cga .1; ra .2; double only|
|A tunnel|10.78.1.0/24|ingress WG .1; native A .10|
|B tunnel|10.78.2.0/24|ingress WG .1; native B .10|
|S tunnel/routed WAN|10.79.0.0/24|ingress WG .1; native S .10|
|Docker underlay|172.30.250.0/24|gateway .254; ingress a/b/s .11/.12/.13|
|Hyper-V underlay example|192.168.240.0/24|host .1; Ubuntu .2; Windows B .11; S .12|

Experimental Docker bridge IPAM gateways .254 remain unassigned using inhibit_ipv4. Internal bridges; Docker masquerading disabled. Only transport bridge has normal Docker gateway/NAT. WAN services have no default route; explicit S-prefix route via ingress-s. Ingress is dual-homed underlay/LAN or underlay/WAN, never masquerades inner packets.

Preflight: enumerate host/guest/VPN/Docker routes and interfaces. Reject conflicting prefixes before install. If remapping required, update generator, ingress guards, peer AllowedIPs, endpoint scripts, fixture, acceptance and service advertisements together. No partial textual replacement during a live run.

Published outer UDP: A 51821 -> ingress-a:51820; B 51822 -> ingress-b:51820; S 51823 -> ingress-s:51820. Host/guest WireGuard Endpoint must reach the published address, not an inaccessible Docker bridge address. Private keys unique per node/ingress; /32 peer source authorization server-side.

[^pre-okf-original-5]

[^pre-okf-original-5]: 3. Address plan: single source of truth — sources/pre-okf-original.md, lines 51-70.

