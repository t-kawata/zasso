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
