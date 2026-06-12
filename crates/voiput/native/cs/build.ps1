param()
# SpeechHelper DLL (Native AOT) のビルド
# 出力: prebuilt/windows/SpeechHelper.lib + SpeechHelper.dll
#
# 移植元: ~/shyme/mycute/Makefile windows-helper ターゲット
# .NET SDK 9.0+ の dotnet CLI が必要。

$ProjectDir = Join-Path $PSScriptRoot "SpeechHelper"
$OutDir = Join-Path $PSScriptRoot ".." ".." "prebuilt" "windows"

if (-not (Test-Path $ProjectDir)) {
    Write-Error "[build.ps1] Project not found: $ProjectDir"
    exit 1
}

Write-Output "[build.ps1] Publishing SpeechHelper to $OutDir ..."
dotnet publish "$ProjectDir/SpeechHelper.csproj" `
    -c Release `
    --self-contained true `
    -o "$OutDir"

if ($LASTEXITCODE -ne 0) {
    Write-Error "[build.ps1] dotnet publish failed (exit: $LASTEXITCODE)"
    exit $LASTEXITCODE
}

Write-Output "[build.ps1] Built: $OutDir/SpeechHelper.dll"
