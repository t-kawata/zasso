#!/bin/sh
set -eu
case "${1:-}" in
 normal) nft delete table inet fault 2>/dev/null || : ;;
 cut|udp-block)
  nft delete table inet fault 2>/dev/null || :
  if [ "$1" = cut ]; then rule='counter drop'; else rule='meta l4proto udp counter drop'; fi
  nft -f - <<EOF
table inet fault { chain forward { type filter hook forward priority -50; policy accept; $rule; } }
EOF
 ;;
 reset) conntrack -F;;
 *) echo 'normal|cut|udp-block|reset' >&2; exit 2;;
esac
