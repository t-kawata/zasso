---
type: "Procedure"
title: "EXEC_ASSETS/jobs/infra-state.sh"
description: "Collect infrastructure state through the OOB runner."
sources: 
  - resource: "EXEC_ASSETS/jobs/infra-state.sh"
    id: "exec-asset-jobs-infra-state-sh"
    title: "EXEC_ASSETS/jobs/infra-state.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/jobs/infra-state.sh"
x-asset-sha256: "906cb9aa1c70e2b3827ba0b09a5e3ccc6e2d01042e536105e6472b89c1326867"
x-content-sha256: "49e925e6e827ef5b78bc6be3f51a974fd6df7a52ad624d372c3d71e92ea6c330"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-5"
x-topic: "exec-assets"
---
## EXEC_ASSETS/jobs/infra-state.sh

Collect infrastructure state through the OOB runner.

- role: Procedure
- interface: `agent-run.py --script jobs/infra-state.sh`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `906cb9aa1c70e2b3827ba0b09a5e3ccc6e2d01042e536105e6472b89c1326867`
- source span: lines 1-5

```bash
#!/bin/sh
set -eu
cd "$HOME/wan-lab"
./lab ps
./lab collect
```

[^exec-asset-jobs-infra-state-sh]

[^exec-asset-jobs-infra-state-sh]: EXEC_ASSETS/jobs/infra-state.sh — lines 1-5.
