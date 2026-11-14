# PJSIP 2.17 → Windows/x64 · Linux/x64 · macOS/ARM64 → Rust FFI
## Local-only companion; native guest builds; raw static-library bundles; reproducible import/ABI/runtime gates
Revision 2026-11-13. Companion to `Apple-Silicon-Local-Rust-FFI-Runbook.md`; preserve original unchanged. This document owns PJSIP/dependency source acquisition, exact lane build commands, artifact staging/normalization, Rust import/bindgen/linking, native/FFI tests. Original owns VM provisioning/QEMU/TPM/SSH/timeout/reset. All computation local to one Apple-Silicon Mac. “Cross-platform build” here = native compilation inside target-OS local x64 guest; NOT Mac→Windows compiler cross-linking. Never replace Windows/x64 guest with Windows ARM+translation, Wine, MinGW ABI, remote runner. Rust targets: `x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`.

## 0. Read-first: correctness/safety/version boundaries
PJSIP 2.17 release confirmed; CMake remains experimental; latest documentation includes POST-2.17 fixes/features. In particular, later CMake install/export layout and `find_package(Pj)` examples MUST NOT be presumed equivalent to pristine 2.17. Reference pipeline below deliberately uses GNU configure/make on POSIX, VS2022/MSBuild reference solution+combined `libpjproject` on Windows. No dependency on newer CMake PJSIP install export. CMake used only for Windows Opus. Upstream 2.17 documentation itself contains historical SDK/OpenSSL names; do not install obsolete DirectX SDK/libeay32 merely because old prose lists them. VS2022 Windows SDK suffices for this audio-only lane; Windows TLS = Schannel; POSIX TLS = OpenSSL.

**Security stop:** pristine 2.17 is NOT production-safe merely because latest numbered release. As of review, vendor advisories affect <=2.17, including Service-Route stack overflow, ICE lifetime bugs, TLS identity verification, SRTP/SDP parsing, Opus PLC OOB write. Build/test baseline may be pristine 2.17 inside isolated trusted-fixture lab; production promotion MUST require approved 2.17+backports (or later supported release) and feature-specific regression tests. “No patched version” in advisory can coexist with master-branch fix. Do not silently replace 2.17 by master; do not claim one workaround fixes all advisories.

Verified mitigation: GHSA-882g-9pv2-xphr — disable Opus PLC (`pjmedia_codec_param.setting.plc=0`) or disable Opus. Native probe + Rust test demonstrate PLC=0; production application MUST apply BEFORE any Opus stream opens, including after reconfiguration. Does not fix Service-Route/ICE/TLS/SDP issues. GHSA-xc62-j9h2-mp84/CVE-2026-57161: Service-Route fix commit `acc03b57cef7a7d31b8e1f5b9117437d7e87c591`; no known full workaround, trusted TLS registrar reduces exposure only. Audited backport, dependency/conflict review, regression required. Never auto-apply arbitrary remote patch URLs.

Known review queue (NOT exhaustive/future-proof):
|Advisory|Concern / gate|
|---|---|
|GHSA-xc62-j9h2-mp84|REGISTER Service-Route stack overflow; backport; hostile response regression|
|GHSA-882g-9pv2-xphr|Opus PLC OOB; mitigation before stream; variable-frame/loss regression|
|GHSA-q58m-rgfj-cfx4|ICE restart/receive UAF; backport; concurrent restart regression|
|GHSA-jw49-x2jp-8m4v|NOTIFY without body presence/dialog UAF; backport if using feature|
|GHSA-382p-87mh-r3q8|OpenSSL/GnuTLS SAN embedded-NUL hostname bypass; backport; negative certificate fixture|
|GHSA-m9g3-jcj8-qjfm|SDP a=crypto stack overflow; SRTP negotiation parser regression|
|GHSA-rfwg-w9gq-9mw2|SDP payload-type mapping OOB; affected feature assessment|
|GHSA-966q-2r4w-549m|Repeated RED offer formats; disable unused feature or backport|
|GHSA-vcvv-w84c-pfqq|SIPS target-refresh downgrade; secure-dialog regression|
|GHSA-277r-3q2j-mxcw|SIP header buffer overflow; parser/backport gate|
|GHSA-59fr-724j-6fjv|HTTP-client heap overflow; feature exposure assessment|
|GHSA-9c8q-h38q-p85j|Telnet CLI pre-auth overflow; never enable production CLI merely for tests|
|GHSA-6p2p-5wf8-h5hr|AVI parser; audio-only configuration reduces applicable feature surface|
|GHSA-27vp-rw54-hjp7|Video conference bridge overflow; video OFF; track disposition|
|GHSA-56xm-9qw4-2fhq|PJSUA2 AKA callback lifetime; C/PJSUA profile avoids C++ API but track inclusion|

Approval record: advisory ID, affected source/feature/version, vendor fix SHA or reviewed mitigation, patch hash/order, regression ID/result, disposition owner/date, residual risk. Compile success, TLS support flag, test count, disabling unrelated feature != security approval. Keep source/patch provenance in artifact `meta/`; no production marker supplied by this kit.

Validation disclosure: kit is authored reference implementation, not prebuilt PJSIP binaries; no actual PJSIP source checkout/build/MSVC/Windows/Mac/Rust execution performed in author sandbox. Accompanying report distinguishes static/mock tests from native qualification. No guessed successful machine results. Required source/SDK/toolchain inputs resolved by operator; first actual three-lane run is qualification. Stop on unexpected options/libs/headers/zero tests; preserve evidence, diagnose; never bypass a gate to claim completion.

## 1. Contract and filesystem
Assume original lab root `$LAB` (example `$HOME/rust-local-lab`), working local VMs, `lab.py`, key-pinned loopback SSH, C:\ci\work\tools\windows-dev.ps1, standard `builder`, separate provisioning account, Rust exact pin installed. Toolkit root `$KIT` (this ZIP directory), OUT outside source. Short paths; no spaces/commas/newlines; Windows use C:\ci\work\native\RUN; never source directory named `build` inside pjproject (tracked upstream build/ exists).

