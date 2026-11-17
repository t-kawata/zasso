---
type: "Procedure"
title: "EXEC_ASSETS/vm/windows-create.ps1"
description: "Create a Windows guest from a prepared VHDX."
sources: 
  - resource: "EXEC_ASSETS/vm/windows-create.ps1"
    id: "exec-asset-vm-windows-create-ps1"
    title: "EXEC_ASSETS/vm/windows-create.ps1"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/vm/windows-create.ps1"
x-asset-sha256: "1845c209203606efe3cff7e2ab3d85e8e102f45ed8ffcb81ce4f79372fc27b7a"
x-content-sha256: "affb615bf82d75bc385393fa35a41adaa8c746c0c55d38dc4539c37a12427189"
x-requires: 
  - "pages/pre-okf-original/7-windows-host-and-native-guests"
x-source-span: "1-11"
x-topic: "exec-assets"
---
## EXEC_ASSETS/vm/windows-create.ps1

Create a Windows guest from a prepared VHDX.

- role: Procedure
- interface: `-Name -BaseVhdx`
- governing section: [7. Windows host and native guests](../pre-okf-original/7-windows-host-and-native-guests.md)
- asset hash: `1845c209203606efe3cff7e2ab3d85e8e102f45ed8ffcb81ce4f79372fc27b7a`
- source span: lines 1-11

```powershell
#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$Name,[Parameter(Mandatory=$true)][string]$BaseVhdx,[string]$Root='C:\WanVMs',[int64]$Memory=4GB,[int]$Cpu=2)
$ErrorActionPreference='Stop'
if(Get-VM -Name $Name -ErrorAction SilentlyContinue){throw 'VM exists; inspect rather than overwrite'}
if(-not(Test-Path $BaseVhdx)){throw 'Missing base VHDX'}
$dest=Join-Path $Root $Name;New-Item -ItemType Directory -Force $dest | Out-Null
$vhd=Join-Path $dest 'system.vhdx';Copy-Item -LiteralPath $BaseVhdx -Destination $vhd
New-VM -Name $Name -Generation 2 -MemoryStartupBytes $Memory -VHDPath $vhd -SwitchName WanTransport | Out-Null
Set-VMProcessor -VMName $Name -Count $Cpu
Set-VM -Name $Name -AutomaticCheckpointsEnabled $false
Write-Output "Created $Name. Apply guest-specific secure-boot policy; then Start-VM."
```

[^exec-asset-vm-windows-create-ps1]

[^exec-asset-vm-windows-create-ps1]: EXEC_ASSETS/vm/windows-create.ps1 — lines 1-11.
