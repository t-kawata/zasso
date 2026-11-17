---
type: "Procedure"
title: "EXEC_ASSETS/scripts/policy.sh"
description: "Router fault policy: normal, cut, udp-block, or reset."
sources: 
  - resource: "EXEC_ASSETS/scripts/policy.sh"
    id: "exec-asset-scripts-policy-sh"
    title: "EXEC_ASSETS/scripts/policy.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/policy.sh"
x-asset-sha256: "49bb54861d64c9ab4f1d91cbcc516c32dd915ef499bf98f420aa3101087a7a67"
x-content-sha256: "aa80ea5dc2b0910a791b7c52cc4017f5d6540abcbdb5b65f20e3a627dac66de2"
x-requires: 
  - "pages/pre-okf-original/15-minimum-path-acceptance"
x-source-span: "1-14"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/policy.sh

Router fault policy: normal, cut, udp-block, or reset.

- role: Procedure
- interface: `normal|cut|udp-block|reset`
- governing section: [15. Minimum path acceptance](../pre-okf-original/15-minimum-path-acceptance.md)
- asset hash: `49bb54861d64c9ab4f1d91cbcc516c32dd915ef499bf98f420aa3101087a7a67`
- source span: lines 1-14

```bash
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
```

[^exec-asset-scripts-policy-sh]

[^exec-asset-scripts-policy-sh]: EXEC_ASSETS/scripts/policy.sh — lines 1-14.
