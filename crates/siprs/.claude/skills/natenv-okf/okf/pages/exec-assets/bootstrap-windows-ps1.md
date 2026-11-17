---
type: "Procedure"
title: "EXEC_ASSETS/bootstrap/windows.ps1"
description: "Enable Hyper-V and create the WanTransport internal switch."
sources: 
  - resource: "EXEC_ASSETS/bootstrap/windows.ps1"
    id: "exec-asset-bootstrap-windows-ps1"
    title: "EXEC_ASSETS/bootstrap/windows.ps1"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/bootstrap/windows.ps1"
x-asset-sha256: "7fb5de0db4de841fb1ccc940110d1ac592558f57fa9bbfcab401c381373f2478"
x-content-sha256: "b6df934f1c47ffefd31845d0eea3389c45e6117c94fd39ef7e81a7c03fa31af5"
x-requires: 
  - "pages/pre-okf-original/7-windows-host-and-native-guests"
x-source-span: "1-19"
x-topic: "exec-assets"
---
## EXEC_ASSETS/bootstrap/windows.ps1

Enable Hyper-V and create the WanTransport internal switch.

- role: Procedure
- interface: `.\bootstrap\windows.ps1`
- governing section: [7. Windows host and native guests](../pre-okf-original/7-windows-host-and-native-guests.md)
- asset hash: `7fb5de0db4de841fb1ccc940110d1ac592558f57fa9bbfcab401c381373f2478`
- source span: lines 1-19

```powershell
#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
$dir=Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts\bootstrap'
New-Item -ItemType Directory -Force $dir | Out-Null
Start-Transcript -Path (Join-Path $dir 'windows.log') -Append
try {
 Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsArchitecture,HyperVisorPresent | ConvertTo-Json | Set-Content (Join-Path $dir 'host.json')
 $f=Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
 if ($f.State -ne 'Enabled') {
  $r=Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart
  if ($r.RestartNeeded) { Write-Output '{"status":"REBOOT_REQUIRED","resume":"bootstrap/windows.ps1"}';exit 10 }
 }
 Import-Module Hyper-V
 Get-VMHost | Format-List
 if (-not (Get-VMSwitch -Name 'WanTransport' -ErrorAction SilentlyContinue)) { New-VMSwitch -Name 'WanTransport' -SwitchType Internal | Out-Null }
 $nic=Get-NetAdapter -Name 'vEthernet (WanTransport)'
 if (-not (Get-NetIPAddress -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object IPAddress -eq '192.168.240.1')) { New-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress 192.168.240.1 -PrefixLength 24 | Out-Null }
 Write-Output '{"status":"HOST_READY","next":"Provision Ubuntu at 192.168.240.2 and native guests"}'
} finally { Stop-Transcript }
```

[^exec-asset-bootstrap-windows-ps1]

[^exec-asset-bootstrap-windows-ps1]: EXEC_ASSETS/bootstrap/windows.ps1 — lines 1-19.
