param([Parameter(Mandatory=$true)][uri]$Url,[Parameter(Mandatory=$true)][string]$Sha256,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Invoke-WebRequest -Uri $Url -OutFile $Destination
$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
if($actual -ne $Sha256){Remove-Item -LiteralPath $Destination;throw "SHA256 mismatch: $actual"}
Get-AuthenticodeSignature -LiteralPath $Destination | Format-List Status,StatusMessage,SignerCertificate
