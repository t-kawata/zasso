---
type: "Page"
title: "16. Topology switching, extra nodes, DNAT"
description: "Switch single->double: stop SUTs; stop captures; collect/archive; endpoint tunnels down; `./lab down`; move compose.json/private/generated into protected run archive; rerun generator `--variant"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-18"
    title: "16. Topology switching, extra nodes, DNAT"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "f0c934899354e62749e213302d3facd8dbfdce65b61d885e5d567b7a202be08a"
x-requires: 
  - "pages/pre-okf-original/15-minimum-path-acceptance"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "492-508"
x-topic: "pre-okf-original"
---
## 16. Topology switching, extra nodes, DNAT

Switch single->double: stop SUTs; stop captures; collect/archive; endpoint tunnels down; `./lab down`; move compose.json/private/generated into protected run archive; rerun generator `--variant double`; distribute fresh node configs; up/tunnels/P01-P05. Do not reuse stale handshake/keys/results.

Third+ stage: new transit prefix and router; explicit upstream next-hop; source allow/SNAT based on packets actually received after preceding SNAT; expected outermost IP; per-stage capture and qualification. Adding a second endpoint NIC is not another NAT stage.

Additional WAN node S2: endpoint10.79.1.10/24; ingress WG10.79.1.1; ingress WAN10.77.0.51; published UDP51824; unique key pair. Add WAN routes10.79.1/24 via.51, extend native AllowedIPs/ingress guard to required10.79 range, inventory and assertions. Outer relay requires matching extra front port. Do not merely copy secret files.

NAT-side server: add dedicated LAN-S/router rs, move ingress-s from WAN to LAN-S, remove old WAN route directly to ingress-s. Public façade=rs WAN IP; DNAT listening/relay ports; product advertisement=public façade. Retaining direct10.79 route defeats NAT placement.

V2 router chain names: `ip labnat pre`, `ip labnat post`, `inet lab forward`. Dedicated-router DNAT pattern:
```sh
nft add rule ip labnat pre iifname "$WANIF" ip daddr "$PUBLIC" udp dport "$PORT" dnat to "$PRIVATE:$PORT"
nft insert rule inet lab forward iifname "$WANIF" ip daddr "$PRIVATE" udp dport "$PORT" counter accept
```
Variables resolved in dedicated router before execution; add TCP separately; use range-preserving DNAT for allocated relay/RTP ports. Addresses/ports in SIP/relay advertisement do not install router rules. Hairpin not automatically implemented; separate case/fixture.

[^pre-okf-original-18]

[^pre-okf-original-18]: 16. Topology switching, extra nodes, DNAT — sources/pre-okf-original.md, lines 492-508.

