---
type: "Procedure"
title: "EXEC_ASSETS/scripts/node.sh"
description: "Container node startup for routes, WireGuard, and NAT."
sources: 
  - resource: "EXEC_ASSETS/scripts/node.sh"
    id: "exec-asset-scripts-node-sh"
    title: "EXEC_ASSETS/scripts/node.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/node.sh"
x-asset-sha256: "d98b2773c92807497fa78e0b419e394cc18b864244d86781404529f963170263"
x-content-sha256: "5cb6f6701ae61c795c1645d544ca7b41e02fad9d651062245077a1e99776175a"
x-requires: 
  - "pages/pre-okf-original/14-packet-path-and-nat-semantics"
x-source-span: "1-59"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/node.sh

Container node startup for routes, WireGuard, and NAT.

- role: Procedure
- interface: `entrypoint`
- governing section: [14. Packet path and NAT semantics](../pre-okf-original/14-packet-path-and-nat-semantics.md)
- asset hash: `d98b2773c92807497fa78e0b419e394cc18b864244d86781404529f963170263`
- source span: lines 1-59

```bash
#!/bin/sh
set -eu
findif() { ip -o -4 addr show | awk -v a="$1" 'split($4,b,"/"){if(b[1]==a){print $2;exit}}'; }
while ip -4 route del default 2>/dev/null; do :; done
if [ -n "${DEFAULT_GW:-}" ]; then ip route add default via "$DEFAULT_GW"; fi
printf '%s\n' "${ROUTES:-}" | while IFS= read -r r; do [ -z "$r" ] || ip route replace $r; done
printf 'nameserver 10.77.0.53\noptions attempts:1 timeout:1\n' >/etc/resolv.conf
nft -f - <<'EOF'
table inet guard {
 chain output { type filter hook output priority 0; policy drop;
  ip daddr 127.0.0.11 counter drop
  oifname "lo" accept
  meta mark 0x77 counter accept
  ip daddr {10.77.0.0/16,10.78.0.0/16,10.79.0.0/24} counter accept
 }
}
EOF
case "$ROLE" in
 ingress)
  lan=$(findif "$LAN_IP"); test -n "$lan"
  ip link add wg0 type wireguard
  wg setconf wg0 /lab-private/server.conf
  wg set wg0 fwmark 0x77
  ip addr add "$WG_ADDR" dev wg0
  ip link set wg0 mtu 1280 up
  nft -f - <<EOF
table inet lab {
 chain forward { type filter hook forward priority 0; policy drop;
  ct state invalid counter drop
  iifname "wg0" oifname "$lan" ip daddr {10.77.0.0/16,10.78.0.0/16,10.79.0.0/24} counter accept
  iifname "$lan" oifname "wg0" ip daddr $PEER_IP counter accept
 }
}
EOF
 ;;
 router)
  lan=$(findif "$LAN_IP"); wan=$(findif "$WAN_IP"); test -n "$lan"; test -n "$wan"
  printf '%s\n' "$lan" >/run/lan.if; printf '%s\n' "$wan" >/run/wan.if
  nft -f - <<EOF
table inet lab {
 chain forward { type filter hook forward priority 0; policy drop;
  ct state invalid counter drop
  ct state established,related counter accept
  iifname "$lan" oifname "$wan" ip saddr {$SOURCES} counter accept
 }
}
table ip labnat {
 chain pre { type nat hook prerouting priority dstnat; policy accept; }
 chain post { type nat hook postrouting priority srcnat; policy accept;
  oifname "$wan" ip saddr {$SOURCES} counter snat to $WAN_IP
 }
}
EOF
 ;;
 service) ;;
 *) echo 'unknown ROLE' >&2; exit 2;;
esac
touch /run/lab.ready
exec "$@"
```

[^exec-asset-scripts-node-sh]

[^exec-asset-scripts-node-sh]: EXEC_ASSETS/scripts/node.sh — lines 1-59.
