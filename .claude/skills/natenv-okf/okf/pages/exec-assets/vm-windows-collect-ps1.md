---
type: "Procedure"
title: "EXEC_ASSETS/vm/windows-collect.ps1"
description: "Collect Windows guest state for the evidence archive."
sources: 
  - resource: "EXEC_ASSETS/vm/windows-collect.ps1"
    id: "exec-asset-vm-windows-collect-ps1"
    title: "EXEC_ASSETS/vm/windows-collect.ps1"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/vm/windows-collect.ps1"
x-asset-sha256: "82da17730f1d29e5505b9386a7a71903113e7c50b1ad272901dceed4411cc3c4"
x-content-sha256: "ad05224f8593972752abac2d6f80e81ffe7b10d1ea2307d1a974eaea162b1abe"
x-requires: 
  - "pages/pre-okf-original/26-packet-capture-state-observation"
x-source-span: "1-12"
x-topic: "exec-assets"
---
## EXEC_ASSETS/vm/windows-collect.ps1

Collect Windows guest state for the evidence archive.

- role: Procedure
- interface: `-OutDir <dir>`
- governing section: [26. Packet capture, state, observation](../pre-okf-original/26-packet-capture-state-observation.md)
- asset hash: `82da17730f1d29e5505b9386a7a71903113e7c50b1ad272901dceed4411cc3c4`
- source span: lines 1-12

```powershell
param([Parameter(Mandatory=$true)][string]$OutDir)
$ErrorActionPreference='Continue'
New-Item -ItemType Directory -Force $OutDir | Out-Null
Get-NetIPAddress | ConvertTo-Json -Depth 8 | Set-Content "$OutDir\addresses.json"
Get-NetRoute | ConvertTo-Json -Depth 8 | Set-Content "$OutDir\routes.json"
Get-NetTCPConnection | ConvertTo-Json -Depth 8 | Set-Content "$OutDir\tcp.json"
Get-NetUDPEndpoint | ConvertTo-Json -Depth 8 | Set-Content "$OutDir\udp.json"
Get-Process | Select-Object Id,ProcessName,CPU,WorkingSet64,Handles,StartTime | ConvertTo-Json -Depth 6 | Set-Content "$OutDir\processes.json"
Get-NetFirewallProfile | ConvertTo-Json -Depth 6 | Set-Content "$OutDir\firewall-profiles.json"
Get-Service 'WireGuardTunnel*' | ConvertTo-Json -Depth 4 | Set-Content "$OutDir\tunnels.json"
& "$env:ProgramFiles\WireGuard\wg.exe" show 2>&1 | Set-Content "$OutDir\wg.txt"
& "$env:ProgramFiles\WireGuard\wireguard.exe" /dumplog 2>&1 | Set-Content "$OutDir\wg-log.txt"
```

[^exec-asset-vm-windows-collect-ps1]

[^exec-asset-vm-windows-collect-ps1]: EXEC_ASSETS/vm/windows-collect.ps1 — lines 1-12.
