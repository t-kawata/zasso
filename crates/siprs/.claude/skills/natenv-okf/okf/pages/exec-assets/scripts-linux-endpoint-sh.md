---
type: "Procedure"
title: "EXEC_ASSETS/scripts/linux-endpoint.sh"
description: "Create or remove a Linux namespace WireGuard endpoint."
sources: 
  - resource: "EXEC_ASSETS/scripts/linux-endpoint.sh"
    id: "exec-asset-scripts-linux-endpoint-sh"
    title: "EXEC_ASSETS/scripts/linux-endpoint.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/linux-endpoint.sh"
x-asset-sha256: "d6e63fbfbec755e3ac9981cf6456759f78a6e01ebaa0f7a1e786674ab96d58ff"
x-content-sha256: "274b38c6e154c240f8443a9b1e406a33df8de7afe93a818f65f0d62774815eb9"
x-requires: 
  - "pages/pre-okf-original/12-native-tunnels"
x-source-span: "1-30"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/linux-endpoint.sh

Create or remove a Linux namespace WireGuard endpoint.

- role: Procedure
- interface: `up|down a|b|s <config>`
- governing section: [12. Native tunnels](../pre-okf-original/12-native-tunnels.md)
- asset hash: `d6e63fbfbec755e3ac9981cf6456759f78a6e01ebaa0f7a1e786674ab96d58ff`
- source span: lines 1-30

```bash
#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'root required for network setup' >&2;exit 2; }
action=${1:?up|down};node=${2:?a|b|s};conf=${3:-}
case "$node" in a) addr=10.78.1.10;;b) addr=10.78.2.10;;s) addr=10.79.0.10;;*)exit 2;;esac
ns="wan-$node";dev="wg-$node"
case "$action" in
 up)
  [[ -f "$conf" ]] || { echo 'endpoint config missing' >&2;exit 2; }
  if ip netns list | awk '{print $1}' | grep -Fxq "$ns";then echo 'namespace exists; inspect first' >&2;exit 2;fi
  ip netns add "$ns"
  cleanup(){ ip netns del "$ns" 2>/dev/null || :;ip link del "$dev" 2>/dev/null || :; }
  trap cleanup ERR
  ip -n "$ns" link set lo up
  ip link add "$dev" type wireguard
  tmp=$(mktemp);chmod 0600 "$tmp"
  sed -E '/^(Address|MTU|DNS|Table|PreUp|PostUp|PreDown|PostDown)[[:space:]]*=/d' "$conf" >"$tmp"
  wg setconf "$dev" "$tmp";rm -f "$tmp"
  ip link set "$dev" netns "$ns"
  ip -n "$ns" address add "$addr/24" dev "$dev"
  ip -n "$ns" link set "$dev" mtu 1280 up
  for prefix in 10.77.0.0/16 10.78.0.0/16 10.79.0.0/24;do ip -n "$ns" route replace "$prefix" dev "$dev";done
  trap - ERR
  ip -n "$ns" route
  ;;
 down)
  pids=$(ip netns pids "$ns");[[ -z "$pids" ]] || { echo "Stop namespace processes first: $pids" >&2;exit 2; }
  ip netns del "$ns";;
 *)exit 2;;
esac
```

[^exec-asset-scripts-linux-endpoint-sh]

[^exec-asset-scripts-linux-endpoint-sh]: EXEC_ASSETS/scripts/linux-endpoint.sh — lines 1-30.
