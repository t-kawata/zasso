param()
# SpeechHelper DLL (Native AOT) のビルド
# 出力: prebuilt/windows/SpeechHelper.lib + SpeechHelper.dll
#
# 移植元: ~/shyme/mycute/Makefile windows-helper ターゲット
# .NET SDK 9.0+ の dotnet CLI が必要。

$ProjectDir = "$PSScriptRoot\SpeechHelper"
$OutDir = "$PSScriptRoot\..\..\prebuilt\windows"
if (-not (Test-Path $OutDir)) { $null = New-Item -ItemType Directory -Path $OutDir -Force }
$OutDir = (Resolve-Path $OutDir).Path

if (-not (Test-Path $ProjectDir)) {
    Write-Error "[build.ps1] Project not found: $ProjectDir"
    exit 1
}

Write-Output "[build.ps1] Publishing SpeechHelper to $OutDir ..."
dotnet publish "$ProjectDir/SpeechHelper.csproj" `
    -c Release `
    -r win-x64 `
    --self-contained true `
    -o "$OutDir"

if ($LASTEXITCODE -ne 0) {
    Write-Error "[build.ps1] dotnet publish failed (exit: $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Output "[build.ps1] Built: $OutDir/SpeechHelper.dll"
