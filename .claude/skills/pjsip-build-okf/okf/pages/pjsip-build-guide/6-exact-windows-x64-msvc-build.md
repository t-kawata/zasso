---
type: "Page"
title: "6. Exact Windows/x64 MSVC build"
description: "`lane/windows-build.ps1` uses original `windows-dev.ps1` helper; standard builder; toolkit path/work required. Stages Opus x64 static /MD via VS2022 CMake, PJSIP solution dependency graph..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-9"
    title: "6. Exact Windows/x64 MSVC build"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "f41fb36bee9b0bf4c7285637b53c350eea39ae4c491635b13f65c2c29a0c86ba"
x-requires: [pages/pjsip-build-guide/3-source-acquisition-freeze-once-identical-per-lane, pages/pjsip-build-guide/1-contract-and-filesystem]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "207-239"
x-topic: "pjsip-build-guide"
---
## 6. Exact Windows/x64 MSVC build
`lane/windows-build.ps1` uses original `windows-dev.ps1` helper; standard builder; toolkit path/work required. Stages Opus x64 static /MD via VS2022 CMake, PJSIP solution dependency graph `/t:pjsua` Release|x64 then combined-lib project (ensures transitive sources built), combined archive machine check, merged configured headers, C probe native compile+execution, evidence tar. `/m:4`, v143, detected installed SDK recorded. For byte-reproducible baseline pin exact SDK/toolset instead of highest installed: source script Get-Sdk returns selected highest; final environment lock must match. Script doesn't install SDK or rewrite project architecture. Absent Release|x64 => stop/inspect actual tagged solution, not invent an x64 target.

```bash
cd "$LAB"
python3 lab.py exec windows --seconds 28800 --ps "& C:/ci/work/native/$RUN/kit/lane/windows-build.ps1 -Phase all -Work C:/ci/work/native/$RUN -Src C:/ci/work/native/$RUN/pjproject -OpusSrc C:/ci/work/native/$RUN/opus -Kit C:/ci/work/native/$RUN/kit"
python3 lab.py get windows "C:/ci/work/native/$RUN/stage.tar.gz" "$HOME/pjsip-rust-kit/out/$RUN-windows-stage.tar.gz"
```
Build flags: `/p:Configuration=Release /p:Platform=x64 /p:BuildToolset=v143 /p:PlatformToolset=v143 /p:BuildProjectReferences=true /p:WindowsTargetPlatformVersion=ACTUAL /p:WholeProgramOptimization=false`. `BuildToolset` is PJSIP property per documentation; also standard PlatformToolset override. Fresh source REQUIRED: archive discovery expects exactly1 combined lib under pjproject/lib; rejects stale Debug/x86 duplicates. Header union roots pjlib/include, pjlib-util/include, pjnath/include, pjmedia/include, pjsip/include; collisions require identical content. Library name actual target suffix discovered, not hard-coded versioned filename.

Windows config_site.h: PJSUA_MAX_ACC32, SSL+Schannel, Opus1 + exact Opus library basename `opus.lib`, video0, WebRTC AEC/AEC3 0. Match compiler `/D` from pinned win64 props: helper lists `PJ_WIN32=1,WIN64,PJ_WIN64=1,PJ_M_X86_64=1`; confirm actual source props. Header compilation /MD; C probe links combined archive+opus and explicit Windows OS libs. Exact definitions+system lib list carried into Rust bundle; don't guess include-only `PJ_WIN32` is enough without checking source architecture. MSVC headers/COFF probe/later Rust ABI size+alignment+offset gates detect mismatch, but not full arbitrary API coverage.

Static combined archive `libpjproject-TARGET-CONFIG.lib` contains project libraries; not a DLL import library. Opus still separate `.lib`; OS libraries still SDK imports. `.lib` extension alone ambiguous: `dumpbin /headers`/members/symbols and link probe prove intended kind/arch. No copying some random third_party .lib until links stop failing. OpenSSL DLL not needed for Schannel profile; Windows-native TLS uses system trust/configuration semantics different from OpenSSL; higher-level cert policy tests still required.

### 6.1 Upstream Windows native suite supplement
Combined-lib/probe isn't full native regression. Build suite projects with same config/SDK/env/Opus search paths; exact project discovered+validated. Example inside initialized developer PS with `$Src,$OpusPrefix` defined:
```powershell
$env:INCLUDE="$OpusPrefix\include;$env:INCLUDE"; $env:LIB="$OpusPrefix\lib;$env:LIB"
foreach($m in @('pjlib','pjlib-util','pjnath','pjmedia','pjsip')) {
 $projects=@(Get-ChildItem "$Src\$m\build" -Filter '*test*.vcxproj')
 if($projects.Count -ne 1){throw "test project discovery ambiguous: $m; inspect source and select exact project"}
 Native msbuild.exe @($projects[0].FullName,'/m:4','/p:Configuration=Release','/p:Platform=x64','/p:BuildToolset=v143','/p:PlatformToolset=v143')
 $exe=@(Get-ChildItem "$Src\$m\bin" -Filter '*test*.exe')
 if($exe.Count -ne 1){throw "test executable discovery ambiguous: $m"}
 Push-Location "$Src\$m\bin"
 try { Native $exe[0].FullName @() } finally { Pop-Location }
}
```
Pass same exact SDK override if source props choose a different installed SDK. Whole operation under original lab exec timeout; log all suites. If suite project depends on solution-only graph, build inspected solution target by its project name first (same rationale as pjsua); no silent omission. Device-dependent tests vs headless required subset recorded as §5.3. C probe/FFI tests required regardless of optional full-suite result. No claim this generic discovery replaces inspection when several projects/binaries exist.

### 6.2 CRT / diagnostic variants
Do not build PJSIP Debug /MTd + Opus Release/MD + Rust default MSVC together. Baseline Release/MD also used by Rust `cargo test` debug build. Native diagnostic variant: create fresh source tree, compatible /MD native config with /Zi/PDB and no LTCG as approved; ensure native artifacts/metadata under separate content ID. Keep full compile/link logs showing actual /MD or /MDd flags. `/DEFAULTLIB` directives `dumpbin /directives` may supplement but not fully prove every object setting. Do not use `/NODEFAULTLIB` or `/FORCE:MULTIPLE` to hide mismatch; unresolved libs/LNK2038 are evidence, not nuisance. PDBs included when produced; don't promise Release generates them automatically.

[^pjsip-build-guide-9]

[^pjsip-build-guide-9]: 6. Exact Windows/x64 MSVC build — sources/pjsip-build-guide.md, lines 207-239.

