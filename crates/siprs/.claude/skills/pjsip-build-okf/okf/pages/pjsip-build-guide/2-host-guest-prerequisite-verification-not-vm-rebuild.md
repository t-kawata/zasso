---
type: "Page"
title: "2. Host/guest prerequisite verification (not VM rebuild)"
description: "11.0 is profile value, not guarantee all used dependency builds support it; inspect min OS/load commands later. Apple Clang/SDK/macOS versions captured. Don't assume LLVM x64 mac binaries run..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-5"
    title: "2. Host/guest prerequisite verification (not VM rebuild)"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "4c5751f8bff0ce1ba25873df5dfd78f74f20014c7cf22c2d5a52b90d2d946978"
x-requires: [pages/pjsip-build-guide/1-contract-and-filesystem]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "68-97"
x-topic: "pjsip-build-guide"
---
## 2. Host/guest prerequisite verification (not VM rebuild)
Mac:
```bash
uname -m                                      # arm64
xcrun --find clang
xcrun --show-sdk-path
brew install pkgconf openssl@3 cmake ninja llvm
make --version                                # GNU make required, not arbitrary make
cc --version; c++ --version
rustc -vV; cargo -V
export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
export LIBCLANG_PATH="$(brew --prefix llvm)/lib"
export MACOSX_DEPLOYMENT_TARGET=11.0             # explicit supported-minimum policy; raise if dependency requires
```
11.0 is profile value, not guarantee all used dependency builds support it; inspect min OS/load commands later. Apple Clang/SDK/macOS versions captured. Don't assume LLVM x64 mac binaries run natively; use ARM Homebrew.

Linux guest:
```bash
cd "$LAB"
python3 lab.py exec linux --admin --seconds 14400 'sudo apt-get update && sudo apt-get install -y build-essential pkg-config libssl-dev libasound2-dev uuid-dev clang libclang-dev perl'
python3 lab.py exec linux 'uname -m; . "$HOME/.cargo/env"; rustc -vV; cargo -V; make --version; cc --version; pkg-config --modversion openssl'
```
If original lab lacks --admin Linux account, use its explicit authorized provisioning mechanism; do not grant blanket sudo merely to build. Confirm x86_64 OS kernel + Rust host x86_64-unknown-linux-gnu; GNU make; approved OpenSSL/ALSA/UUID package versions. Capture apt versions, repository snapshot/date. Build/test as standard builder.

Windows guest:
```bash
python3 lab.py exec windows --ps '. C:\ci\work\tools\windows-dev.ps1; Get-Command cl,link,lib,msbuild,cmake; rustc -vV; cargo -V; Test-Path C:\LLVM\bin\libclang.dll'
```
Needs VS2022 v143 C++ x64 toolset, Windows10/11 SDK, CMake>=3.16 for Opus (use Runbook>=3.28), Git/tar, LLVM/libclang, exact x64 MSVC Rust. No MSYS2/Cygwin/MinGW libraries on INCLUDE/LIB/PATH. DLL/lib `.lib` extension does not prove MSVC compatibility; reject MinGW archives/import libs. Use `vswhere`/VsDevCmd from original helper; not guessed versioned VC paths. Runtime config `Release` = /MD per PJSIP 2.17; `Debug` historically /MTd, NOT interchangeable; Debug-Dynamic=/MDd, Release-Static=/MT. Baseline PJSIP+Opus+C probe+Rust default MSVC use /MD. Rust debug profile may consume Release C libraries: C CRT policy determined by native deps, not Rust debug symbols. Never +crt-static independently.

[^pjsip-build-guide-5]

[^pjsip-build-guide-5]: 2. Host/guest prerequisite verification (not VM rebuild) — sources/pjsip-build-guide.md, lines 68-97.