```bash
export LAB="$HOME/rust-local-lab"             # existing original Runbook lab
export KIT="$HOME/pjsip-rust-kit"             # unpacked companion toolkit
export RUN=pj217-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$KIT"/{cache,input,out,locks} "$KIT/input/$RUN"/{pjproject,opus,kit}
```
No changes to original Runbook required. Never overwrite original GUIDE/lab/config/base images. Use dedicated native run directories in guests; build all phases in same guest/source copy; do not share configured source/objects between OSes. Stage paths:
```text
WORK/
  pjproject/                  pristine/patched approved 2.17 source + lane-owned config_site.h
  opus/                       approved Opus release source
  kit/{lane,config,probe}/     this kit's implementation
  prefix-opus/                native static Opus installation
  stage/
    prefix/{include,lib,...}   POSIX PJSIP install + static Opus
    include/,lib/              Windows normalized raw headers/combined archive/Opus
    meta/                     exact compiler/link flags, config_site, probe/layout, build logs/provenance
  stage.tar.gz
```
Final project-native bundle:
```text
third_party/pjsip/TARGET/CONTENT_ID/
  include/                    PJSIP 2.17 configured headers; no other-OS headers
  lib/ [lib64/]               .a or .lib; static bundled native deps
  meta/                      evidence incl. original pkg-config flags/source/config/probe
  bundle.env                 normalized include/define/link/ABI/capability policy
  manifest.json              payload SHA256/identity/toolchain metadata
```
Bundle format version1; content_id binds payload hashes + normalized bundle.env policy (excluding self-reference). Not a signature. Approved external archive SHA256/content_id protects delivery; self-generated checksum next to untrusted archive is not publisher authentication. Source and binaries must be reviewed/trusted before loading; build.rs/bindgen are code execution, not sandbox.

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

## 3. Source acquisition: freeze once, identical per lane
Mac, network acquisition only; source review required:
```bash
cd "$KIT"
git clone --no-checkout https://github.com/pjsip/pjproject.git cache/pjproject
cd cache/pjproject
git fetch --tags origin
git checkout --detach refs/tags/2.17
git status --porcelain                         # MUST empty
BASE=$(git rev-parse HEAD)
TREE=$(git rev-parse HEAD^{tree})
printf 'pjsip_tag=2.17\npjsip_commit=%s\nsource_tree=%s\n' "$BASE" "$TREE" > "$KIT/locks/$RUN.source.env"
git show -s --format=fuller HEAD > "$KIT/locks/$RUN.commit.txt"
git tag -v 2.17                                # only if tag signed; absence is disclosed, not fabricated verification
```
Tag signature absence needn't make source unavailable, but trust route must be explicitly approved (official repository HTTPS + independently reviewed SHA etc.). Do not `set -e`-ignore signature failure then report signed. `git checkout` above changes only acquisition cache. Fresh per-lane sources exported by `git archive`; PJSIP configure script supplied, no autoconf regeneration needed. Source-vs-generated-file checks become recorded lane delta.

Patch lane (if deploying, mandatory advisory review first):
```bash
# At cache/pjproject, approved source branch only; source patch dependencies reviewed.
git switch -c "pj217-approved-$RUN" "$BASE"
git fetch origin master
# Example VERIFIED Service-Route fix; not complete security patchset:
git show --stat acc03b57cef7a7d31b8e1f5b9117437d7e87c591
git cherry-pick -x acc03b57cef7a7d31b8e1f5b9117437d7e87c591
# Conflict? STOP; cherry-pick --abort; obtain/review correct backport; never guessed source edits.
# Apply remaining reviewed fixes in dependency order; each source/hash/regression recorded.
BASE=$(git rev-parse HEAD); TREE=$(git rev-parse HEAD^{tree})
printf 'pjsip_base_tag=2.17\npjsip_commit=%s\nsource_tree=%s\n' "$BASE" "$TREE" > "$KIT/locks/$RUN.source.env"
```
`pjsip_commit` final approved local/source commit; `source_tree` before generated config_site/configure files. Patch-file SHA/order/advisory dispositions retained. Version string may remain2.17 after backports; never distinguish patches via version alone. Source tree identifier is provenance assertion, not proof binary corresponds; retain build inputs/logs/hashes to audit.

Export:
```bash
git archive HEAD | tar -xf - -C "$KIT/input/$RUN/pjproject"
cd "$KIT"
curl -fL --retry 3 https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz -o cache/opus-1.6.1.tar.gz
printf '%s  %s\n' 6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1 cache/opus-1.6.1.tar.gz | shasum -a 256 -c -
tar -xzf cache/opus-1.6.1.tar.gz --strip-components=1 -C "input/$RUN/opus"
cp -R lane config probe "input/$RUN/kit/"
cp "locks/$RUN.source.env" "input/$RUN/source.env"
# Copy reviewed advisory dispositions/patch hashes/source version record too, if present.
COPYFILE_DISABLE=1 tar -czf "out/$RUN-input.tar.gz" -C "input/$RUN" .
shasum -a 256 "out/$RUN-input.tar.gz" > "locks/$RUN-input.sha256"
```
Opus1.6.1 publisher SHA256 above from official downloads page; source policy can choose another approved version, with recorded hash + retesting. Do not assume system Opus version identical across OS. GNU POSIX builds same Opus source/static PIC; Windows CMake static /MD. Source header/ABI/backend/options may differ per OS by design; source version and logical required capabilities stay matched.

