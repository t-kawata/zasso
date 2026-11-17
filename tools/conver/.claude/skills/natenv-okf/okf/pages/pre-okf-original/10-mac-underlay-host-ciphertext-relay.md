---
type: "Page"
title: "10. Mac underlay: host ciphertext relay"
description: "Default Tart NAT: guests can reach host service at their default-router address; host services should bind 0.0.0.0 per upstream FAQ. Guest-to-guest direct reachability is not required by this carrier"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-12"
    title: "10. Mac underlay: host ciphertext relay"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "86ede440c65229d0d4aadbf184c3056d4f3c42ece783faf2e902c151830c39ab"
x-requires: 
  - "pages/pre-okf-original/9-mac-infrastructure-and-capacity-selection"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "300-327"
x-topic: "pre-okf-original"
---
## 10. Mac underlay: host ciphertext relay

Default Tart NAT: guests can reach host service at their default-router address; host services should bind 0.0.0.0 per upstream FAQ. Guest-to-guest direct reachability is not required by this carrier design. Host Python relay forwards encrypted WireGuard datagrams only; inner packets remain untouched until Ubuntu ingress.

```text
B WireGuard -> host:51822 -> outer-relay -> Ubuntu:51822
 -> Docker publish -> ingress-b:51820 -> decrypt -> LAN-B -> rb
```

Resolve addresses:
- INFRA_IP: `tart ip wan-infra`; if unresolved, inspect Ubuntu console/SSH/netplan DHCP identity.
- HOST_ROUTER_IP: in native guest, `netstat -nr | awk '/default/{print $2; exit}'`; verify IPv4 result and route context.
- GUEST_CIDR: actual guest underlay subnet, not hard-coded assumption.

Host example; substitute actual values:
```sh
mkdir -p artifacts/transport
python3 scripts/outer-relay.py --bind 0.0.0.0 --infra 192.168.64.3 \
  --allow 192.168.64.0/24 --allow 127.0.0.0/8 \
  >artifacts/transport/relay.log 2>&1 &
echo $! >artifacts/transport/relay.pid
```
Bind0 accepts all host IPv4 interfaces; restrict host firewall and `--allow` to actual lab sources. No Internet port forwarding. Each front port belongs to exactly one endpoint node. Script remembers latest permitted source per port; WireGuard authenticates ciphertext; do not share port across nodes.

Generate native configs with Endpoint=HOST_ROUTER_IP, not INFRA_IP. Docker `--bind` remains infrastructure-local published binding. Host A may also reach its own host-router IP; ensure --allow includes its actual source. Alternative host A Endpoint127.0.0.1 is safe after editing A config only, leaving B/S router IP. Underlay relay stop must stop test traffic while Tart exec and infrastructure SSH remain usable.

Relay is a carrier, not performance-neutral magic: record CPU, socket errors, throughput ceiling. Native packet MTU1280 initially. Outer relay overhead must not be mistaken for experimental-router capacity.

[^pre-okf-original-12]

[^pre-okf-original-12]: 10. Mac underlay: host ciphertext relay — sources/pre-okf-original.md, lines 300-327.

