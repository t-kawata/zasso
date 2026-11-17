---
type: "Page"
title: "7. Windows host and native guests"
description: "7. Windows host and native guests"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-9"
    title: "7. Windows host and native guests"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "129700b361d9e7af617e5d66f2a3689a8004f4da1e194130147d04a401cf049b"
x-requires: 
  - "pages/pre-okf-original/6-ubuntu-infrastructure-bootstrap"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "161-225"
x-topic: "pre-okf-original"
---
## 7. Windows host and native guests

### 7.1 Host preparation

Elevated PowerShell:
```powershell
Set-Location C:\WanLab
.\bootstrap\windows.ps1
```
Checks/enables Hyper-V, creates WanTransport Internal switch, host 192.168.240.1/24. Exit 10: reboot with approval, rerun. Unsupported edition/firmware: explicit prerequisite resolution. Do not silently upgrade OS edition. Reserve subnet after overlap check.

Hyper-V Internal switch connects host and VMs, not physical LAN by itself. Ubuntu VM .2; Windows B .11; S .12. IP management is separate from inner 10.77/78/79 ranges. External connectivity used only during preparation or by explicitly restricted management.

### 7.2 Native guest template

Fast path: approved powered-off prepared Gen2 Windows VHDX. Template includes supported guest OS, lab administrator, updates, Python, WireGuard, product native runtime, optional compiler, event logging. For independent identities/general distribution use Sysprep/generalize under OS requirements. Do not copy an active writable VHDX.

From ISO: create dedicated empty Gen2 VM, attach owner-provided ISO, choose correct edition/image index, unattended answer file when available. Answer file controls locale, dedicated-disk GPT/EFI/MSR/OS layout, InstallFrom, accepted license, lab account, first configuration. Never reuse destructive disk-selection automation against a physical PC. Windows Setup `autounattend.xml` is media/edition-specific; resolve image index using installation media rather than inventing one. First enrollment may be interactive; freeze template afterward. PowerShell Direct supplies repeatable post-install configuration even when setup hooks differ.

Creation from prepared disk:
```powershell
.\vm\windows-create.ps1 -Name wan-b -BaseVhdx C:\Images\windows-lab-base.vhdx
.\vm\windows-create.ps1 -Name wan-s -BaseVhdx C:\Images\windows-lab-base.vhdx
Start-VM wan-b
Start-VM wan-s
$cred=Import-Clixml C:\WanSecrets\guest.xml
Invoke-Command -VMName wan-b -Credential $cred -ScriptBlock { Get-NetAdapter; $PSVersionTable }
```
Ubuntu infrastructure is separate VM, no nested Hyper-V inside Windows guests. Ubuntu secure boot template when appropriate:
```powershell
Set-VMFirmware -VMName wan-infra -SecureBootTemplate MicrosoftUEFICertificateAuthority
```
Only apply to compatible actual image. VM disk copy script does not install guest OS or invent credentials.

### 7.3 Guest addressing and transfer

Via Direct, on dedicated fresh B guest:
```powershell
$nic=Get-NetAdapter | Where-Object Status -eq 'Up'
if(@($nic).Count -ne 1){throw 'Resolve NIC by MAC/name explicitly'}
Set-NetIPInterface -InterfaceIndex $nic.ifIndex -AddressFamily IPv4 -Dhcp Disabled
New-NetIPAddress -InterfaceIndex $nic.ifIndex -IPAddress 192.168.240.11 -PrefixLength 24
```
S uses .12. Inspect/remove only previously created lab address if rerunning. Never clear all host addresses. Direct remains available without IP connectivity.

```powershell
$s=New-PSSession -VMName wan-b -Credential $cred
Invoke-Command -Session $s -ScriptBlock { New-Item -ItemType Directory -Force C:\WanLab | Out-Null }
Copy-Item C:\WanLab\b.conf C:\WanLab\b.conf -ToSession $s
Invoke-Command -Session $s -ScriptBlock { Get-NetIPAddress; Get-NetRoute }
Copy-Item C:\WanLab\artifacts C:\WanLab\results\b -FromSession $s -Recurse
Remove-PSSession $s
```
Resolve local/remote path direction before transfer. Capture binary file SHA256 after copy. Host artifacts must not accidentally overwrite base templates.

### 7.4 Dependency installation

Use official signed WireGuard MSI and Python package matching architecture. `bootstrap/verified-download.ps1` requires resolved approved URL and expected SHA256; inspect Authenticode signer/status. Hash from same compromised channel is not independent authenticity. Record source/hash/version.

```powershell
$p=Start-Process msiexec.exe -ArgumentList '/i','C:\Install\wireguard.msi','/qn','DO_NOT_LAUNCH=1','/norestart' -Wait -PassThru
if($p.ExitCode -notin 0,3010){throw "MSI failure $($p.ExitCode)"}
```
Python installer unattended options depend on chosen distribution; official CPython example `/quiet InstallAllUsers=1 PrependPath=1 Include_test=0`; verify `python --version` and executable path afterward. SUT runtime dependencies installed from actual build manifest; do not install unrelated SDKs on every guest.

[^pre-okf-original-9]

[^pre-okf-original-9]: 7. Windows host and native guests — sources/pre-okf-original.md, lines 161-225.

