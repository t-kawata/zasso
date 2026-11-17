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
