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
