---
type: "Procedure"
title: "EXEC_ASSETS/jobs/mac-state.sh"
description: "Collect macOS guest state through the OOB runner."
sources: 
  - resource: "EXEC_ASSETS/jobs/mac-state.sh"
    id: "exec-asset-jobs-mac-state-sh"
    title: "EXEC_ASSETS/jobs/mac-state.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/jobs/mac-state.sh"
x-asset-sha256: "0b79cc171c4ba5d1d90e42e4637e5478e12c7485a7dcd0c0df95cb59053d0b1d"
x-content-sha256: "c7d36c32a6657d2ef5d19245829bba0b18855ff4cb9a4d34d2ae2774f89d3f06"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-6"
x-topic: "exec-assets"
---
## EXEC_ASSETS/jobs/mac-state.sh

Collect macOS guest state through the OOB runner.

- role: Procedure
- interface: `agent-run.py --script jobs/mac-state.sh`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `0b79cc171c4ba5d1d90e42e4637e5478e12c7485a7dcd0c0df95cb59053d0b1d`
- source span: lines 1-6

```bash
#!/bin/sh
set -eu
id
sw_vers
ifconfig -a
netstat -rn
```

[^exec-asset-jobs-mac-state-sh]

[^exec-asset-jobs-mac-state-sh]: EXEC_ASSETS/jobs/mac-state.sh — lines 1-6.
