$ErrorActionPreference='Stop'
Get-ComputerInfo | Select-Object WindowsProductName,OsArchitecture | ConvertTo-Json
Get-NetIPAddress | ConvertTo-Json -Depth 6
Get-NetRoute | ConvertTo-Json -Depth 6