## 4. Transport inputs to original local lab
Original CLI convention: `put PLATFORM REMOTE LOCAL`; directory must exist. Examples below preserve source tar checksum; never extract arbitrary unverified archive. Standard builder work area only; root-owned base untouched.
```bash
cd "$LAB"
python3 lab.py exec linux "mkdir -p ~/native/$RUN"
python3 lab.py put linux "native/$RUN/input.tar.gz" "$KIT/out/$RUN-input.tar.gz"
python3 lab.py exec windows --ps "New-Item -ItemType Directory -Force C:/ci/work/native/$RUN | Out-Null"
python3 lab.py put windows "C:/ci/work/native/$RUN/input.tar.gz" "$KIT/out/$RUN-input.tar.gz"
```
Verify SHA exactly from host approved lock BEFORE extraction. POSIX:
```bash
SHA=$(shasum -a 256 "$KIT/out/$RUN-input.tar.gz" | awk '{print $1}')
python3 lab.py exec linux "cd ~/native/$RUN; echo '$SHA  input.tar.gz' | sha256sum -c - && tar -xzf input.tar.gz"
```
Windows (Bash host interpolation; forward slash avoids `\$RUN` escaping dollar):
```bash
python3 lab.py exec windows --ps "\$d='C:/ci/work/native/$RUN'; if((Get-FileHash \"\$d/input.tar.gz\" -Algorithm SHA256).Hash.ToLower() -ne '$SHA'){throw 'source hash mismatch'}; tar.exe -xzf \"\$d/input.tar.gz\" -C \$d; exit \$LASTEXITCODE"
```
Host Mac gets its own fresh copy:
```bash
mkdir -p "$KIT/work/macos/$RUN"
tar -xzf "$KIT/out/$RUN-input.tar.gz" -C "$KIT/work/macos/$RUN"
```
Snapshot source+profile artifact hashes per run; changing config_site after configure invalidates dependent objects. Fresh tree per lane/config; no reuse of Windows-generated headers on Mac/Linux. Case-sensitive vs Windows case-insensitive collisions should be rejected during input review.

## 5. Exact POSIX build: Linux/x64, Mac/ARM64
Script `lane/posix-build.sh`: phases `opus site configure build nettest install probe stage all`. Environment WORK/SRC/OPUS_SRC/KIT absolute; JOBS default4. Native host architecture checked; `make dep` before make; log pipelines use pipefail. Outer original `lab exec` owns guest timeout/cleanup (do not substitute alarm-kill parent while descendants survive). In `all`, executable self-recursion requires `chmod +x` after transfer/extraction.

### 5.1 Linux
```bash
cd "$LAB"
python3 lab.py exec linux --seconds 28800 "export LANE=linux WORK=\$HOME/native/$RUN SRC=\$HOME/native/$RUN/pjproject OPUS_SRC=\$HOME/native/$RUN/opus KIT=\$HOME/native/$RUN/kit JOBS=4 OPUS_CHECK=1; chmod +x \$KIT/lane/posix-build.sh; \$KIT/lane/posix-build.sh all"
```
Script Linux configure: `--prefix=WORK/stage/prefix --with-opus=WORK/prefix-opus --disable-video --disable-libwebrtc --disable-upnp --disable-pjsua2 --disable-darwin-ssl --with-ssl=/usr`; C/C++ flags `-O2 -fPIC`; threads/SSL/ALSA detected; bundled SRTP/default codecs remain, not only G.711/Opus. Native ioqueue default select: conservative same baseline, no unrequested experimental epoll change. Want epoll? explicit separate variant and full requalification, not silent optimization.

### 5.2 macOS
```bash
export LANE=macos WORK="$KIT/work/macos/$RUN"
export SRC="$WORK/pjproject" OPUS_SRC="$WORK/opus" KIT="$WORK/kit" JOBS=4 OPUS_CHECK=1
# Save top-level toolkit path first if shell KIT is needed later; this line deliberately points to run-local scripts.
export SSL_PREFIX="$(brew --prefix openssl@3)"
export MACOSX_DEPLOYMENT_TARGET=11.0
chmod +x "$KIT/lane/posix-build.sh"
"$KIT/lane/posix-build.sh" all
```
After run reset shell `KIT=$HOME/pjsip-rust-kit` (or original actual root); artifact is `WORK/stage.tar.gz`. `--disable-darwin-ssl --with-ssl=BREW_OPENSSL_PREFIX` makes required backend OpenSSL explicit; native Apple TLS alternative is distinct variant (configure/backend/framework/link verification must change), not inferred from an optional system library. Apple Silicon validated by uname; no `--host=x86_64...`; no Rosetta. Retain target min OS + SDK + compiler; raw library CPU verification later.

### 5.3 What phases actually do
`opus`: release tar GNU configure static PIC, no shared lib; optional `OPUS_CHECK=1` executes make check; installs prefix-opus. `site`: copies project-owned limits-only POSIX config_site.h (`PJSUA_MAX_ACC32`), avoiding overriding configure capability macros. `configure`: captures configure.log and generated os_auto.h/build.mak. `build`: make dep, make -j4. `nettest`: five upstream suite executables from their module/bin cwd, required for relative certificates/fixtures; globs exact1 executable; absent/ambiguous fails. `install`: make install; explicitly installs exact config_site.h, static libopus.a+headers into own prefix; records Opus path relocation. `probe`: compile actual C consumer with `pkg-config --static --cflags/--libs libpjproject`; PJSUA create/init/null/start/destroy, UDP/TCP/TLS factory attempt, codec enumeration+OpusPLC0, size/alignment/offset data. `stage`: prefix+evidence tar; follows trusted-source symlinks under own stage (`tar -h`); no host-home share.

Native suite behavior: hardware/network assumptions may fail under headless TCG. Do not simply mark skipped. Capture executable `--help/--list` from actual suite before selecting named tests; define required headless subset + explicit device/network exclusions separately. `SUITES` can select module subset for diagnostic run, NOT complete upstream conformance. Suite timeout has no default internal kill in helper; original runner timeout28800 is outer safety, adjust measured. Host Mac invocation: wrap operator timeout/cleanup if needed; don't conflate manual Ctrl-C with completed native suite. PJSUA2 intentionally disabled on POSIX profile; this is PJSUA C FFI, not C++ PJSUA2.

