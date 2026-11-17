---
type: "Procedure"
title: "EXEC_ASSETS/scripts/capture.sh"
description: "Start and stop the per-service packet-capture ring."
sources: 
  - resource: "EXEC_ASSETS/scripts/capture.sh"
    id: "exec-asset-scripts-capture-sh"
    title: "EXEC_ASSETS/scripts/capture.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/scripts/capture.sh"
x-asset-sha256: "ca1bf84287b453aade1f34486cceb86dfa65d893ac84d39745455e938ff15838"
x-content-sha256: "d9356af0ccccbf9fe936901f587cca74eaea48bf02627afcf7c4a60073574190"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-16"
x-topic: "exec-assets"
---
## EXEC_ASSETS/scripts/capture.sh

Start and stop the per-service packet-capture ring.

- role: Procedure
- interface: `start|stop`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `ca1bf84287b453aade1f34486cceb86dfa65d893ac84d39745455e938ff15838`
- source span: lines 1-16

```bash
#!/bin/sh
set -eu
case "${1:-}" in
 start)
  test ! -e /run/capture.pid; mkdir -p /out
  tcpdump -i any -n -s 0 -U -C 32 -W 8 -w /out/packets.pcap >/out/tcpdump.log 2>&1 &
  p=$!; echo "$p" >/run/capture.pid; sleep 1; kill -0 "$p";;
 stop)
  if [ -f /run/capture.pid ]; then
   p=$(cat /run/capture.pid); kill -INT "$p" 2>/dev/null || :
   i=0; while kill -0 "$p" 2>/dev/null && [ "$i" -lt 15 ]; do sleep 1; i=$((i+1)); done
   if kill -0 "$p" 2>/dev/null; then echo 'capture still running; inspect before reusing PID file' >&2; exit 1; fi
   rm /run/capture.pid
  fi;;
 *) exit 2;;
esac
```

[^exec-asset-scripts-capture-sh]

[^exec-asset-scripts-capture-sh]: EXEC_ASSETS/scripts/capture.sh — lines 1-16.
