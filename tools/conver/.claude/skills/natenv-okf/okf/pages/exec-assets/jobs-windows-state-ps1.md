---
type: "Procedure"
title: "EXEC_ASSETS/jobs/windows-state.ps1"
description: "Collect Windows guest state through the OOB runner."
sources: 
  - resource: "EXEC_ASSETS/jobs/windows-state.ps1"
    id: "exec-asset-jobs-windows-state-ps1"
    title: "EXEC_ASSETS/jobs/windows-state.ps1"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/jobs/windows-state.ps1"
x-asset-sha256: "1ec2eba3d9325b66d474e37a05e9242c866625f6536bb1f82efba66456043885"
x-content-sha256: "6d1a02d4bc623221edeb4425047343bd94cc25edd547b09ceedf90f71ac2ba65"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-4"
x-topic: "exec-assets"
---
## EXEC_ASSETS/jobs/windows-state.ps1

Collect Windows guest state through the OOB runner.

- role: Procedure
- interface: `agent-run.py --script jobs/windows-state.ps1`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `1ec2eba3d9325b66d474e37a05e9242c866625f6536bb1f82efba66456043885`
- source span: lines 1-4

```powershell
$ErrorActionPreference='Stop'
Get-ComputerInfo | Select-Object WindowsProductName,OsArchitecture | ConvertTo-Json
Get-NetIPAddress | ConvertTo-Json -Depth 6
Get-NetRoute | ConvertTo-Json -Depth 6
```

[^exec-asset-jobs-windows-state-ps1]

[^exec-asset-jobs-windows-state-ps1]: EXEC_ASSETS/jobs/windows-state.ps1 — lines 1-4.