### 5.4 Validate feature detection, not just configure exit
Retrieve stage tar, then host-side:
```bash
# In original LAB; Linux stage artifact:
python3 lab.py get linux "native/$RUN/stage.tar.gz" "$HOME/pjsip-rust-kit/out/$RUN-linux-stage.tar.gz"
# Host Mac copy to top-level toolkit, using saved absolute WORK:
cp "$WORK/stage.tar.gz" "$HOME/pjsip-rust-kit/out/$RUN-macos-stage.tar.gz"
```
Review `configure.log` SSL/Opus/audio/SRTP, `build.mak`, generated headers, build warnings. Explicit options missing/misspelled/ignored => fail. Verify GNU source `./configure --help` against script flags if amended. Native error/transport result in probe is mandatory gate, not warning. No external SDK/library layout guessed silently.

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

## 7. Stage audit and normalized bundle creation on Mac
Original lab get transfers file; compare guest Get-FileHash/sha256sum to received SHA. Preserve received tar read-only. All third-party source/patch/installer/compiler versions reviewed. Stage tar schema fixed; extraction tool rejects links/devices/path escapes/case-duplicate regular names and verifies payload later. Trusted staging tar only; it follows symlinks during creation, so review stage ownership first.

Before creating artifact: extract stage to clean review directory (tool extraction utility `safe_extract` available; or inspect trusted tar manually); evaluate `meta/probe.txt`:
```bash
cd "$HOME/pjsip-rust-kit"
mkdir -p review/linux review/macos review/windows
# Only hash-approved OWN stage archives here; no untrusted archives with shell tar.
tar -xzf "out/$RUN-linux-stage.tar.gz" -C review/linux
tar -xzf "out/$RUN-macos-stage.tar.gz" -C review/macos
tar -xzf "out/$RUN-windows-stage.tar.gz" -C review/windows
python3 tools/probe_check.py review/linux/meta/probe.txt --codec PCMU/ --codec PCMA/ --codec opus/ --tls required --ssl openssl
python3 tools/probe_check.py review/macos/meta/probe.txt --codec PCMU/ --codec PCMA/ --codec opus/ --tls required --ssl openssl
python3 tools/probe_check.py review/windows/meta/probe.txt --codec PCMU/ --codec PCMA/ --codec opus/ --tls required --ssl schannel
python3 tools/inventory.py review/windows > "out/$RUN-windows-inventory.json"
```
Probe TLS factory success != successful handshake/hostname/client-auth/SRTP negotiation. No server key/cert by default; backend may require configured test credentials for TLS listener. If factory fails, cannot label TLS lane qualified: inspect PJ status/backend logs; configure legitimate local test credentials in probe transport config according to backend; do not simply switch gate to absent while app requires TLS. `--tls absent` profile intentionally without TLS must have distinct policy/artifact. Opus ID default `opus/48000/2`; if adopted codec settings change IDs, enumerate actual ID and update exact matching/get-param code; never skip PLC gate.

Build bundles from received native-stage tars, using SAME final source identity variables from source lock (example source/env from §3):
```bash
# Read reviewed source variables; source/env file content is trusted operator-owned.
PJSIP_COMMIT=$(sed -n 's/^pjsip_commit=//p' "locks/$RUN.source.env")
SOURCE_TREE=$(sed -n 's/^source_tree=//p' "locks/$RUN.source.env")
python3 tools/pj_bundle.py create --lane linux --stage-tar "out/$RUN-linux-stage.tar.gz" --out-dir out \
 --target x86_64-unknown-linux-gnu --pjsip-commit "$PJSIP_COMMIT" --source-tree "$SOURCE_TREE" \
 --codec PCMU/ --codec PCMA/ --codec opus/ --tls required
python3 tools/pj_bundle.py create --lane macos --stage-tar "out/$RUN-macos-stage.tar.gz" --out-dir out \
 --target aarch64-apple-darwin --pjsip-commit "$PJSIP_COMMIT" --source-tree "$SOURCE_TREE" \
 --codec PCMU/ --codec PCMA/ --codec opus/ --tls required
# Windows exact combined archive discovered from stage; all following syslibs used by native probe too.
python3 tools/pj_bundle.py create --lane windows --stage-tar "out/$RUN-windows-stage.tar.gz" --out-dir out \
 --target x86_64-pc-windows-msvc --pjsip-commit "$PJSIP_COMMIT" --source-tree "$SOURCE_TREE" \
 --codec PCMU/ --codec PCMA/ --codec opus/ --tls required \
 --define PJ_WIN32=1 --define WIN64 --define PJ_WIN64=1 --define PJ_M_X86_64=1 \
 --syslib ws2_32 --syslib mswsock --syslib iphlpapi --syslib winmm --syslib ole32 --syslib oleaut32 \
 --syslib dsound --syslib dxguid --syslib netapi32 --syslib advapi32 --syslib user32 --syslib secur32 \
 --syslib crypt32 --syslib bcrypt --syslib rpcrt4
```
`--patch GHSA-ID=APPROVED_FIX_SHA` repeat for metadata only; patch source actually exported/rebuilt; metadata not proof fix applied. Add advisory/provenance files to stage/meta BEFORE stage.tar.gz generation for payload-bound evidence. Generated outputs: pjsip-2.17-TARGET-CIDPREFIX.tar.gz + .sha256; console prints full content_id. Approve content ID/archive SHA outside artifact; store in project-native lock. No wildcard picking “latest” artifact if several candidates; choose exact name/content ID.

Normalization semantics:
- POSIX include/define/link settings sourced from actual native pkg-config, not hard-coded list. Preserve link order/repetitions; classify bundled .a as static, required system libs as dylib/framework; unknown flags rejected (no silent lossy translation). PJSIP install prefix relocated to bundle-relative paths. Static Opus copied inside bundle; its original prefix mapped to rel:lib/include. External target system SDK/OpenSSL paths remain explicit abs: prerequisites; not hermetic artifact.
- Windows uses actual combined-lib basename, static opus, declared/verified /D/system libs; no pkg-config/MSYS tool required. Source headers merged; config_site equality enforced.
- bindgen/layout input = exact staged headers/config, matching final C compiler probe; not fresh header download, not host-Mac binding shared across targets.
- `create` enforces resultPASS, required TLS, required codecs and OpusPLC0; separate backend/capability policy gate still required. `verify --expect-id` rechecks payload+policy against approved ID. Metadata is not signed; authentic delivery uses external trusted checksum/signature.

