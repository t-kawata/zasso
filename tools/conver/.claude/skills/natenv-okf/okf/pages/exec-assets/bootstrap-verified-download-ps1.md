---
type: "Procedure"
title: "EXEC_ASSETS/bootstrap/verified-download.ps1"
description: "Verified download helper with URL and SHA-256 allowlist."
sources: 
  - resource: "EXEC_ASSETS/bootstrap/verified-download.ps1"
    id: "exec-asset-bootstrap-verified-download-ps1"
    title: "EXEC_ASSETS/bootstrap/verified-download.ps1"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/bootstrap/verified-download.ps1"
x-asset-sha256: "60841707cf9a01d2ed800fb9614ec998ed68247035b2e2bbbd9e089b3d2bce83"
x-content-sha256: "d399137ce01b8f3df80b59b7a8872f4fbbe56c87919fae70646785799bef5cb3"
x-requires: 
  - "pages/pre-okf-original/7-windows-host-and-native-guests"
x-source-span: "1-6"
x-topic: "exec-assets"
---
## EXEC_ASSETS/bootstrap/verified-download.ps1

Verified download helper with URL and SHA-256 allowlist.

- role: Procedure
- interface: `-Url -OutFile -Sha256`
- governing section: [7. Windows host and native guests](../pre-okf-original/7-windows-host-and-native-guests.md)
- asset hash: `60841707cf9a01d2ed800fb9614ec998ed68247035b2e2bbbd9e089b3d2bce83`
- source span: lines 1-6

```powershell
param([Parameter(Mandatory=$true)][uri]$Url,[Parameter(Mandatory=$true)][string]$Sha256,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Invoke-WebRequest -Uri $Url -OutFile $Destination
$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
if($actual -ne $Sha256){Remove-Item -LiteralPath $Destination;throw "SHA256 mismatch: $actual"}
Get-AuthenticodeSignature -LiteralPath $Destination | Format-List Status,StatusMessage,SignerCertificate
```

[^exec-asset-bootstrap-verified-download-ps1]

[^exec-asset-bootstrap-verified-download-ps1]: EXEC_ASSETS/bootstrap/verified-download.ps1 — lines 1-6.
