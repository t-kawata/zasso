---
type: "Procedure"
title: "EXEC_ASSETS/vm/macos-collect.sh"
description: "Collect macOS guest state for the evidence archive."
sources: 
  - resource: "EXEC_ASSETS/vm/macos-collect.sh"
    id: "exec-asset-vm-macos-collect-sh"
    title: "EXEC_ASSETS/vm/macos-collect.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/vm/macos-collect.sh"
x-asset-sha256: "4036b889f8d887c1503970bd585e8b5356a12aa907454443d43dea9f397dc0fb"
x-content-sha256: "74f2683a5eeeadbe4ce9a677959dc5501526e804428551b2e19634882653ce96"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-11"
x-topic: "exec-assets"
---
## EXEC_ASSETS/vm/macos-collect.sh

Collect macOS guest state for the evidence archive.

- role: Procedure
- interface: `bash vm/macos-collect.sh <dir>`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `4036b889f8d887c1503970bd585e8b5356a12aa907454443d43dea9f397dc0fb`
- source span: lines 1-11

```bash
#!/bin/bash
set -u
out=${1:?output directory};mkdir -p "$out"
sw_vers >"$out/os.txt" 2>&1
ifconfig -a >"$out/interfaces.txt" 2>&1
netstat -rn >"$out/routes.txt" 2>&1
netstat -anv >"$out/sockets.txt" 2>&1
lsof -nP -i >"$out/socket-processes.txt" 2>&1
ps -axo pid,ppid,user,%cpu,rss,etime,command >"$out/processes.txt" 2>&1
sudo -n pfctl -sr >"$out/pf-rules.txt" 2>&1
sudo -n wg show >"$out/wg.txt" 2>&1
```

[^exec-asset-vm-macos-collect-sh]

[^exec-asset-vm-macos-collect-sh]: EXEC_ASSETS/vm/macos-collect.sh — lines 1-11.