Artifact portability bounds: POSIX OpenSSL system dependency remains; Linux glibc/ALSA/UUID constraints remain. “All libs copied into project” ≠ fully self-contained executable. For hermetic distribution, use approved static-PIC OpenSSL source build and package its headers/.a, extend relocation map; or bundle dynamic libs legally with correct loader paths. Never copy macOS .dylib to Linux, Windows import lib to GNU target, x86_64 header/binding to ARM64.

## 8. Import artifacts into Rust project (no installation into /usr/local)
```bash
PROJECT=/absolute/path/to/rust-project
TARGET=aarch64-apple-darwin                  # select lane explicitly
ARCHIVE=/absolute/path/to/APPROVED-ARTIFACT.tar.gz
CID=FULL_APPROVED_64_HEX_CONTENT_ID
# First verify archive's approved external SHA256 independently.
python3 tools/pj_bundle.py verify "$ARCHIVE" --expect-id "$CID"
DEST="$PROJECT/third_party/pjsip/$TARGET/$CID"
python3 tools/pj_bundle.py extract "$ARCHIVE" "$DEST" --expect-id "$CID"
python3 tools/pj_bundle.py verify "$DEST" --expect-id "$CID"
```
DEST absent/empty; tool won't overlay existing artifact. Archive tampering/extra files/changed link policy => reject. Bindgen OUT_DIR generated files/cache not written inside immutable bundle. Keep artifact tree unchanged after verify through build/test (exclusive run lock); TOCTOU if hostile concurrent writes. Approval file external per target pins CID + archiveSHA + sourcecommit/tree + patchset + capability/backend + compiler/CRT + license disposition. Don't include repo-wide Cargo target/credentials/generated source cache in native bundle.

Copy supplied `rust/pjsip-sys` into project `crates/pjsip-sys`; add to workspace `members`; dependent crate adds `pjsip-sys={path="../pjsip-sys"}` adjusted to layout. `links="pjproject"` prevents two Cargo packages claiming same native library; does not prevent hidden second copy inside unrelated DLL. One PJSUA singleton per process; no mixed2.17 variants in one process.

Initial dependency resolution (authorized lock change): `cargo generate-lockfile`/`cargo update -p bindgen --precise0.73.2` as appropriate; inspect/commit Cargo.lock. Subsequent commands `--locked`; offline `--frozen` after fetch. Crate pins bindgen=0.73.2; explicit native HOST==TARGET; generated bindings per lane use target Clang ABI; enum module constants avoid invalid-Rust-enum UB; callbacks/layout tests generated; PJSIP headers allowlisted not C++ PJSUA2. Raw sys crate is unsafe FFI, not safe abstraction. Rust edition2021 intentionally avoids edition2024 extern-syntax mismatches; compiler MSRV>=1.85 for supplied std APIs, project exact toolchain may be higher.

## 9. Build and execute Rust FFI tests in each actual OS
Contract owned by supplied crate:
```text
PJSIP_SYS_BUNDLE_DIR = absolute imported native bundle directory
PJSIP_SYS_EXPECTED_ID = approved full content_id
LIBCLANG_PATH        = target-native libclang location
SDKROOT              = Mac target SDK (xcrun)
INCLUDE/LIB/PATH       = initialized MSVC developer environment on Windows
```
Not upstream PJSIP environment API; do not assume existing third-party pjsip-sys crate understands these names. External Python verification is mandatory; build.rs checks target/version/expected ID but does not implement cryptographic payload verification. No dependency downloads/unknown header replacement during frozen test. Initial bindgen dependency/build crates code is part of trusted Cargo lock supply chain.

### 9.1 Mac
```bash
cd "$PROJECT"
export PJSIP_SYS_BUNDLE_DIR="$DEST" PJSIP_SYS_EXPECTED_ID="$CID"
export LIBCLANG_PATH="$(brew --prefix llvm)/lib"
export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
export MACOSX_DEPLOYMENT_TARGET=11.0
export CARGO_TARGET_DIR="$PROJECT/target-native/aarch64-apple-darwin/$CID"
cargo fetch --locked
cargo test --locked -p pjsip-sys --target aarch64-apple-darwin --no-run --message-format=json > test-build-macos.jsonl
cargo test --locked -p pjsip-sys --target aarch64-apple-darwin -- --list > test-list-macos.txt
cargo test --locked -p pjsip-sys --target aarch64-apple-darwin -- --nocapture --test-threads=1
cargo test --locked -p pjsip-sys --target aarch64-apple-darwin --release -- --nocapture --test-threads=1
```
If OpenSSL dylib runtime loader fails, don't add arbitrary global DYLD_LIBRARY_PATH. Inspect `otool -L`/LC_RPATH and §13. Native probe works because current prefix/loader config present; relocated Cargo target requires runtime dependencies too. Mac imported bundle is only Mac target; other two bundles can be stored in same project, not linked by host Cargo accidentally.

### 9.2 Linux guest
Create project snapshot AFTER importing Linux target bundle + sys crate + Cargo.lock. Original source snapshot excludes .git/target; include `third_party/pjsip` intentionally (not ignored by your transport policy). Use `lab.py snapshot`, push, path supplied in original Runbook. Example inside guest:
```bash
cd "$HOME/work/PROJECT_SNAPSHOT_ID"
. "$HOME/.cargo/env"
export PJSIP_SYS_BUNDLE_DIR="$PWD/third_party/pjsip/x86_64-unknown-linux-gnu/FULL_CID"
export PJSIP_SYS_EXPECTED_ID=FULL_CID
export CARGO_TARGET_DIR="$HOME/cargo-target/pj217/linux/FULL_CID"
# Verify on Mac before snapshot; optionally install approved Python verifier inside guest and reverify immutable extracted tree.
export RUST_BACKTRACE=full
cargo fetch --locked
cargo test --locked -p pjsip-sys --target x86_64-unknown-linux-gnu --no-run
cargo test --locked -p pjsip-sys --target x86_64-unknown-linux-gnu -- --list
cargo test --locked -p pjsip-sys --target x86_64-unknown-linux-gnu -- --nocapture --test-threads=1
cargo test --locked -p pjsip-sys --target x86_64-unknown-linux-gnu --release -- --test-threads=1
```
Run whole script via original `lab exec linux --seconds N 'bash PATH'`; standard builder; preserves exit status/log/timeout. If libclang location undiscovered, `find /usr/lib -name 'libclang.so*'`; set exact target-native directory; don't point to Mac library. System OpenSSL runtime must satisfy linked SONAME; minimal runtime VM has explicit dependency package list.

