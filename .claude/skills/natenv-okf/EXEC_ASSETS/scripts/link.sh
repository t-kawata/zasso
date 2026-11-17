#!/bin/sh
set -eu
case "${1:-}" in lan|wan) dev=$(cat /run/"$1".if);; *) exit 2;; esac
shift
if [ "${1:-}" = clear ]; then tc qdisc del dev "$dev" root 2>/dev/null || :; else tc qdisc replace dev "$dev" root netem "$@"; fi
tc -s qdisc show dev "$dev"
