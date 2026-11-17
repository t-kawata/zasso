---
type: "Procedure"
title: "EXEC_ASSETS/scripts/link.sh"
description: "Apply or clear netem impairment on the LAN or WAN interface."
sources: 
  - resource: "EXEC_ASSETS/scripts/link.sh"
    id: "exec-asset-scripts-link-sh"
    title: "EXEC_ASSETS/scripts/link.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/link.sh"
x-asset-sha256: "5b74124c49b6fe507c42b24c1f6448a32bde4862b3f4f0bf2cb142ec85cdf031"
x-content-sha256: "7632689d805f796e999a41ed737b85010456eff71262fa62e1f624b16cd66ce4"
x-requires: 
  - "pages/pre-okf-original/25-fault-injection-timeouts-recovery"
x-source-span: "1-6"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/link.sh

Apply or clear netem impairment on the LAN or WAN interface.

- role: Procedure
- interface: `lan|wan [clear|netem args]`
- governing section: [25. Fault injection, timeouts, recovery](../pre-okf-original/25-fault-injection-timeouts-recovery.md)
- asset hash: `5b74124c49b6fe507c42b24c1f6448a32bde4862b3f4f0bf2cb142ec85cdf031`
- source span: lines 1-6

```bash
#!/bin/sh
set -eu
case "${1:-}" in lan|wan) dev=$(cat /run/"$1".if);; *) exit 2;; esac
shift
if [ "${1:-}" = clear ]; then tc qdisc del dev "$dev" root 2>/dev/null || :; else tc qdisc replace dev "$dev" root netem "$@"; fi
tc -s qdisc show dev "$dev"
```

[^exec-asset-scripts-link-sh]

[^exec-asset-scripts-link-sh]: EXEC_ASSETS/scripts/link.sh — lines 1-6.