### 9.3 Windows guest
Prepare project snapshot as above with Windows bundle. Guest .ps1:
```powershell
$ErrorActionPreference='Stop'
. C:\ci\work\tools\windows-dev.ps1
Set-Location C:\ci\work\PROJECT_SNAPSHOT_ID
$env:PJSIP_SYS_BUNDLE_DIR="$PWD\third_party\pjsip\x86_64-pc-windows-msvc\FULL_CID"
$env:PJSIP_SYS_EXPECTED_ID='FULL_CID'
$env:CARGO_TARGET_DIR='C:\ci\cargo-target\pj217\windows\FULL_CID'
$env:LIBCLANG_PATH='C:\LLVM\bin'
$env:RUST_BACKTRACE='full'
Native cargo @('fetch','--locked')
Native cargo @('test','--locked','-p','pjsip-sys','--target','x86_64-pc-windows-msvc','--no-run')
Native cargo @('test','--locked','-p','pjsip-sys','--target','x86_64-pc-windows-msvc','--','--list')
Native cargo @('test','--locked','-p','pjsip-sys','--target','x86_64-pc-windows-msvc','--','--nocapture','--test-threads=1')
Native cargo @('test','--locked','-p','pjsip-sys','--target','x86_64-pc-windows-msvc','--release','--','--test-threads=1')
```
Invoke using original encoded PowerShell launcher (`lab exec windows --ps ...`), timeout owned by original harness. Static PJSIP+Opus => no project DLL to place, system CRT/Schannel still required. Binding clang args include exact MSVC INCLUDE dirs via `-imsvc`; don't confuse LLVM binaries with MSVC initialization. Build.rs rejects Windows artifact when Cargo target GNU even though both x64.

### 9.4 Test inventory and what is actually proven
- `t00_identity`: linked pj_get_version2.17 prefix + approved64-hex ID; version alone not patch proof.
- `t10_lifecycle`: pjsua_create/init/null/start/destroy; no physical sound requirement.
- `t20_codecs`: configured C codec enumeration; required G.711/Opus; PJSUA codec get/set parameter calls; OpusPLC0 mitigation readback.
- `t30_transports`: actual loopback-bound UDP/TCP creation/start; no privileged ports/GUI; not SIP transaction conformance or TLS handshake proof.
- `t40_abi`: actual C compiler sizeof/alignof/selected offsetof vs bindgen Clang/Rust; includes pjsua_config/media/acc/call/codec params. Generated bindgen layout tests supplement. Not every arbitrary header/type fully cross-compiler-proved.
- `t50_callbacks`: real PJSUA log callback into Rust; explicit borrowed-byte copy; panic barrier; native destroy before reading final state; verifies callback signature/ownership plumbing, not account/media callback protocol.
- `t60_threads`: external Rust-created thread, PJLIB registration using thread-lifetime TLS descriptor, join BEFORE shutdown; verifies thread registration, not arbitrary async runtime safety.
Each integration test file is distinct process, avoiding PJSUA singleton restart/parallel-test collisions. `--test-threads=1`; lib.rs generated layout tests run separately. Broad bindgen API not all runtime-tested. Every additional struct/callback actually used by application needs analogous native/Rust ABI gate; safe wrapper API invariants must be specified, not inferred from smoke.

Zero test filter can exit0. Require exact IDs from list + observed execution + exit0; original require-test gate can enforce serial libtest output. Generated layout test names depend bindgen version; manifest expected categories/counts checked after discovery, no guessed count. `cargo --no-run` not test execution; compiler JSON not stable libtest result JSON. `--all-targets` not doctests. Run application tests and `cargo test --doc` separately. `cargo clippy` warnings in machine-generated sys bindings may be allowed narrowly; never suppress product safety failures globally.

## 10. Threading, callbacks, ownership: non-negotiable FFI rules
One PJSUA global instance per process; serialize lifecycle. `pjsua_create` initializes PJLIB/registers calling thread; do not call pj_thread_is_registered before init. Any other Rust/OS thread calling PJLIB registers itself (must execute on that thread); descriptor must live entire thread lifetime. Supplied helper uses TLS storage, unsafe precondition; do not register using stack local descriptor then return. Join/stop all external threads before pjsua_destroy/pj_shutdown; a registration helper is not permission to shut library down under worker.

Tokio tasks migrate threads; registering a task != registering execution threads. Prefer dedicated native control thread / actor, command queue; schedule all PJSUA operations there. Callbacks may arrive on native worker/media threads; never assume Tokio context. Callback: no panic across extern C; catch boundary + error event; no blocking reentrant lifecycle call; no borrowed pj_str_t/audio buffer retention; copy to Rust-owned memory or documented transferred-ownership handle. Queue bounded; overflow behavior explicit; no holding same mutex across a C call that synchronously invokes callback requiring it. No `CString::as_ptr()` beyond CString lifetime; no Rust deallocation of PJSIP pool memory; no C free of Rust allocation. Destruction order: stop inbound events -> terminate sessions -> drain/disable callbacks -> join workers -> release dependent pools/objects -> library shutdown. Exceptions at C++/Rust boundary forbidden unless explicitly designed unwind ABI; this guide targets C PJSUA, not C++ ABI binding.

