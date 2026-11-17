---
type: "Procedure"
title: "EXEC_ASSETS/scripts/state.sh"
description: "Collect per-service network, firewall, and process state."
sources: 
  - resource: "EXEC_ASSETS/scripts/state.sh"
    id: "exec-asset-scripts-state-sh"
    title: "EXEC_ASSETS/scripts/state.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/state.sh"
x-asset-sha256: "faed8bce64da9766b2a7122386fb41288902f039452a37bac77bc821693d904c"
x-content-sha256: "0a01edf9959f136064bb3afb2c3e43c72df4db7be7385cb9d063b93430ab5e00"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-21"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/state.sh

Collect per-service network, firewall, and process state.

- role: Procedure
- interface: `/lab/state.sh`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `faed8bce64da9766b2a7122386fb41288902f039452a37bac77bc821693d904c`
- source span: lines 1-21

```bash
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
```

[^exec-asset-scripts-state-sh]

[^exec-asset-scripts-state-sh]: EXEC_ASSETS/scripts/state.sh — lines 1-21.
