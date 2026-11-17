#!/bin/sh
set -u
mkdir -p /out/state; failed=0
capture() {
 name=$1; shift
 "$@" >"/out/state/$name.txt" 2>&1
 rc=$?; printf '%s\t%s\n' "$name" "$rc" >>/out/state/status.tsv
 [ "$rc" -eq 0 ] || failed=1
}
: >/out/state/status.tsv
capture address ip -j address
capture routes ip -j -4 route show table all
capture rules ip rule
capture firewall nft -a list ruleset
capture sockets ss -tunap
capture conntrack conntrack -L -o extended
capture qdisc tc -s qdisc show
capture processes ps aux
capture packages dpkg-query -W
if ip link show wg0 >/dev/null 2>&1; then capture wireguard wg show wg0; fi
exit "$failed"