Strings: pj_str_t length authoritative, not necessarily NUL-terminated; reject negative/overflow length before slice; byte encoding policy explicit; don't CStr::from_ptr arbitrary PJ string. Fixed arrays: size macro/profile authoritative; don't manually transcribe pjsua structs into Rust. Bitfields: bindgen accessors (`setting.set_plc(0)`/`plc()`); don't take address of C bitfield. C enum representation: module constants+integer type; invalid network values remain checked integers not invalid Rust discriminants. `Send`/`Sync` not guessed for raw handles; constrain wrappers; store pool ownership/lifetime.

## 11. Native and end-to-end integration beyond ABI smoke
Build/library integration acceptance can stop only at desired contract; product phone/SIP correctness requires actual peers. Maintain separate layers: native suite; C probe; bindgen/layout; Rust lifecycle/callback/thread; application protocol/media/security. Null sound uses clock without hardware; not `pjsua_set_no_snd_dev` (detaches different media port/clock relationship). Runtime media test must supply/pump PCM and assert samples, not merely successful INVITE.

Concrete required product fixture specification (implement against actual product API; no fake app interface invented):
1. Peer CLI starts on OS loopback, known ephemeral/fixed reserved test ports; readiness requires protocol success; credentials/certs/audio fixtures hashed.
2. UDP and TCP registration positive/negative; account IDs distinguish all events; unregister one account leaves other active; no callbacks after destroyed account/session.
3. Two local endpoints or local PBX: INVITE/180/183+SDP/200/ACK/BYE; rejected call/timeout/CANCEL/re-INVITE; exact terminal event and resource cleanup.
4. Deterministic PCM -> selected PCMU/PCMA/Opus -> RTP send/receive -> decoded PCM nonempty/sample count/energy within codec tolerance; DTMF required inband/INFO/RFC4733 tested separately; early media before200.
5. TLS: local CA valid hostname positive; wrong hostname/untrusted/expired certificates negative; capture backend-specific PJ status/log; a generic failed connect without live peer positive-control is not cert-verification proof. Test embedded-NUL SAN only in isolated regression after known fix; fresh2.17 must not be promoted based on ordinary positive test.
6. SRTP: actual negotiated required mode, encrypted packet evidence, mismatched key/policy negative; compile PJMEDIA_HAS_SRTP=1 not negotiation proof.
7. ICE/STUN/TURN: controlled local topology, restart/receive regression for advisory; SLIRP alone not every NAT model. Protected peer/auth/cert material; loopback initial tests avoid QEMU RTP forwarding pitfalls.
8. Cancel/timeouts/shutdown: stop all native/peer processes, bounded queues, no stale callbacks/use-after-free; loop soak under release; ASan/UBSan diagnostic variant where compiler supports, FFI under Miri not direct substitute.

Do not expose pristine2.17 to arbitrary SIP/RTP/registrars. Trusted local peer fixtures only until security approval. Fixed port conflicts fail readiness, not auto-connect unknown service. Windows/headless audio backend tests may enumerate0 devices; that is not failure of null-clock library smoke nor proof physical backend works. Device/permission/hotplug GUI app tests are independent of this library build contract.

## 12. Diagnose wrong libraries/ABI/cache
Native inspection:
```bash
# Linux target binaries/libraries, within Linux
file LIBRARY_OR_EXE
ar t LIBRARY.a
readelf -h EXE
readelf -d EXE
ldd TRUSTED_OWN_EXE
# Mac
file LIBRARY.a
lipo -info LIBRARY.a
ar t LIBRARY.a
otool -L EXE
otool -l EXE | grep -A6 LC_BUILD_VERSION
```
Windows initialized shell:
```powershell
dumpbin /headers PATH_TO_LIB
dumpbin /linkermember:1 PATH_TO_LIB
dumpbin /directives PATH_TO_LIB
dumpbin /dependents PATH_TO_EXE
```
Rust link errors: confirm target/content_id/CRT; `cargo build -vv --locked` preserves rustc and build-script output; native symbol inspection nm/dumpbin; original `pkg-config --static` flags recorded. Linux archive ordering matters, dependency libs after consumers. Parser rejects unknown -Wl/group flags rather than dropping; if adopted source emits them, extend tested link model (or native C shim/shared bridge built by native driver), don't manually omit. Library filename suffixes are actual generated target/config; do not rename to guessed generic names unless metadata updated and exact hashes recorded. /FORCE, suppress duplicate-symbol errors, library-order roulette unacceptable.

Binding failures: run libclang native arch, exact SDK/INCLUDE; printed flags from bundle; generated headers installed; SDKROOT Mac; VScl and libclangMSVC layout gate. Never bindgen x64 on Mac then reuse for Windows (different long/wchar/struct ABI). Transitive PJSIP headers included via captured macro profile. Rust FFI function signature changes require new bindings + native artifact; previous OUT_DIR bindings not authoritative source.

Cache keys include target, source tree, config_site hash, native compiler/toolset/SDK, C runtime, dependency versions/build options, min OS, binding generator/libclang, Rust version, feature vector. Reconfigure fresh after failed dependency detection; stale auto-OFF not fixed by installing package alone. Clear only affected target/CID directory AFTER retaining logs. Native change => new bundleCID; changed bindgen doesn't change nativeCID but does change consumer-build key/lock. Target dirs never shared acrossOS. SameMac permanent prefix paths in meta evidence may be historical; actual bundle.env relative mappings must resolve to intended project tree.

Crash: original Runbook WER LocalDumps/PDB, Linux core/gdb, Mac lldb/dSYM; matching binary/symbol hashes; owned-dump secrets/audio restrictions. Rust backtrace not native-C stack or UB proof. Native failure before Rust starts distinguished from test assertion. Original harness hard timeout kills whole guest/quarantines overlay; source/artifact base remains immutable; do not promote forced-off state.

## 13. Relocation/system dependencies and runtime packaging
Raw static PJSIP+static Opus do not statically absorb every OS/crypto lib. System references intentional, explicit bundle policy `abs:` paths recorded. Rust product packaging MUST inspect final executable (not just nativearchive). Build guest may mask absent DLL/SONAME via developer PATH.

