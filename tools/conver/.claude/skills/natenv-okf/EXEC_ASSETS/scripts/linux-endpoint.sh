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