Linux: oldest supported GNU/glibc userspace chosen explicitly; run clean Linux/x64 runtime VM image with only required OpenSSL3/ALSA/UUID/C++ runtime packages (actual ldd/readelf dictates list). No GCC/CMake headers required at runtime. System SSL security updates compatible SONAME may be desired; rebuild/retest when ABI incompatible. Never call GNU artifact “universal Linux”; musl is separate native build/test lane.

Mac OpenSSL: final executable commonly links Homebrew absolute libssl.3.dylib/libcrypto.3.dylib. For sameMac lab, approved installed paths work; not redistributable guarantee. Deployment bundle strategy:
```bash
# Own trusted app; paths taken from actual otool -L, not guessed major versions.
mkdir -p App/lib
cp "$(brew --prefix openssl@3)/lib/libssl.3.dylib" App/lib/
cp "$(brew --prefix openssl@3)/lib/libcrypto.3.dylib" App/lib/
install_name_tool -id @rpath/libssl.3.dylib App/lib/libssl.3.dylib
install_name_tool -id @rpath/libcrypto.3.dylib App/lib/libcrypto.3.dylib
# For EACH actual old absolute dependency path reported by otool:
# install_name_tool -change ACTUAL_OLD_CRYPTO @loader_path/libcrypto.3.dylib App/lib/libssl.3.dylib
# install_name_tool -change ACTUAL_OLD_SSL @executable_path/lib/libssl.3.dylib App/APP
# install_name_tool -change ACTUAL_OLD_CRYPTO @executable_path/lib/libcrypto.3.dylib App/APP
```
Apply exact discovered paths; change direct/transitive deps; verify otool graph no developer-prefix leak. Re-sign modified dylibs/app with authorized identity after changes; then verify signature/notarization as policy; no signing keys in general agent VM. Test copied app from empty cwd without Homebrew dependency search paths. Alternative approved static-PIC OpenSSL removes dylib shipping but adds source-build/patch/license work; not automatic from PJSIP static configuration.

Windows: combined PJSIP/Opus static, CRT dynamic /MD and OS DLL imports. Package authorized VC runtime redistribution if required by finalexe/dependency policy; do not copy arbitrary Windows system DLLs. Clean Windows/x64 runtime VM smoke without BuildTools/LLVM/Git/PJSIP lib PATH; confirm load+init+transports+requiredcodec. If intentionally building DLL ABI variant, need export/import definitions, DLL search-hardening, allocator boundary and exactly-one PJSUA instance; Windows reference PJSIP source doesn't ship generic DLL projects. Don't mislabel combined `.lib` as DLL import.

## 14. Reproducibility/release gate record
Per lane retain: source tag/base/final commit/tree; patch IDs/hash/order/security dispositions; inputsource tarSHA; generated config_site exact hash; configure args+env/build.mak/os_auto.h; native compiler/SDK/toolset/CRT/platform/minOS; Opus sourceSHA+build options; OpenSSL backend/version; actual rawartifact paths/hash; native/probe/suite outputs/counts; bundleCID/archiveSHA; Rust lock/toolchain/libclang/bindgen; build target/features; Rust discovery/execution logs; final binary dependency graph/hash; clean-runtime acceptance. Three lanes must share intendedsource/patchlevel/logicalcapabilities, not necessarily binary hashes/backend.

Pass = no required phase absent, no ignored/missing requiredcodec, no unsupported bindinglayout, no zero-test acceptance, no unknownsyslib silently filled, no plaintext credential in publishedartifact, no unauditedsecurity promotion. Native artifact use is authorized inside repository `third_party`, not global /usr/local mutation. Unmodified original Runbook remains canonical environment/recovery instruction.

## 15. Primary review sources
- Release2.17: https://github.com/pjsip/pjproject/releases/tag/2.17
- POSIX2.17 GNU build: https://docs.pjsip.org/en/2.17/get-started/posix/build_instructions.html
- POSIX application/pkg-config: https://docs.pjsip.org/en/latest/get-started/posix/using.html
- Windows2.17 build/CRT: https://docs.pjsip.org/en/2.17/get-started/windows/build_instructions.html
- Windows2.17 combined-library/header contract: https://docs.pjsip.org/en/2.17/get-started/windows/using.html
- CMake experimental/status/layout caveats: https://docs.pjsip.org/en/latest/get-started/cmake/build_instructions.html
- CMake options: https://docs.pjsip.org/en/latest/get-started/cmake/options.html
- CMake Pj::pjsua-lib export/2.xversion/C++runtime: https://docs.pjsip.org/en/latest/get-started/cmake/using.html
- TLS backends: https://docs.pjsip.org/en/2.17/specific-guides/security/ssl.html
- Opus1.6.1+publisherSHA: https://opus-codec.org/downloads/
- PLC advisory: https://github.com/pjsip/pjproject/security/advisories/GHSA-882g-9pv2-xphr
- Service-Route advisory: https://github.com/pjsip/pjproject/security/advisories/GHSA-xc62-j9h2-mp84
- Vendor advisory index: https://github.com/pjsip/pjproject/security/advisories
- Thread descriptors: https://docs.pjsip.org/en/latest/api/generated/pjlib/group/group__PJ__THREAD.html
- PJSUA base/lifecycle: https://docs.pjsip.org/en/2.17/api/generated/pjsip/group/group__PJSUA__LIB__BASE.html
- Nullmedia: https://docs.pjsip.org/en/2.17/api/generated/pjsip/group/group__PJSUA__LIB__MEDIA.html
- bindgen requirements: https://rust-lang.github.io/rust-bindgen/requirements.html
- bindgen0.73.2: https://github.com/rust-lang/rust-bindgen/releases
- Cargo test semantics: https://doc.rust-lang.org/cargo/commands/cargo-test.html

## 16. Implementation appendix convention
ZIP contains exact code files referenced above; standalone Markdown below embeds same sources. Code isn't vendor certification. `validation.json` records what author actually checked; no PJSIP/MSVC/Rust compiler execution claim in unavailable environment. Native/guest qualification MUST be performed by operator/agent, with original Runbook's strict timeout/exit/restore semantics. No source/runtime result fabricated to satisfy a “complete” label.
