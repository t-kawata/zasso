# Apple-Silicon local-only Rust/C/C++/FFI lab — executable operator manual
Revision: 2026-11-13. Language: EN; terse normative prose. Scope: macOS/ARM64 host; Windows/x64 OS + Linux/x64 OS; local CPU/RAM/disk only; agent-operated CLI; native dependencies; Red–Green–Refactor. Distribution: this manual + adjacent source files. No remote runners. SSH endpoints = loopback-forwarded local guests.

## 0. Claims, boundaries, mandatory gates
**Feasible architecture, not an already hardware-certified image.** QEMU TCG emulates x86_64 machine/CPU; guest OS, MSVC/GCC/Clang, native deps, Rust tests execute there. Not Windows ARM + x64-app translation; not Wine; not cargo-xwin. ARM host cannot HVF-accelerate x86_64 CPU. Never substitute `-cpu host`, HVF, KVM, ARM ISO. TCG latency unmeasured; no speed guarantees. User-mode Docker shares its Linux kernel; not equivalent to x86_64 kernel testing. Full Linux VM = reference gate; amd64 Docker optional fast lane.

Windows 11: approved genuine x64 ISO; UEFI/Secure-Boot-capable firmware, TPM2, CPU/instruction compatibility, >=2 vCPU/>=4GiB/>=64GiB; prescribed firmware/CPU still not Microsoft certification. Setup acceptance != support entitlement. No TPM/CPU-check bypass. Server x64 optional additional lane, never silently substitutes desktop Windows target. Actual audio devices, vendor drivers, native-x64 scheduling/perf, all CPU variants, absence of FFI UB: not proven by emulated tests. Null-audio success != physical device coverage.

Evidence status: bundled Python/Bash/XML generation receives static/host-side tests; macOS/QEMU/Windows/PJSIP execution NOT performed by author in this delivery environment. Treat first complete hardware run as qualification, not presumed Green. Project repository absent: crate names, native adapter, approved features, required test IDs, PJSIP commit/API/capabilities remain project inputs. Harness explicitly rejects unresolved configuration; native phase deliberately fails until integrated. No invented environment-variable API (`PJSIP_DIR`, etc.).

Normative: MUST freeze source+environment; MUST propagate native exit codes; MUST fail zero/missing required tests; MUST distinguish transport/environment/assertion failures; MUST log provenance; MUST preserve failed-run evidence; MUST quarantine forced-off disks; MUST test release + doctests separately. CLI `passed` = command exit 0 ONLY, not project acceptance.

## 1. Files / prerequisites / resource policy
`lab.py`: stdlib host harness; `config.example.json`: mandatory inputs; `guest/`: guest environment/runners; `scripts/`: hash/test/FFI gates; `fixtures/gate`: deterministic Red/Green fixture. Scripts are reference implementations, review before granting privileges.

Host prerequisites: supported macOS Apple Silicon; working CLI Tools; Homebrew; Python >=3.11; OpenSSH client; genuine/licensed Windows x64 media; approved installer downloads; sufficient free SSD. Planning starting point, not minimum certification: 4 vCPU/8GiB per guest, Linux80GiB/Windows128GiB sparse disks. Do not concurrently allocate RAM beyond host capacity. Stop idle VM. Keep lab outside repository; short absolute path; no comma/colon/newline/space in root (QEMU composite-argument safety); normal user, not root. macOS CLT/Homebrew/license/admin authorization are host bootstrap prerequisites, not permission-bypass targets. `xcode-select --install` opens UI; exclude from unattended workflow. Use pre-approved matching CLT PKG + `sudo installer -pkg ... -target /` when host provisioning itself must be noninteractive; acquire/approve legitimately first.

```bash
# Unpack bundle; choose short local path; use existing Homebrew/CLT.
cd "$HOME/rust-local-lab"
xcode-select -p
xcrun --find clang
xcrun --show-sdk-path
uname -m                 # arm64 required
sw_vers
system_profiler SPHardwareDataType
sysctl -n hw.memsize
df -h .
brew install qemu swtpm xorriso wimlib cmake ninja llvm python pkgconf openssl@3 opus
cp config.example.json config.json
python3 lab.py init
```
`init`: directories + dedicated unencrypted Ed25519 automation key; never reuse personal key; never forward SSH agent. `keys/` mode700. Root should be owned by sole lab operator; QMP/TPM sockets placed private `/tmp/rustlab-UID-ROOTHASH`, not exposed TCP.

Edit `config.json`: `rust` exact installed/release version (project MSRV-compatible; bundled edition2024 smoke needs >=1.85); `windows.image` exact WIM IMAGE/NAME; `windows.locale=en-US` for supplied EN bootstrap; choose pinned `machine` (initial `q35`; freeze versioned machine after qualification), `cpu`, memory, ports. `project.*` records policy ONLY; not auto-consumed as build integration. Exact Rust value required before guest operations; Windows IMAGE placeholder permitted during Linux bootstrap, rejected by windows-seed. Read repository `rust-toolchain.toml`; Python `tomllib` can extract `[toolchain].channel`; floating `stable` not final fixed gate. Keep `rust-toolchain.toml` + Cargo.lock in source; no toolchain update during test loop.

```bash
qemu-system-x86_64 --version > locks/qemu-version.txt
qemu-system-x86_64 -machine help > locks/qemu-machines.txt
qemu-system-x86_64 -cpu help > locks/qemu-cpus.txt
qemu-system-x86_64 -accel help > locks/qemu-accelerators.txt
brew list --versions > locks/brew-versions.txt
swtpm --version > locks/swtpm-version.txt
```
Resource/perf gate: measure Rust delta-build, PJSIP clean-build, one FFI test, SIP/RTP test, full verification. Cache/keep-running VM only after correctness. Compilation timeouts intentionally generous; tune from measurements, not native timings.

## 2. Media/provenance/locking
Required trust chain: official publisher -> signature/approved TLS acquisition -> independently reviewed checksum/publisher -> locally locked bytes -> installed-version evidence. Hash computed after arbitrary download proves identity only, not authenticity. Never auto-trust a freshly downloaded key. Never disable signature checks merely to continue. `.sha256` beside binary over same TLS channel is transport integrity aid, not independent publisher attestation.

Host inventory:
- `media/ubuntu-amd64.img`: official Ubuntu amd64 QCOW2.
- `media/windows-x64.iso`: official approved English x64 Windows ISO; exact edition/build/license recorded.
- `media/rustup-init-linux-x64`, `media/rustup-init-macos-arm64`: official rustup executables.
- `seeds/windows/installers/{vs_buildtools.exe,cmake.msi,LLVM.exe,Git.exe,rustup-init.exe}`: approved x64/native Windows installers. Local stable names; original URLs/version/hash/signer retained externally in `locks/provenance.json`.
- `firmware/{linux-code.fd,linux-vars-template.fd,windows-code.fd,windows-vars-template.fd}`: matched source/version/code/template pair; writable copies only inside VM dirs.

Installer acquisition endpoints, not version locks:
```text
https://aka.ms/vs/17/release/vs_buildtools.exe
https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init
https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init
https://cmake.org/download/
https://github.com/llvm/llvm-project/releases
https://git-scm.com/downloads/win
```
Prefer VS offline layout/component manifest for reproducibility. Bootstrapper-only + `includeRecommended` downloads evolving components: not byte-reproducible. Capture `.vsconfig`, installed SDK/toolset/component inventory; archive approved offline layout when strict rebuild needed. LLVM/rustup installers may lack Authenticode; validate upstream release provenance/checksums first. Bootstrap enforces valid Authenticode on VS/CMake/Git, logs all statuses; policy differences require review, never silent bypass.

```bash
# After acquisition AND provenance review; rerun after firmware acquisition.
python3 scripts/record-inputs.py
python3 scripts/verify-media.py
# Inspect/approve locks/inputs.json; retain original signatures/checksum lists.
```
Hash scripts stream files; never hash generated mutable disk/VARS/TPM as static inputs. Verify immediately before seed/build/start/promote. Lock `config.json`, guest scripts, source tar, generated seed separately in run evidence. Seed contains plaintext bootstrap credentials: chmod600; not version-controlled; not uploaded; detach after provisioning; scrub credentials/default auto-logon state after qualification. ISO EULA acceptance requires operator authorization; script is not authorization.

## 3. Linux/x64 first; official cloud image + NoCloud
```bash
BASE=https://cloud-images.ubuntu.com/noble/current
curl -fL --retry 3 "$BASE/noble-server-cloudimg-amd64.img" -o media/ubuntu-amd64.img
curl -fL --retry 3 "$BASE/SHA256SUMS" -o media/ubuntu-SHA256SUMS
curl -fL --retry 3 "$BASE/SHA256SUMS.gpg" -o media/ubuntu-SHA256SUMS.gpg
# Verify detached signature with PRETRUSTED Ubuntu cloud-image signing key/keyring.
# Example, only after trusted keyring provision:
# gpgv --keyring /approved/ubuntu-cloudimage-keyring.gpg media/ubuntu-SHA256SUMS.gpg media/ubuntu-SHA256SUMS
python3 - <<'PY'
import hashlib,pathlib
p=pathlib.Path('media'); rows=[x.split() for x in (p/'ubuntu-SHA256SUMS').read_text().splitlines()]
a=[h for h,n,*_ in rows if n.lstrip('*')=='noble-server-cloudimg-amd64.img']; assert len(a)==1
h=hashlib.sha256()
with (p/'ubuntu-amd64.img').open('rb') as f:
 for b in iter(lambda:f.read(1048576),b''):h.update(b)
assert h.hexdigest()==a[0]
PY
qemu-img info media/ubuntu-amd64.img
```
`current` mutable: archive chosen bytes/date/hash; signature key acquisition out-of-band approval required. `qemu-img info` format MUST be qcow2 for supplied `-F qcow2`; otherwise explicitly convert/review before creation.

```bash
QEMU_SHARE="$(brew --prefix qemu)/share/qemu"
find "$QEMU_SHARE" -maxdepth 2 \( -name '*code*.fd' -o -name '*vars*.fd' -o -name '*.json' \) -print
test -f "$QEMU_SHARE/edk2-x86_64-code.fd"
test -f "$QEMU_SHARE/edk2-i386-vars.fd"
cp "$QEMU_SHARE/edk2-x86_64-code.fd" firmware/linux-code.fd
cp "$QEMU_SHARE/edk2-i386-vars.fd" firmware/linux-vars-template.fd
python3 lab.py linux-seed
python3 lab.py create linux
python3 lab.py start linux --install
# First enrollment only; manually approved localhost/VM association (TOFU).
python3 lab.py enroll linux
python3 lab.py wait linux --seconds 14400
python3 lab.py exec linux --seconds 14400 'cloud-init status --wait && test -f /opt/lab/cloud-ready && uname -m && cat /etc/os-release'
```
If distributed firmware filenames differ: inspect supplied QEMU firmware descriptors; select matched x86_64 CODE/VARS, same geometry; do not rename an arbitrary firmware. Stop, fix config/copies, recreate only unqualified VM. Linux cloud-init: CIDATA seed; standard builder; separate key-only provision account with passwordless sudo for explicit --admin provisioning; DHCP fallback network; package install/logging. `instance-id` regenerated when seed generated; cloud-init initial state cached on disk. Editing seed alone not guaranteed to reprovision existing image. Rebuild overlay, or explicit reviewed cloud-init cleanup; never assume.

Enrollment may initially fail before sshd exists: inspect QMP/serial and repeat boundedly. `wait` uses strict known-host checking; enroll first. Subsequent connections MUST use pinned known_hosts. No blanket StrictHostKeyChecking=no; no automatic host-key deletion. Recreated VM requires verified new identity + deliberate known_hosts update.

After successful provisioning: `python3 lab.py stop linux`; normal subsequent start omits `--install` (no seed). cloud-init logs: `/var/log/cloud-init{,-output}.log`; `cloud-init status --long`; `journalctl -b`. Packages default include ALSA/Opus/OpenSSL development headers; final audited image may pin/snapshot apt repository. Package list is not all possible project deps.

## 4. Windows UEFI + TPM2
Using running Linux guest, official Ubuntu `ovmf` package:
```bash
python3 lab.py exec linux 'dpkg-query -W ovmf; ls -l /usr/share/OVMF'
python3 lab.py get linux /usr/share/OVMF/OVMF_CODE_4M.secboot.fd firmware/windows-code.fd
python3 lab.py get linux /usr/share/OVMF/OVMF_VARS_4M.ms.fd firmware/windows-vars-template.fd
python3 scripts/record-inputs.py
python3 scripts/verify-media.py
```
Package has both paths. Secure-Boot CODE + Microsoft-key VARS, same package/4M geometry; record package version/hash; never `snakeoil` keys. Keep templates immutable. Mutable VARS per VM. Windows TPM per VM `vm/windows/tpm/`; swtpm controller UNIX socket, TPM2; QEMU `tpm-crb`, q35/SMM, secure flash. Firmware template filename alone not proof: in guest `Confirm-SecureBootUEFI`, `Get-Tpm` after bootstrap. Never share live VARS/TPM across VMs. Never restore system disk alone when TPM/UEFI state differs. BitLocker/device encryption may bind disks to TPM; retain recovery material or explicitly choose unencrypted lab disk under approved policy, not arbitrary security disabling.

## 5. Windows media inspection / answer generation
```bash
shasum -a 256 media/windows-x64.iso
mkdir -p media/windows-expanded
xorriso -osirrox on -indev media/windows-x64.iso -extract /sources media/windows-expanded/sources
# One of these exists:
wimlib-imagex info media/windows-expanded/sources/install.wim
# wimlib-imagex info media/windows-expanded/sources/install.esd
```
Set `config.json -> windows.image` to exact IMAGE/NAME from chosen WIM, e.g. `Windows 11 Pro` ONLY if present; locale must match supplied EN example. Retail/evaluation/volume media differ; legitimate key/edition answer may be additionally required. Inspect generated XML; schema/component architecture amd64, exact edition selection. `windows-seed` generates random strong passwords; plaintext in seed; retains `credentials.json` locally chmod600. Language/group assumptions EN-only; translate built-in group names or SID-aware account provisioning before non-EN use.

```bash
# Verify all five installers present; provenance first.
ls -l seeds/windows/installers/
python3 scripts/record-inputs.py
python3 scripts/verify-media.py
python3 lab.py windows-seed
python3 - <<'PY'
import xml.etree.ElementTree as E
r=E.parse('seeds/windows/Autounattend.xml').getroot()
assert r.tag=='{urn:schemas-microsoft-com:unattend}unattend'
PY
python3 lab.py create windows
python3 lab.py start windows --install
```
Seed ISO label LABSEED; XML windowsPE formats Disk0 GPT: EFI300MiB/FAT32, MSR16MiB, remaining NTFS C:. Disk0 wiped. No raw host disk/pass-through; no attached valuable second disk. Lab-minimal layout omits WinRE recovery partition; not generic production Windows deployment. XML handles language, EULA, exact image, local provision(admin)+builder(standard), one-shot provision auto-logon, single FirstLogon bootstrap. OOBE unspecified screens/version changes may still halt; treat as build failure; adjust answer against actual ISO, never declare supported universally. No `SkipMachineOOBE`; no OEM-sensitive SetupComplete dependency. FirstLogon administrative execution must be confirmed from log; no UAC bypass by agent. Multiple FirstLogon commands may launch concurrently on modern Windows; supplied single bootstrap owns sequencing.

Initial DVD may show `Press any key`. Capture first; issue ONE command only after prompt state established:
```bash
python3 lab.py qmp windows query-status
python3 lab.py qmp windows screendump "{\"filename\":\"$PWD/runs/windows-boot.ppm\"}"
sips -s format png runs/windows-boot.ppm --out runs/windows-boot.png
python3 lab.py qmp windows human-monitor-command '{"command-line":"sendkey ret"}'
```
No manual GUI required; QMP key injection is CLI. Do not fixed-time Enter spam. Deterministic full-autobuild: qualify bounded prompt detection for locked ISO/firmware or create legitimately no-prompt boot media with approved Microsoft deployment tools. Generic ISO-independent zero-key boot script NOT provided; this is an explicit qualification item, not hidden manual-GUI dependency. Packer QEMU `boot_command`, headless, CD files, SSH communicator can package same workflow; optional, not required by harness.

Wait bootstrap (install may take long under TCG); then:
```bash
python3 lab.py enroll windows
python3 lab.py wait windows --seconds 28800
python3 lab.py exec windows --admin --ps 'Get-Content C:\ci\bootstrap-ready; Get-Content C:\ci\logs\bootstrap.log -Tail 60; Get-CimInstance Win32_OperatingSystem | Select Caption,Version,BuildNumber,OSArchitecture'
python3 lab.py exec windows --admin --ps 'Get-Tpm; Confirm-SecureBootUEFI; Get-CimInstance Win32_Processor | Select Name,Architecture,AddressWidth'
```
Bootstrap: signature checks; sequential checked installers; detects reboot exit3010 marker; OpenSSH capability install (requires Windows Update/FoD reachability or approved offline FoD source); key-only authentication; standard builder dedicated authorized-key file; admin separate standard Windows admin-key path; SFTP subsystem (required modern scp); ACLs; sshd config `-t`; firewall; auto-logon disabled; readiness sentinel. Ready = bootstrap done, NOT Rust/project qualified. Credentials/default logon/cache removal after full qualification. Installer failure => `C:\ci\bootstrap-failed.txt`; transcript `C:\ci\logs\bootstrap.log`. If sshd never ready: QMP screen + offline diagnosis; never convert timeout to Green.

After success:
```bash
python3 lab.py stop windows
python3 lab.py start windows          # no install/seed/boot-once args
python3 lab.py wait windows
```
This performs required reboot, detaches credential-bearing seed/installation ISO. If startup dirty marker exists, follow §15; never delete marker just to continue. swtpm stops AFTER verified QEMU exit; stale socket handling below.

## 6. Rust + guest helper deployment
Official rustup executables + approved hashes; installer downloads toolchain via network unless preloaded mirror/cache. `--default-toolchain` exact pinned value. Linux and Mac each need host-architecture installer; Windows Rust host MUST x86_64-pc-windows-msvc. `rustc -vV` evidence per lane.

```bash
# Stage Linux executable previously acquired/approved.
python3 lab.py exec linux 'mkdir -p ~/inbox ~/tools'
python3 lab.py put linux inbox/rustup-init media/rustup-init-linux-x64
RUST=$(python3 -c 'import json;print(json.load(open("config.json"))["rust"])')
python3 lab.py exec linux --seconds 14400 "chmod +x ~/inbox/rustup-init && ~/inbox/rustup-init -y --profile minimal --default-host x86_64-unknown-linux-gnu --default-toolchain $RUST && . \$HOME/.cargo/env && rustup component add rustfmt clippy && rustc -vV"
# Host macOS, same approved version; execute reviewed ARM installer:
chmod +x media/rustup-init-macos-arm64
media/rustup-init-macos-arm64 -y --profile minimal --default-toolchain "$RUST"
. "$HOME/.cargo/env"
rustup component add rustfmt clippy
rustc -vV
# Windows rustup copied by bootstrap to C:\ci\work; standard builder installs per-user.
python3 lab.py exec windows --seconds 14400 --ps "& 'C:\ci\work\rustup-init.exe' -y --profile minimal --default-host x86_64-pc-windows-msvc --default-toolchain '$RUST'; if(\$LASTEXITCODE -ne 0){exit \$LASTEXITCODE}; \$env:PATH=\"\$env:USERPROFILE\.cargo\bin;\$env:PATH\"; rustup component add rustfmt clippy; exit \$LASTEXITCODE"
python3 lab.py exec windows --ps 'New-Item -ItemType Directory -Force C:\ci\work\tools | Out-Null'
python3 lab.py put windows C:/ci/work/tools/windows-dev.ps1 guest/windows-dev.ps1
python3 lab.py put windows C:/ci/work/tools/windows-run.ps1 guest/windows-run.ps1
python3 lab.py put windows C:/ci/work/tools/windows-ffi-smoke.ps1 guest/windows-ffi-smoke.ps1
python3 lab.py put linux tools/posix-run.sh guest/posix-run.sh
python3 lab.py put linux tools/ffi-smoke.sh scripts/ffi-smoke.sh
```
`put PLATFORM REMOTE LOCAL` (destination FIRST); `get PLATFORM REMOTE LOCAL`; files only. Remote directories must exist. File args/paths no spaces recommended; no recursive globs. CLI wraps PowerShell using UTF16LE EncodedCommand, avoiding Bash/cmd/PS multiple-quote ambiguity. For long/complex commands: create reviewed .ps1/.sh, put, invoke by path; don't build escaped megastrings.

Windows tool shell: SSH starts cmd by default. Runner dot-sources windows-dev.ps1 -> vswhere detects C++ toolset -> VsDevCmd `-arch=amd64 -host_arch=amd64` -> import env -> append Cargo/LLVM/CMake/Git paths -> `LIBCLANG_PATH=C:\LLVM\bin`. `Get-Command cl,link,cmake,cargo`; rustc host x64; libclang.dll present. Python/LLVM installation alone does not initialize MSVC. Never globally hardcode guessed VC/SDK version directories. vswhere detection + recorded precise toolset is required.

Linux/macOS libclang:
```bash
# Linux inspect; set LIBCLANG_PATH only when needed, to matching libclang directory.
find /usr/lib -name 'libclang.so*' -print
# macOS LLVM:
export LIBCLANG_PATH="$(brew --prefix llvm)/lib"
export PKG_CONFIG_PATH="$(brew --prefix openssl@3)/lib/pkgconfig:$(brew --prefix opus)/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
```

## 7. Source transport / consistency / secrets
Snapshot tool includes tracked+untracked files, deletions represented by fresh extraction, executable modes; excludes .git/target/.local-lab/.DS_Store; preserves empty directories; rejects all symlinks/special files rather than silently changing semantics. Known secret basenames blocked, NOT complete secret scanning. Repository requiring .git/version metadata/symlinks/submodules/LFS needs explicit audited snapshot policy: populate submodules/LFS first; preserve required metadata without embedded credentials; never assume arbitrary tree supported. No concurrent agent writes during snapshot. Source-identical manifest hashed per file; compare source SHA and environment IDs across lanes. Separate lane source copies from one snapshot; don't edit inside guest.

```bash
# SOURCE absolute, lab outside SOURCE; inspect staged content before transfer.
ID=$(python3 lab.py snapshot /absolute/path/to/project)
cat "sources/$ID.json"
tar -tzf "sources/$ID.tar.gz" | head -100
python3 lab.py push linux "$ID"
python3 lab.py push windows "$ID"
```
Each fresh guest run directory; existing ID rejected. Remote SHA256 archive comparison before extraction; trusted own tar only; no arbitrary downloaded archives (path traversal). `git archive HEAD` alone unacceptable: omits uncommitted changes. .env/secrets policy MUST reviewed; default snapshot doesn't honor .gitignore. Host tests MUST use `sources/$ID` staged tree, not still-mutating original repo. File modes/case/CRLF: test actual target filesystem semantics; Windows case-insensitivity can expose source naming defects.

## 8. Native dependencies/PJSIP: explicit adapter contract
Native strategies: (A) project's bundled build.rs builds pinned C/C++ in each OS; (B) explicit native install prefix + build.rs consumes declared manifest. Never double-build with conflicting flags. `native` phases intentionally throw until adapter implemented. Implementation inputs: PJSIP exact commit/version/patch hash, Opus/TLS/SRTP deps, required codecs/transports/backend, static/dynamic, CRT, Debug/Release, symbols, include paths/generated headers, C/C++ compiler versions. Cache key includes ALL. Native prefix may be shared read-only only for identical key. Reconfigure/clean build when ABI/options change. `TARGET/HOST` awareness still required for future cross builds; current native guests simplify, not abolish build.rs correctness.

### 8.1 PJSIP CMake path (ONLY pinned source supporting it)
Upstream labels CMake experimental; documented tested lanes Linux x86_64/macOS; Windows instructions exist but do not imply upstream-tested equivalence. CMake >=3.28 per current docs. Prefer adopted-version Windows solution/MSBuild if CMake lacks required behavior. Do not assume release2.17 archive contains latest-dev CMake. First `test -f vendor/pjproject/CMakeLists.txt`; fail if absent. CMake unsupported/unused-variable warnings are build failures when controlling required capabilities.

POSIX, project root:
```bash
# Adopted source already pinned + fetched. Choose lane precisely.
PREFIX="$PWD/native-install/pjsip"
case "$(uname -s):$(uname -m)" in
 Linux:x86_64) EXTRA=(-DPJLIB_WITH_IOQUEUE=epoll -DPJLIB_WITH_SSL=openssl) ;;
 Darwin:arm64) EXTRA=(-DCMAKE_OSX_ARCHITECTURES=arm64 -DPJLIB_WITH_IOQUEUE=kqueue -DPJLIB_WITH_SSL=openssl "-DCMAKE_PREFIX_PATH=$(brew --prefix openssl@3);$(brew --prefix opus)") ;;
 *) exit 2 ;;
esac
cmake -S vendor/pjproject -B native-build/pjsip -G Ninja \
 -DCMAKE_BUILD_TYPE=RelWithDebInfo \
 -DCMAKE_INSTALL_PREFIX="$PREFIX" \
 -DPJMEDIA_WITH_VIDEO=OFF -DBUILD_TESTING=ON "${EXTRA[@]}"
cmake -LAH -N native-build/pjsip > artifacts/pjsip-options.txt
cmake --build native-build/pjsip --parallel 4
ctest --test-dir native-build/pjsip --show-only=json-v1 > artifacts/pjsip-tests.json
ctest --test-dir native-build/pjsip --output-on-failure
cmake --install native-build/pjsip
```
Windows, developer PS session:
```powershell
. C:\ci\work\tools\windows-dev.ps1
# PROJECT_ROOT selected explicitly; mkdir artifacts first.
Native cmake @('-S','vendor/pjproject','-B','native-build/pjsip','-G','Visual Studio 17 2022','-A','x64',
 '-DCMAKE_INSTALL_PREFIX=C:/ci/deps/pjsip','-DPJMEDIA_WITH_VIDEO=OFF','-DPJLIB_WITH_SSL=schannel','-DBUILD_TESTING=ON')
Native cmake @('--build','native-build/pjsip','--config','RelWithDebInfo','--parallel','4')
Native ctest @('--test-dir','native-build/pjsip','-C','RelWithDebInfo','--output-on-failure')
Native cmake @('--install','native-build/pjsip','--config','RelWithDebInfo')
```
TLS choice above intentionally platform-dependent; same logical capabilities not same backend. If OpenSSL required Windows too, build approved x64 OpenSSL and pass actual package/prefix config. Don't infer SDK SSL means third-party OpenSSL. Opus absent may silently disable Opus: inspect actual pinned source option names, CMake cache/log, generated config, then runtime codec enumeration/roundtrip. Never blindly invent `-D` option. `cmake -LAH -N ... | grep -Ei 'opus|ssl|srtp|codec'`; Windows `Select-String`. CMake defaults/options case-sensitive; unknown vars can be ignored; mandatory capability needs explicit assertion.

Build Opus from pinned CMake-capable source if no suitable target package:
```bash
cmake -S vendor/opus -B native-build/opus -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo -DBUILD_SHARED_LIBS=OFF -DCMAKE_INSTALL_PREFIX="$PWD/native-install/deps"
cmake --build native-build/opus --parallel 4
cmake --install native-build/opus
# Feed install prefix to PJSIP CMAKE_PREFIX_PATH, plus required TLS prefix.
```
Windows equivalent: VS2022 x64 generator; `--config RelWithDebInfo` build/install; add actual install prefix. Verify upstream Opus version's options, tests, CMake package naming. TLS/SRTP/video options in config_site.h must not conflict with CMake-generated definitions. Windows `/MD` vs `/MT`, debug CRT, native deps, Rust target-feature crt-static must agree; don't switch Rust CRT independently. Multi-config Visual Studio ignores CMAKE_BUILD_TYPE; use build `--config`, CTest `-C`.

### 8.2 Non-CMake adopted PJSIP
POSIX reference: inspect `./configure --help`, apply approved config_site.h/features, `./configure --prefix=...`, `make dep`, `make -j4`, `make install`; exact adopted-version tests per source. Windows: locate `.sln`, read GlobalSection(SolutionConfigurationPlatforms), project configurations; use VS MSBuild with EXISTING configuration/platform; e.g. only after verification:
```powershell
Native MSBuild.exe @('pjproject-vs14.sln','/m:4','/p:Configuration=Release','/p:Platform=x64')
```
If x64 configuration absent, add audited platform/project configuration or choose supported build path; do not claim `/p:Platform=x64` creates it. pjsua startup-project GUI instructions translate to explicit build target/config, not IDE clicks. Full solution may include optional failing samples; specify adopted library/target set from inspected solution.

### 8.3 FFI adapter
Manifest MUST bind headers/generated config to exact built libs. build.rs emits include/link-search/link-lib for target; no universal PJSIP_DIR standard. bindgen uses matching target/includes/defines, not host's unrelated headers; libclang availability explicit. C ABI shim preferred for C++ boundary; no unwinding/panic across non-unwind ABI; explicit ownership/free rules/thread callbacks. Test sizeof/align/offsets, enum/int widths, pointer width, calling convention, init/destroy cycles, callbacks, cancellation, lifetime, double-free/leak behavior. Bundled FFI smoke tests ABI plumbing only, NOT PJSIP compatibility/UB proof.

## 9. Concrete build/test commands
Deploy helpers §6; source push §7. Examples use ID from snapshot; substitute quoted actual ID, not literal shell `$ID` inside PS single quotes unless expanded deliberately.
```bash
python3 lab.py exec linux --seconds 14400 "bash ~/tools/posix-run.sh ~/work/$ID fetch"
python3 lab.py exec linux --seconds 14400 "bash ~/tools/posix-run.sh ~/work/$ID build"
python3 lab.py exec linux --seconds 7200 "bash ~/tools/posix-run.sh ~/work/$ID test"
python3 lab.py exec windows --seconds 14400 --ps "& C:\ci\work\tools\windows-run.ps1 -Root C:/ci/work/$ID -Phase fetch"
python3 lab.py exec windows --seconds 14400 --ps "& C:\ci\work\tools\windows-run.ps1 -Root C:/ci/work/$ID -Phase build"
python3 lab.py exec windows --seconds 7200 --ps "& C:\ci\work\tools\windows-run.ps1 -Root C:/ci/work/$ID -Phase test"
bash guest/posix-run.sh "$PWD/sources/$ID" test
```
Windows `$ID` in double-quoted host argument expands Bash var, not PowerShell var; paths use literal source ID. If using zsh/Bash differently, use command file rather than fragile interpolation. Helpers native phase intentionally fails; build.rs-based projects use build/test normally after configuring native adapter contract.

Additional phases: `doctor`, `fetch`, `build`, `test`, `release-test`, `list`, `lint`, `doc`. Features = explicit reviewed list (PS `-Features 'tls,srtp'`; POSIX fourth arg). Mutually exclusive features: enumerated matrix, no indiscriminate `--all-features`. Test filter exact mode in helpers; require-list gate before targeted pass. Package/integration target selection when duplicate names: use explicit `-p CRATE --test TARGET`, not workspace-wide ambiguity. Tests sharing PJSIP global state run `--test-threads=1` initially; process-isolate before safe parallelism. `RUST_LOG` only effective if application initializes compatible logger. Don't weaken assertions to accommodate slow TCG; use deadlines justified by emulation time and deterministic signals.

Raw Cargo matrix (run inside proper lane/dev environment):
```bash
cargo fetch --locked
cargo metadata --locked --format-version 1 > artifacts/cargo-metadata.json
cargo tree --locked > artifacts/cargo-tree.txt
cargo build --locked --workspace
cargo build --locked --workspace --release
cargo test --locked --workspace --no-run --message-format=json > artifacts/test-build.jsonl
cargo test --locked --workspace -- --list
cargo test --locked --workspace --no-fail-fast -- --test-threads=1
cargo test --locked --workspace --release --no-fail-fast -- --test-threads=1
cargo test --locked --workspace --doc
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --frozen --workspace
```
Target triples: host ARM Mac `aarch64-apple-darwin`; guest Windows `x86_64-pc-windows-msvc`; Linux `x86_64-unknown-linux-gnu`. `--no-run` compile only; `--all-targets` not doctests; `--message-format=json` Cargo/compiler messages not stable libtest JSON; zero matched tests can exit0; `--frozen` Cargo offline+locked, does not sandbox arbitrary build.rs/tests/network. Run CTest too; CTest zero tests is not native-suite acceptance. Parse `ctest --show-only=json-v1` against required native test manifest.

POSIX `set -euo pipefail`, `2>&1 | tee ...` with pipefail. PS native exit checked immediately; `$ErrorActionPreference='Stop'` alone insufficient. SSH wrapper failure255 distinct transport; nonzero native status command_failed until classified from phase/log. Preserve Windows raw crash code in guest-specific result if needed; SSH exit is not entire NTSTATUS domain.

## 10. Required-test Red/Green acceptance
Create snapshot of bundled fixture (`fixtures/gate`) or copy it into audited project test area; `cargo generate-lockfile --offline` once, commit fixture lock before snapshot (dependency-free). Fixture Rust edition2024. Normal test passes; env LAB_FORCE_RED=1 must fail; ordinary Green after removing env must pass. Native/FFI smoke separately.
```bash
# In each lane, at fixture root:
cargo generate-lockfile --offline
LAB_FORCE_RED=1 cargo test --locked lab_red_green -- --exact --nocapture
# Expected nonzero assertion failure; not environment failure.
cargo test --locked -- --list > list.log
cargo test --locked lab_red_green -- --exact --nocapture > test.log 2>&1
# Mac gate script, using retrieved logs:
python3 scripts/require-test.py lab_red_green list.log test.log
```
Windows equivalent: `$env:LAB_FORCE_RED='1'`; cargo; capture `$LASTEXITCODE`; require nonzero and expected assertion, then `Remove-Item Env:LAB_FORCE_RED`, rerun; never assert that any nonzero means valid Red. Helpers throw on nonzero; expected Red is recorded as expected assertion only after log inspection. Linux/Mac `bash scripts/ffi-smoke.sh`; Linux staged copy `bash ~/tools/ffi-smoke.sh`; Windows `& C:\ci\work\tools\windows-ffi-smoke.ps1`; run release variant too when adapter demands. These fixture tests qualify transport/compiler/ABI, not product logic.

Stable libtest gate script deliberately strict: exact `NAME: test` + exact `test NAME ... ok` in serial captured output; custom harness/nextest/parallel interleaving requires explicit adapter. No stdout text-only pass without exit0. Manifest minimum: source hash, environment ID, OS/CPU, exact required IDs, feature vector, expected count, phase, start/end/elapsed, exit/raw status, logs/artifact hashes. Missing/ignored/skipped required test = failure. Discovery impossible/unsupported output = fail closed.

## 11. Runtime/timeout/cancellation semantics
`lab exec` captures stdout/stderr/result under unique `runs/TIMESTAMP-ID`; prints metadata; returns nonzero unless remote exit0. Outer timeout: kills SSH via Python subprocess handling, QMP hard-stops whole VM; marks DIRTY; no descendant can survive terminated VM. This is intentionally conservative, not a job-object incremental runner. Entire VM must be exclusive to this exec (one run/guest). Other simultaneous guest jobs would also die: prohibited. Hard stop may damage current overlay; quarantine, retain artifacts, reset clean base (§15); NEVER promote hard-stopped disk. If cleanup_error or QEMU still running, block further work until controlled stop verified. Cancel/timeout != assertion Red. Faster implementation may use Windows Job Object+KILL_ON_JOB_CLOSE and POSIX session/process groups; SSH disconnect alone not process cleanup. No claim these advanced runners are bundled.

CLI synopsis:
```text
lab.py init
lab.py linux-seed | windows-seed
lab.py create PLATFORM
lab.py start PLATFORM [--install] [--restricted]
lab.py enroll PLATFORM
lab.py wait PLATFORM [--seconds N]
lab.py stop PLATFORM [--hard]
lab.py qmp PLATFORM COMMAND [ARGUMENTS_JSON]
lab.py snapshot SOURCE
lab.py push PLATFORM SNAPSHOT_ID
lab.py put PLATFORM REMOTE LOCAL [--admin]
lab.py get PLATFORM REMOTE LOCAL [--admin]
lab.py exec PLATFORM [--admin] [--ps] [--seconds N] COMMAND
```
`--ps` Windows only semantically (parser doesn't enforce); `--admin` separate provision account on either guest; normal build/test builder. `--restricted`: QEMU user-net restrict with hostfwd retained; blocks ordinary outbound; verify with controlled network tests. run command strings are trusted operator/agent code, NOT untrusted user input. Socket/port/PID stale state must be inspected; do not recursively rm `/tmp` wildcards.

## 12. QMP/monitor/VM diagnostics
```bash
python3 lab.py qmp windows query-status
python3 lab.py qmp windows query-version
python3 lab.py qmp windows query-cpus-fast
python3 lab.py qmp windows query-block
python3 lab.py qmp windows stop        # pause VM, not shutdown
python3 lab.py qmp windows cont
python3 lab.py qmp windows human-monitor-command '{"command-line":"info usernet"}'
python3 lab.py qmp windows human-monitor-command '{"command-line":"info tpm"}'
python3 lab.py qmp windows screendump "{\"filename\":\"$PWD/runs/screen.ppm\"}"
python3 lab.py stop windows           # ACPI; waits verified process exit
python3 lab.py stop windows --hard    # forced; DIRTY quarantine
```
Replace windows->linux analogously. `system_reset` cold-ish hardware reset != graceful reboot; explicit dirty-risk operation. `quit` forced exit; use stop --hard so dirty marker maintained. Direct QMP mutating commands bypass harness policy; only for reviewed recovery. `-display none` still emulated display available for screendump; no graphic desktop automation needed for normal loop. `serial.log` Windows may be empty without configured serial output; not proof of hang. QMP query failure != process exit: harness separately checks PID identity with exact disk path; mismatch refuses kill. Known-host/SSH readiness independent from QMP running.

TPM stale socket: inspect `runtime` printed by init, swtpm PID+command, owning socket (`lsof -U`), QEMU PID before deletion. Clean `lab stop windows` validates swtpm identity and waits; if failed-start left untrusted PID, manually inspect. Never kill arbitrary reused PID. Normal restart preserves VARS/TPM; seed detached. OVMF CODE updates only as reviewed environment migration; do not swap under existing VM.

## 13. Inside-OS information acquisition
Windows developer PS:
```powershell
Get-CimInstance Win32_OperatingSystem | Select Caption,Version,BuildNumber,OSArchitecture
Get-CimInstance Win32_Processor | Select Name,Architecture,AddressWidth
Get-Process | Sort CPU -Descending | Select -First 20
Get-NetTCPConnection; Get-NetUDPEndpoint; Get-NetIPAddress; Get-NetRoute
Get-PSDrive -PSProvider FileSystem; Get-Service sshd
Get-Command cargo,rustc,cl,link,cmake
rustc -vV; cargo -V; cmake --version
Get-WinEvent -LogName Application -MaxEvents 100
Get-WinEvent -LogName System -MaxEvents 100
Get-ChildItem Env: | Sort Name  # redact secrets BEFORE sharing
```
Paths: `C:\Windows\Panther\`, `C:\Windows\Panther\UnattendGC\`, `C:\ci\logs\bootstrap.log`, `C:\ci\bootstrap-failed.txt`; inspect sshd events/config/ACL before random changes. Install layout logs/version inventory retained. `dumpbin /headers EXE_OR_LIB`; `dumpbin /dependents EXE`; compare x64 machine, DLL dependency set; /MD,/MT flags from verbose native build + toolset config, not guess.

Linux:
```bash
uname -a; cat /etc/os-release; lscpu; free -h; df -h
ps aux; ss -lntup; ip address; ip route
journalctl -b --no-pager; dmesg
cloud-init status --long
file BINARY; readelf -h BINARY; readelf -d BINARY; ldd BINARY
# ldd only on trusted own binaries; inspect readelf first.
```
Mac:
```bash
sw_vers; uname -a; xcode-select -p; xcrun --show-sdk-path
clang --version; rustc -vV; ps aux; vm_stat; df -h; lsof -nP -i
file BINARY; otool -L BINARY
```
Native CMake: `cmake -LAH -N BUILD`; `cmake --build BUILD --verbose`; `ctest --test-dir BUILD -N`; Windows add `--config CONFIG`/`-C CONFIG`. Logs include native configure/build/test output, generated headers/hash, capabilities, resolved libraries. Snapshot environment vars only allowlisted/redacted.

## 14. Crash/hang forensics
Rust `RUST_BACKTRACE=full`; app logs `RUST_LOG=debug` if initialized. Build native debug symbols (`RelWithDebInfo`, /Zi+/DEBUG, PDB; Linux debug info; macOS dSYM if generated). Ship executable, retain matching symbols indexed by binary hash. Test executable path from Cargo compiler-artifact JSON; run exact binary under debugger, not guessed hash-name. Compiler JSON != stable libtest result JSON.

Windows admin WER LocalDumps:
```powershell
New-Item -ItemType Directory -Force C:\ci\dumps | Out-Null
$k='HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps'
New-Item -Force $k | Out-Null
New-ItemProperty $k -Name DumpFolder -PropertyType ExpandString -Value 'C:\ci\dumps' -Force | Out-Null
New-ItemProperty $k -Name DumpType -PropertyType DWord -Value 2 -Force | Out-Null
New-ItemProperty $k -Name DumpCount -PropertyType DWord -Value 10 -Force | Out-Null
icacls.exe C:\ci\dumps /grant 'builder:(OI)(CI)M'
if($LASTEXITCODE -ne 0){throw 'dump ACL failure'}
```
Requires admin; process identity needs write ACL. Custom crash-reporting applications may not use WER LocalDumps. Dumps may contain passwords/audio/PII; encrypt/restrict/retention-delete. WER crash collection != hang dump; use approved debugger/ProcDump when hang evidence needed; stage/pin such tools separately.

Linux: `ulimit -c unlimited`; `cat /proc/sys/kernel/core_pattern`; if installed/configured `coredumpctl list`, `coredumpctl info`, `coredumpctl dump PID --output=...`. Without systemd-coredump, configure approved core path; don't assume tooling exists. `gdb -batch -ex run -ex 'thread apply all bt' --args TEST_BINARY ...`; `strace -ff -o artifacts/strace TEST_BINARY ...`. macOS `lldb --batch -o run -o 'thread backtrace all' -- TEST_BINARY ...`; read crash reports under `~/Library/Logs/DiagnosticReports`; ptrace/debug entitlement/TCC restrictions may require authorized host setup, not UI-bypass script.

Failures triage order: (1) source/env ID (2) infrastructure readiness (3) compiler/deps (4) actual required capability (5) test discovery/count (6) assertion/runtime (7) network/media (8) cache-free reproduction. Preserve before clearing cache. No test repair by deleting assertion, raising timeout unboundedly, hiding failed platform, disabling required feature.

## 15. Clean base, overlay, quarantine, restore
Stop normally; verify processes exited. Windows swtpm stopped. Copy/check coherent disk+VARS+TPM ONLY offline. Linux backing cloud image immutable; flatten to self-contained base to remove absolute external backing dependency. No `qemu-img check/convert/commit` writes on live disk. QMP pause alone not sufficient permission for external modification.

```bash
python3 lab.py stop windows
python3 lab.py stop linux
mkdir -p bases/windows bases/linux
qemu-img convert -O qcow2 vm/windows/system.qcow2 bases/windows/system.qcow2
qemu-img convert -O qcow2 vm/linux/system.qcow2 bases/linux/system.qcow2
cp vm/windows/vars.fd bases/windows/vars.fd
cp -R vm/windows/tpm bases/windows/tpm
cp vm/linux/vars.fd bases/linux/vars.fd
cp config.json bases/config.json
cp locks/inputs.json bases/inputs.json
# Retain qemu/swtpm/OS/compiler/PJSIP manifests beside base.
qemu-img info bases/windows/system.qcow2
qemu-img info bases/linux/system.qcow2
```
Base creation prerequisite: Red+Green, FFI, all required tools/capability checks, no pending reboot, standard-user test succeeds, auto-logon disabled, seed detached, provisioning credentials protected, state clean. Baseline VS/Rust/native caches intentionally captured if approved; source-specific cache identity recorded. Byte-identical builds not promised just because base exists.

Reset Windows after timeout/dirty or for clean gate (all stopped; explicit destructive scope):
```bash
python3 lab.py stop windows --hard     # only if still running; retain diagnostics first
mkdir -p quarantine
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mv vm/windows "quarantine/windows-$STAMP"
mkdir -p vm/windows
qemu-img create -f qcow2 -F qcow2 -b "$PWD/bases/windows/system.qcow2" vm/windows/system.qcow2
cp bases/windows/vars.fd vm/windows/vars.fd
cp -R bases/windows/tpm vm/windows/tpm
python3 lab.py start windows
python3 lab.py wait windows
```
Linux analogous: move vm/linux, new overlay of bases/linux, copy vars, start without seed. Host known keys persist if restored same OS base; recreated initial install keys differ -> deliberate identity enrollment. Never run two Windows clones sharing mutable TPM or same disk; independent copied state per clone; ports/runtime IDs must differ if concurrent clones (bundled harness supports one VM/platform only). Do not promote forced-off disk. Quarantine may need offline `qemu-img check`/read-only inspection; repair separate copy, not evidence original.

## 16. SIP/media/network test topology
Fast deterministic lane: each OS runs product + controlled peer on loopback; null sound device drives clock; fixed PCM fixtures, test accounts/ports, readiness protocol. `pjsua_set_null_snd_dev` / PJSUA2 setNullDev supplies conference clock without hardware. `pjsua_set_no_snd_dev` / setNoDev detaches sound/master-port relationship; not equivalent clock source. Physical backend/device tests separate; no null-device claim for real mic/speaker/permissions/hotplug.

Required layers: Rust state/IDs/events; FFI init/destroy/callback/ownership; SIP REGISTER/unregister/INVITE/reject/BYE/timeouts; early media; DTMF required methods; PCM/codec/RTP; TLS/SRTP positive+negative certs; account isolation; cancellation/reentrancy; subscribe/notify/publish if required; NAT/STUN/TURN/ICE under controlled topology. Account-specific requirements taken from project spec, not inferred from successful sample call. Peer MUST CLI start/stop, protocol-ready handshake, reproducible response/SDP/timing/error injection, unique ports, run-tagged logs, child cleanup. Choose pinned SIPp/Asterisk/custom peer with project fixtures; no universal SIP scenario fits unknown API. Freeze scenario/audio/cert hashes.

Full interoperability: Linux VM runs pinned PBX/peer; Windows and Mac connect over explicitly defined topology. QEMU user-net default guest host address typically10.0.2.2; hostfwd protocol/port; SDP advertised address+RTP range must correspond. Single forwarded SIP port insufficient. UDP/TCP TLS and media separately; TCP-only smoke not proof UDP/RTP. Example add hostfwd `tcp:127.0.0.1:15060-:5060` or UDP equivalent at QEMU start; bind local test services loopback where possible. `restrict=on` blocks normal egress; allow only explicit forwarding; verify policy with controlled target. Mac firewall changes require authorization.

NAT/ICE/TURN conformance cannot be inferred from SLIRP alone. Build additional local network fixture topology (Linux router/netns/controlled peers) with explicit mapping/filter/loss/delay; ensure packets actually traverse intended path. SIP/media traces tcpdump/Wireshark-compatible PCAP; redact credentials/audio. Multiple-account ports/collisions isolated; peer readiness != open TCP socket only. Cross-VM timing under TCG not real-world latency characterization.

## 17. Packaging/compatibility/signing
Package exactly binaries from tested native lane; no replacement by untested cross-build. Validate machine/ABI, dynamic libs, CRT, symbols association, capability enumeration, release execution from empty cwd. Separate clean runtime VM WITHOUT build tools/cached dependency PATH; copy only intended distribution tree; run startup+major feature checks. CMake/VS/LLVM/OpenSSL in build VM may mask missing DLLs. Windows system CRT/dependency redistribution licenses distinct; PJSIP GPL/commercial terms review separate. Linux GNU build min supported glibc/distro determined explicitly; target triple alone not distro compatibility; build/test oldest supported userspace, newer matrix. musl alternative not drop-in for arbitrary native deps.

Mac code signing/notarization, Windows signing: separate approved signing stage; no permanent signing key in agent guests; sign tested artifact; verify signature; signed artifact smoke test where relevant. Hash artifacts + source/env IDs; retain PDB/dSYM/debug files privately. No license/EULA circumvention, no unofficial modified Windows images.

## 18. Environment and product acceptance matrix
Environment MUST pass: host arm64; guests actual x64 OS/kernel+Rust host; compiler C/C++/Rust smoke; C↔Rust ABI smoke; standard-user test; expected Red assertion propagated to Mac; Green propagated; missing-test fails gate; timeout kills VM and marks DIRTY; failed SSH classified; no orphan guest after termination; fresh overlay restores; VM offline rebuild without manual GUI; disk-space failure caught; missing compiler/DLL surfaces; source hash same all lanes; bootstrap/OS/compiler/media evidence retained. Every version/firmware change reruns environment gate.

Product MUST pass: approved feature combinations; native-suite required IDs/counts; Rust unit/integration/doctest; release tests; FFI/layout/callback/lifetime tests; required SIP/media/security/network cases; fresh runtime package smoke; no hidden skipped required OS; artifact/source/env correlation. Formatting/clippy success alone not Green. Test count zero, custom output unsupported, stale artifact, missing manifest => failure.

Perf assessment: cold native build, warm Rust delta, one exact test each OS, full verify, memory/disk usage, TCG CPU load. Record hardware host model/RAM/macOS/QEMU/guest versions/flags and cache state. Fast Windows ARM/x64-app lane optional supplements, never silently replaces full x64 guest gate. Remote CI useful elsewhere but violates this lab's local-only constraint.

## 19. Failure table / operator limits
|Symptom|First evidence/action|
|---|---|
|QEMU fails start|captured CLI stderr, last-start.json, machine/CPU help, firmware geometry, stale sockets/PID identity|
|No boot|QMP status+screendump; correct ISO x64; boot prompt; firmware/TPM; instruction compatibility; no requirement bypass|
|Setup/OOBE wait|exact IMAGE/NAME, answer XML, locale/edition/key, Panther logs, full OOBE settings|
|No SSH|bootstrap sentinel/log, OpenSSH capability/FoD access, service/config `-t`, firewall, hostfwd|
|Auth/SFTP failure|user/key/ACL, admin Match, Subsystem sftp, pinned host key; never passwords-on by convenience|
|cl/link absent|vswhere component inventory + VsDevCmd; exact SDK/toolset|
|bindgen fails|libclang path/architecture, headers/defines, SDK include availability|
|Link failure|native feature/CRT/arch/lib order/import-vs-static/DLL config; verbose link log|
|Required codec missing|CMake auto-OFF/options spelling, actual generated config, runtime enum/roundtrip|
|0 tests|filter/name/package/target/list; ignored/custom harness; fail closed|
|Hang|peer readiness, clock/null device, deadlock/callback threads, timeout evidence then quarantine|
|Media absent|SDP/RTP address+ports, codec, clock, PCM injection, NAT path|
|Release-only failure|ABI/UB/lifetimes/CRT/optimization; symbols+native debug tools|
|Only Mac passes|OS cfg paths, dependency availability, backend assumptions, case/permissions|

Agent normal privilege: source editing/snapshot; controlled VM start/stop; builder build/test/log/get; disposable-run cleanup. Admin lane explicitly for setup/config/updates/dumps; no broad host sudo. Protected: base replacement, firmware/CPU/machine/toolchain updates, TPM reset, license, firewall, signing credentials, original evidence deletion. Harness config/commands trusted within that boundary; not secure multi-tenant service. QEMU emulation != perfect security boundary; no host-home sharing/raw disks/USB passthrough/agent forwarding; root run prohibited; update QEMU under change control. Host sandboxing features Linux-only (seccomp/AppArmor) not assumed on macOS.



### 19.1 Offline Windows rescue when SSH/bootstrap never starts
No GUI required. First terminate Windows (quarantine if forced); confirm QEMU process exited AND TPM stopped. Work on flattened forensic COPY, never active/original disk. Copy may be large; preserve source/VM manifest. Linux admin lane required; install rescue packages under explicit change record; do not promote modified rescue VM as clean product test environment.
```bash
python3 lab.py stop windows --hard
mkdir -p artifacts/rescue
qemu-img convert -O qcow2 vm/windows/system.qcow2 artifacts/rescue/windows-copy.qcow2
python3 lab.py exec linux --admin 'mkdir -p ~/inbox; chmod 700 ~/inbox'
python3 lab.py put linux inbox/windows-copy.qcow2 artifacts/rescue/windows-copy.qcow2 --admin
python3 lab.py exec linux --admin --seconds 14400 'sudo apt-get update && sudo apt-get install -y qemu-utils ntfs-3g && sudo modprobe nbd max_part=16'
python3 lab.py exec linux --admin 'sudo qemu-nbd --read-only --connect=/dev/nbd0 /home/provision/inbox/windows-copy.qcow2 && sudo udevadm settle && lsblk -f /dev/nbd0'
# Supplied answer layout: Windows partition3. VERIFY lsblk before mounting.
python3 lab.py exec linux --admin 'sudo mkdir -p /mnt/win-rescue && sudo mount -t ntfs-3g -o ro /dev/nbd0p3 /mnt/win-rescue'
python3 lab.py exec linux --admin 'sudo tar -C /mnt/win-rescue -czf /home/provision/inbox/windows-diagnostics.tgz Windows/Panther ci && sudo chown provision:provision /home/provision/inbox/windows-diagnostics.tgz && chmod 600 /home/provision/inbox/windows-diagnostics.tgz'
python3 lab.py get linux inbox/windows-diagnostics.tgz artifacts/rescue/windows-diagnostics.tgz --admin
python3 lab.py exec linux --admin 'sudo umount /mnt/win-rescue && sudo qemu-nbd --disconnect /dev/nbd0'
```
If ci absent, tar logs missing path and exits nonzero: collect Windows/Panther alone explicitly; not a successful diagnostic bundle until file exists and hash checked. NBD module unavailable => approved matching guest kernel modules/reboot, not forced host attachment. Dirty/hibernated NTFS or encryption may prevent mount: no `force`, no hibernation deletion, no password/BitLocker bypass; use authorized recovery key or forensic read-only tooling. Rescue output contains answer files/credentials; restrict permissions/encrypt. Never mutate original evidence.

## 20. Source register / review anchors
Authoritative review entrypoints; version-lock adopted sources locally. Source claims correspond to cited documents; bundled glue code is authored reference code, not vendor-certified.
- QEMU invocation/TCG/hostfwd/pflash/headless: https://www.qemu.org/docs/master/system/invocation.html
- QMP greeting/capabilities/events/request IDs: https://www.qemu.org/docs/master/interop/qmp-spec.html
- Monitor/screenshot/network/TPM: https://www.qemu.org/docs/master/system/monitor.html
- TPM/swtpm/state: https://www.qemu.org/docs/master/specs/tpm.html
- Network: https://www.qemu.org/docs/master/system/devices/net.html
- Security: https://www.qemu.org/docs/master/system/security.html
- Brew QEMU/swtpm: https://formulae.brew.sh/formula/qemu ; https://formulae.brew.sh/formula/swtpm
- NoCloud: https://cloudinit.readthedocs.io/en/latest/reference/datasources/nocloud.html
- Ubuntu cloud image: https://cloud-images.ubuntu.com/noble/current/
- OVMF paths: https://packages.ubuntu.com/noble/all/ovmf/filelist
- Windows unattended: https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/automate-windows-setup
- GPT: https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/configure-uefigpt-based-hard-drive-partitions
- OOBE: https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/automate-oobe
- FirstLogon: https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/microsoft-windows-shell-setup-firstlogoncommands
- SetupComplete limitations: https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/add-a-custom-script-to-windows-setup
- Windows11 requirements: https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements
- OpenSSH: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse
- SSH config/keys: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration ; https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement
- VS install flags: https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio
- MSVC shell: https://learn.microsoft.com/en-us/cpp/build/building-on-the-command-line
- VS detection: https://learn.microsoft.com/en-us/visualstudio/install/tools-for-managing-visual-studio-instances
- WER: https://learn.microsoft.com/en-us/windows/win32/wer/collecting-user-mode-dumps
- Rust MSVC: https://doc.rust-lang.org/rustc/platform-support/windows-msvc.html
- Cargo tests: https://doc.rust-lang.org/cargo/commands/cargo-test.html
- Cargo build.rs: https://doc.rust-lang.org/cargo/reference/build-scripts.html
- bindgen: https://rust-lang.github.io/rust-bindgen/requirements.html
- PJSIP experimental status: https://docs.pjsip.org/en/latest/get-started/cmake/index.html
- PJSIP CMake: https://docs.pjsip.org/en/latest/get-started/cmake/build_instructions.html
- Options: https://docs.pjsip.org/en/latest/get-started/cmake/options.html
- POSIX: https://docs.pjsip.org/en/latest/get-started/posix/build_instructions.html
- Windows: https://docs.pjsip.org/en/latest/get-started/windows/build_instructions.html
- Null audio: https://docs.pjsip.org/en/latest/api/generated/pjsip/group/group__PJSUA__LIB__MEDIA.html
- Optional Packer image builder: https://developer.hashicorp.com/packer/integrations/hashicorp/qemu/latest/components/builder/qemu
- Packer unattended Windows: https://developer.hashicorp.com/packer/guides/automatic-operating-system-installs/autounattend_windows

## 21. Completion statement
Concrete boundary: media/toolchain parameters + project-native/test adapter are REQUIRED inputs, not filled with fictitious defaults. Reference harness covers local VM creation/control, seed generation, SSH enrollment, exact-source transport, native shell init, Cargo phases, logs/status/screenshots, conservative timeout cleanup, offline restore, diagnostics, package gates. First real Mac qualification remains required. No claim every arbitrary Rust/native project works unchanged; no missing project API fabricated. If source/tool/OS requirements conflict, return explicit unsatisfied constraint, never hidden fallback.

## 22. Bundled host-check invocation
`python3 tests/test_host.py` — AST/Bash parse; mocked ISO command/XML+YAML generation; snapshot/hash/empty-dir exclusion; strict SSH/PS encoding; fake UNIX QMP greeting/capabilities/request-ID/event interleave. See VALIDATION.json for author-run results and explicit non-executed OS/VM checks. Mock ISO is not boot media. Tests do not run PowerShell/MSVC/QEMU/PJSIP.

# Appendix A — Exact bundled source; materialize paths verbatim
Prefer included ZIP for executable hierarchy; below preserves every implementation byte textually. No external code dependency beyond declared tools. Invoke Python/Bash explicitly; scripts not pre-certified on macOS/Windows.

## .gitignore
```text
config.json
media/
firmware/
keys/
vm/
seeds/
runs/
sources/
locks/
__pycache__/
```

## VALIDATION.json
```json
{
  "validation_count": 12,
  "results": [
    {
      "test": "python-ast",
      "file": "lab.py",
      "status": "passed"
    },
    {
      "test": "python-ast",
      "file": "tests/test_host.py",
      "status": "passed"
    },
    {
      "test": "python-ast",
      "file": "scripts/record-inputs.py",
      "status": "passed"
    },
    {
      "test": "python-ast",
      "file": "scripts/require-test.py",
      "status": "passed"
    },
    {
      "test": "python-ast",
      "file": "scripts/verify-media.py",
      "status": "passed"
    },
    {
      "test": "bash-syntax",
      "file": "scripts/ffi-smoke.sh",
      "status": "passed"
    },
    {
      "test": "bash-syntax",
      "file": "guest/posix-run.sh",
      "status": "passed"
    },
    {
      "test": "unattend-generation-xml-escaping-accounts-bootstrap",
      "status": "passed"
    },
    {
      "test": "cloud-init-yaml-parse",
      "status": "passed"
    },
    {
      "test": "snapshot-hash-emptydir-exclusion",
      "status": "passed"
    },
    {
      "test": "powershell-encoding-strict-ssh",
      "status": "passed"
    },
    {
      "test": "qmp-handshake-request-id-interleaved-events",
      "status": "passed"
    }
  ],
  "environment": "Linux Python sandbox; not macOS/QEMU guest execution",
  "not_executed": [
    "macOS Homebrew/CLT installation",
    "QEMU/TCG VM boot",
    "OVMF/Secure Boot/TPM initialization",
    "Windows Setup/OOBE and PowerShell execution",
    "MSVC/LLVM/Rust/PJSIP native build and tests",
    "full media/software supply-chain verification"
  ],
  "policy": "Host/static/mock checks only. No real guest certification implied."
}
```

## config.example.json
```json
{
  "rust": "REPLACE_WITH_EXACT_RUST_VERSION",
  "cpus": 4,
  "memory_mib": 8192,
  "machine": "q35",
  "cpu": "max",
  "linux": {
    "port": 2223,
    "user": "builder",
    "disk_gib": 80,
    "admin": "provision"
  },
  "windows": {
    "port": 2222,
    "user": "builder",
    "admin": "provision",
    "disk_gib": 128,
    "image": "REPLACE_WITH_EXACT_WIM_IMAGE_NAME",
    "locale": "en-US"
  },
  "media": {
    "linux_image": "media/ubuntu-amd64.img",
    "windows_iso": "media/windows-x64.iso"
  },
  "project": {
    "features": [],
    "native_mode": "project",
    "pjsip_source": "vendor/pjproject",
    "required_capabilities": []
  },
  "timeouts": {
    "build": 14400,
    "test": 3600,
    "command": 600
  }
}
```

## fixtures/gate/Cargo.toml
```toml
[package]
name="lab-gate"
version="0.1.0"
edition="2024"
```

## fixtures/gate/src/lib.rs
```rust
#[test]
fn lab_red_green(){assert_ne!(std::env::var("LAB_FORCE_RED").as_deref(),Ok("1"));}
```

## guest/posix-run.sh
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=${1:?source-root}; PHASE=${2:-test}; FILTER=${3:-}; FEATURES=${4:-}
cd "$ROOT"
mkdir -p artifacts
if [[ -f "$HOME/.cargo/env" ]]; then source "$HOME/.cargo/env"; fi
export RUST_BACKTRACE=full RUST_LOG=debug CARGO_TERM_COLOR=never
case "$(uname -s):$(uname -m)" in
 Darwin:arm64) TARGET=aarch64-apple-darwin ;;
 Linux:x86_64) TARGET=x86_64-unknown-linux-gnu ;;
 *) echo 'Unexpected OS/CPU' >&2; exit 2 ;;
esac
flags=(--locked --workspace --target "$TARGET")
if [[ -n "$FEATURES" ]]; then flags+=(--features "$FEATURES"); fi
case "$PHASE" in
 doctor) uname -a; rustc -vV; cargo -V; cmake --version; clang --version ;;
 fetch) cargo fetch --locked ;;
 build) cargo build "${flags[@]}" ;;
 test)
   args=(test "${flags[@]}" --no-fail-fast)
   [[ -z "$FILTER" ]] || args+=("$FILTER")
   args+=(-- --nocapture --test-threads=1)
   [[ -z "$FILTER" ]] || args+=(--exact)
   cargo "${args[@]}" ;;
 release-test) cargo test "${flags[@]}" --release --no-fail-fast -- --test-threads=1 ;;
 list) cargo test "${flags[@]}" -- --list ;;
 doc) cargo test "${flags[@]}" --doc ;;
 lint) cargo fmt --all -- --check; cargo clippy "${flags[@]}" --all-targets -- -D warnings ;;
 native) echo 'Implement approved project-specific native adapter' >&2; exit 2 ;;
 *) echo 'Unknown phase' >&2; exit 2 ;;
esac
```

## guest/windows-bootstrap.ps1
```powershell
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'C:\ci'
New-Item -ItemType Directory -Force -Path $root,"$root\logs","$root\work","$root\artifacts" | Out-Null
Start-Transcript -Path "$root\logs\bootstrap.log" -Append
function Install-Checked([string]$File,[string[]]$Arguments) {
    $p=Start-Process -FilePath $File -ArgumentList $Arguments -Wait -PassThru
    if($p.ExitCode -notin @(0,3010)){throw "Installer failed $File : $($p.ExitCode)"}
    if($p.ExitCode -eq 3010){Set-Content "$root\reboot-required" 'true'}
}
function Native-Checked([string]$File,[string[]]$Arguments) {
    & $File @Arguments
    if($LASTEXITCODE -ne 0){throw "Native failed $File : $LASTEXITCODE"}
}
try {
    $seed=Split-Path -Parent $PSCommandPath
    $inst=Join-Path $seed 'installers'
    # Provenance/hash review performed on Mac before seed generation; verify Authenticode here too.
    foreach($name in @('vs_buildtools.exe','cmake.msi','LLVM.exe','Git.exe','rustup-init.exe')) {
        $path=Join-Path $inst $name
        if(!(Test-Path $path)){throw "Missing installer $path"}
        $sig=Get-AuthenticodeSignature $path
        $sig | Format-List | Out-String | Add-Content "$root\logs\signatures.log"
        # Rust release provenance may be detached-signature based. Never assume every upstream EXE is Authenticode-signed.
        if($name -in @('vs_buildtools.exe','cmake.msi','Git.exe') -and $sig.Status -ne 'Valid'){throw "Invalid Authenticode $path : $($sig.Status)"}
    }
    Install-Checked "$inst\vs_buildtools.exe" @('--quiet','--wait','--norestart','--installPath','C:\BuildTools','--add','Microsoft.VisualStudio.Workload.VCTools','--includeRecommended')
    Install-Checked 'msiexec.exe' @('/i',"`"$inst\cmake.msi`"",'/qn','/norestart','ADD_CMAKE_TO_PATH=System')
    Install-Checked "$inst\LLVM.exe" @('/S','/D=C:\LLVM')
    Install-Checked "$inst\Git.exe" @('/VERYSILENT','/NORESTART','/NOCANCEL','/SP-')
    Copy-Item "$inst\rustup-init.exe" "$root\work\rustup-init.exe" -Force
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    New-Item -ItemType Directory -Force C:\ProgramData\ssh | Out-Null
    $pub=(Get-Content (Join-Path $seed 'lab_ed25519.pub') -Raw).Trim()
    if(!$pub.StartsWith('ssh-ed25519 ')){throw 'Invalid public key'}
    $bk='C:\ProgramData\ssh\builder_authorized_keys'
    Set-Content -Encoding ascii $bk $pub
    Native-Checked icacls.exe @($bk,'/inheritance:r')
    Native-Checked icacls.exe @($bk,'/grant:r','*S-1-5-18:F','*S-1-5-32-544:F','builder:R')
    $ak='C:\ProgramData\ssh\administrators_authorized_keys'
    Set-Content -Encoding ascii $ak $pub
    Native-Checked icacls.exe @($ak,'/inheritance:r')
    Native-Checked icacls.exe @($ak,'/grant:r','*S-1-5-18:F','*S-1-5-32-544:F')
    @'
PubkeyAuthentication yes
PasswordAuthentication no
AllowUsers builder provision
Subsystem sftp C:/Windows/System32/OpenSSH/sftp-server.exe

Match User builder
    AuthorizedKeysFile C:/ProgramData/ssh/builder_authorized_keys

Match Group administrators
    AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys
'@ | Set-Content -Encoding ascii C:\ProgramData\ssh\sshd_config
    Native-Checked "$env:WINDIR\System32\OpenSSH\sshd.exe" @('-t')
    Native-Checked icacls.exe @("$root\work",'/grant','builder:(OI)(CI)M')
    Native-Checked icacls.exe @("$root\artifacts",'/grant','builder:(OI)(CI)M')
    Set-Service sshd -StartupType Automatic
    if(!(Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)){
        New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }
    $wl='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    Set-ItemProperty $wl AutoAdminLogon '0'
    Remove-ItemProperty $wl DefaultPassword -ErrorAction SilentlyContinue
    Set-Content "$root\bootstrap-ready" (Get-Date -Format o)
    Start-Service sshd
}
catch { $_ | Out-String | Set-Content "$root\bootstrap-failed.txt"; throw }
finally { Stop-Transcript }
```

## guest/windows-dev.ps1
```powershell
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$vswhere="${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'MSVC not found'}
$dev=Join-Path $vs 'Common7\Tools\VsDevCmd.bat'
$lines=& cmd.exe /d /s /c "`"$dev`" -no_logo -arch=amd64 -host_arch=amd64 && set"
if($LASTEXITCODE -ne 0){throw 'VsDevCmd failed'}
foreach($line in $lines){
    if($line -match '^([^=]+)=(.*)$'){
        [Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process')
    }
}
$env:PATH="$env:USERPROFILE\.cargo\bin;C:\LLVM\bin;C:\Program Files\CMake\bin;C:\Program Files\Git\cmd;$env:PATH"
$env:LIBCLANG_PATH='C:\LLVM\bin'
function Native([string]$File,[string[]]$Arguments){
    & $File @Arguments
    if($LASTEXITCODE -ne 0){throw "$File exited $LASTEXITCODE"}
}
```

## guest/windows-ffi-smoke.ps1
```powershell
param([string]$Root='C:\ci\work\ffi-smoke')
. "$PSScriptRoot\windows-dev.ps1"
New-Item -ItemType Directory -Force $Root | Out-Null
Set-Location $Root
@'
#include <stdint.h>
#include <stddef.h>
typedef struct { uint32_t a; uint64_t b; } sample;
size_t sample_size(void) { return sizeof(sample); }
size_t sample_align(void) { return __alignof(sample); }
uint64_t add64(uint64_t a,uint64_t b) { return a+b; }
'@ | Set-Content -Encoding ascii abi.c
@'
#[repr(C)] struct Sample {a:u32,b:u64}
unsafe extern "C" {fn sample_size()->usize;fn sample_align()->usize;fn add64(a:u64,b:u64)->u64;}
fn main(){unsafe{assert_eq!(sample_size(),size_of::<Sample>());assert_eq!(sample_align(),align_of::<Sample>());assert_eq!(add64(20,22),42);}}
'@ | Set-Content -Encoding ascii main.rs
Native cl.exe @('/nologo','/c','/MD','abi.c','/Foabi.obj')
Native lib.exe @('/nologo','/OUT:abi.lib','abi.obj')
Native rustc @('--edition','2024','main.rs','-L','native=.','-l','static=abi','-o','smoke.exe')
Native .\smoke.exe @()
```

## guest/windows-run.ps1
```powershell
param(
 [Parameter(Mandatory=$true)][string]$Root,
 [ValidateSet('doctor','fetch','build','test','release-test','list','lint','doc','native')][string]$Phase='test',
 [string]$Filter='',
 [string]$Features=''
)
. "$PSScriptRoot\windows-dev.ps1"
Set-Location $Root
New-Item -ItemType Directory -Force artifacts | Out-Null
$env:RUST_BACKTRACE='full'
$env:CARGO_TERM_COLOR='never'
# Project must initialize tracing/logging itself for RUST_LOG to have effect.
$env:RUST_LOG='debug'
$flags=@('--locked','--workspace','--target','x86_64-pc-windows-msvc')
if($Features){$flags+=@('--features',$Features)}
switch($Phase){
 doctor {
   Get-CimInstance Win32_OperatingSystem | ConvertTo-Json
   Get-CimInstance Win32_Processor | ConvertTo-Json
   Native rustc @('-vV'); Native cargo @('-V')
   Native cmake @('--version'); Get-Command cl,link
   if(!(Test-Path "$env:LIBCLANG_PATH\libclang.dll")){throw 'libclang missing'}
 }
 fetch {Native cargo @('fetch','--locked')}
 build {Native cargo (@('build')+$flags)}
 test {
   $a=@('test')+$flags+@('--no-fail-fast')
   if($Filter){$a+=@($Filter)}
   $a+=@('--','--nocapture','--test-threads=1')
   if($Filter){$a+=@('--exact')}
   Native cargo $a
 }
 'release-test' {Native cargo (@('test')+$flags+@('--release','--no-fail-fast','--','--test-threads=1'))}
 list {Native cargo (@('test')+$flags+@('--','--list'))}
 lint {Native cargo @('fmt','--all','--','--check'); Native cargo (@('clippy')+$flags+@('--all-targets','--','-D','warnings'))}
 doc {Native cargo (@('test')+$flags+@('--doc'))}
 native {throw 'Implement approved project-specific native adapter; no inferred PJSIP_DIR contract'}
}
exit 0
```

## lab.py
```python
#!/usr/bin/env python3
"""Local-only reference harness. Python stdlib; run from any cwd."""
import argparse, base64, datetime, hashlib, json, os, pathlib, secrets
import shlex, shutil, signal, socket, subprocess, sys, tarfile, time, uuid
import xml.etree.ElementTree as ET
R=pathlib.Path(__file__).resolve().parent
if any(x in str(R) for x in [',',':','\n',' ']):raise RuntimeError('Lab root must not contain space/comma/colon/newline')
os.chdir(R)
C=json.loads((R/'config.json').read_text()) if (R/'config.json').exists() else {}
def check():
    if not C: raise RuntimeError('cp config.example.json config.json; edit all REPLACE values')
    if 'REPLACE' in C.get('rust','REPLACE') or C.get('rust') in ['stable','beta','nightly']: raise RuntimeError('Unresolved exact Rust version')
    if C['linux']['port']==C['windows']['port']:raise RuntimeError('Guest SSH ports must differ')
    if int(C['cpus'])<2 or int(C['memory_mib'])<4096:raise RuntimeError('Baseline requires >=2 vCPU and >=4096MiB')
def run(args, **kw):
    return subprocess.run([str(x) for x in args],check=True,**kw)
def dump(p,v):
    p=pathlib.Path(p); p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.tmp'); tmp.write_text(json.dumps(v,indent=2)+'\n'); tmp.replace(p)
def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def runtime():
    p=pathlib.Path('/tmp')/('rustlab-'+str(os.getuid())+'-'+hashlib.sha256(str(R).encode()).hexdigest()[:12])
    if p.exists() and (p.is_symlink() or p.stat().st_uid!=os.getuid()): raise RuntimeError('Unsafe runtime path')
    p.mkdir(mode=0o700,exist_ok=True); p.chmod(0o700); return p
S=runtime()
def qmp(p,cmd,args=None,timeout=30):
    s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.settimeout(timeout)
    s.connect(str(S/(p+'.qmp'))); f=s.makefile('rwb')
    def recv():
        line=f.readline()
        if not line: raise RuntimeError('QMP closed')
        return json.loads(line)
    if 'QMP' not in recv(): raise RuntimeError('No QMP greeting')
    result=None
    for ident,name,a in [(1,'qmp_capabilities',{}),(2,cmd,args or {})]:
        f.write((json.dumps({'execute':name,'arguments':a,'id':ident})+'\r\n').encode());f.flush()
        while True:
            m=recv()
            if m.get('id')!=ident: continue
            if 'error' in m: raise RuntimeError(m['error'])
            result=m.get('return');break
    f.close();s.close();return result

def sshbase(p,user=None,enroll=False):
    return ['ssh','-T','-i',str(R/'keys/lab_ed25519'),'-p',str(C[p]['port']),
      '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ForwardAgent=no',
      '-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=4',
      '-o','UserKnownHostsFile='+str(R/'keys'/('known_hosts_'+p)),
      '-o','StrictHostKeyChecking='+('accept-new' if enroll else 'yes'),
      (user or C[p]['user'])+'@127.0.0.1']
def remote(p,command,user=None,enroll=False,**kw):
    return subprocess.run(sshbase(p,user,enroll)+[command],**kw)
def pscommand(script):
    enc=base64.b64encode(script.encode('utf-16le')).decode()
    return 'powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand '+enc
def psq(s):return "'"+str(s).replace("'","''")+"'"
def scp(p,src,dst,download=False,user=None):
    b=sshbase(p,user); host=b[-1]; opts=b[2:-1]
    # scp port flag differs from ssh; use fresh options, not string splitting.
    cmd=['scp','-i',str(R/'keys/lab_ed25519'),'-P',str(C[p]['port']),
      '-o','BatchMode=yes','-o','IdentitiesOnly=yes',
      '-o','UserKnownHostsFile='+str(R/'keys'/('known_hosts_'+p)),
      '-o','StrictHostKeyChecking=yes']
    run(cmd+([host+':'+src,dst] if download else [src,host+':'+dst]))
def disk(p):return R/'vm'/p/'system.qcow2'
def running(p):
    f=S/(p+'.pid')
    if not f.exists():return False
    pid=int(f.read_text().strip())
    text=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout.strip()
    if not text:return False
    if 'qemu-system-x86_64' not in text or str(disk(p)) not in text:raise RuntimeError('QEMU PID identity mismatch')
    return True
def live(p):
    try:qmp(p,'query-status');return True
    except (OSError,RuntimeError):return False
def init():
    for x in ['media','firmware','keys','seeds/linux','seeds/windows/installers','vm/linux','vm/windows/tpm','runs','sources','locks']:
        (R/x).mkdir(parents=True,exist_ok=True)
    (R/'keys').chmod(0o700)
    if not (R/'keys/lab_ed25519').exists():
        run(['ssh-keygen','-t','ed25519','-N','','-C','local-rust-lab','-f',R/'keys/lab_ed25519'])
    print(json.dumps({'root':str(R),'runtime':str(S)}))
def linux_seed():
    key=(R/'keys/lab_ed25519.pub').read_text().strip()
    data="""#cloud-config
hostname: rust-linux-x64
ssh_pwauth: false
disable_root: true
users:
  - name: builder
    groups: [adm]
    shell: /bin/bash
    lock_passwd: true
    ssh_authorized_keys:
      - KEY
  - name: provision
    groups: [adm, sudo]
    shell: /bin/bash
    lock_passwd: true
    sudo: ["ALL=(ALL) NOPASSWD:ALL"]
    ssh_authorized_keys:
      - KEY
package_update: true
packages: [openssh-server, build-essential, clang, libclang-dev, cmake, ninja-build, pkg-config, git, curl, ca-certificates, python3, gdb, lldb, strace, lsof, tcpdump, libssl-dev, libopus-dev, libasound2-dev, uuid-dev, ovmf]
runcmd:
  - [systemctl, enable, --now, ssh]
  - [sh, -c, "mkdir -p /opt/lab && touch /opt/lab/cloud-ready"]
""".replace('KEY',key)
    d=R/'seeds/linux';(d/'user-data').write_text(data)
    (d/'meta-data').write_text('instance-id: rust-linux-'+uuid.uuid4().hex+'\nlocal-hostname: rust-linux-x64\n')
    run(['xorriso','-as','mkisofs','-o',d/'seed.iso','-V','CIDATA','-J','-r',d/'user-data',d/'meta-data'])
def windows_seed():
    check()
    if 'REPLACE' in C['windows']['image']:raise RuntimeError('Unresolved Windows WIM image name')
    d=R/'seeds/windows'
    ns='urn:schemas-microsoft-com:unattend';wcm='http://schemas.microsoft.com/WMIConfig/2002/State'
    ET.register_namespace('',ns);ET.register_namespace('wcm',wcm)
    root=ET.Element('{'+ns+'}unattend')
    def el(parent,tag,value=None,**attrs):
        n=ET.SubElement(parent,'{'+ns+'}'+tag,attrs)
        if value is not None:n.text=str(value)
        return n
    def comp(parent,name):return el(parent,'component',name='Microsoft-Windows-'+name,processorArchitecture='amd64',publicKeyToken='31bf3856ad364e35',language='neutral',versionScope='nonSxS')
    def add(parent,name):return el(parent,name,**{'{'+wcm+'}action':'add'})
    pe=el(root,'settings',**{'pass':'windowsPE'}); loc=comp(pe,'International-Core-WinPE');lang=C['windows']['locale']
    ui=el(loc,'SetupUILanguage');el(ui,'UILanguage',lang)
    for n in ['InputLocale','SystemLocale','UILanguage','UserLocale']:el(loc,n,lang)
    setup=comp(pe,'Setup');dc=el(setup,'DiskConfiguration');di=add(dc,'Disk');el(di,'DiskID',0);el(di,'WillWipeDisk','true')
    cp=el(di,'CreatePartitions')
    for order,typ,size in [(1,'EFI',300),(2,'MSR',16),(3,'Primary',None)]:
        n=add(cp,'CreatePartition');el(n,'Order',order);el(n,'Type',typ)
        el(n,'Size',size) if size else el(n,'Extend','true')
    mp=el(di,'ModifyPartitions')
    for order,pid,fmt,label,letter in [(1,1,'FAT32','System',None),(2,3,'NTFS','Windows','C')]:
        n=add(mp,'ModifyPartition')
        for k,v in [('Order',order),('PartitionID',pid),('Format',fmt),('Label',label)]:el(n,k,v)
        if letter:el(n,'Letter',letter)
    el(dc,'WillShowUI','OnError')
    oi=el(el(setup,'ImageInstall'),'OSImage');md=add(el(oi,'InstallFrom'),'MetaData');el(md,'Key','/IMAGE/NAME');el(md,'Value',C['windows']['image'])
    it=el(oi,'InstallTo');el(it,'DiskID',0);el(it,'PartitionID',3);el(oi,'WillShowUI','OnError')
    ud=el(setup,'UserData');el(ud,'AcceptEula','true');el(ud,'FullName','Local Build Lab');el(ud,'Organization','Local Build Lab')
    sp=comp(el(root,'settings',**{'pass':'specialize'}),'Shell-Setup');el(sp,'ComputerName','RUST-WIN-X64');el(sp,'TimeZone','Tokyo Standard Time')
    oo=el(root,'settings',**{'pass':'oobeSystem'});lc=comp(oo,'International-Core')
    for n in ['InputLocale','SystemLocale','UILanguage','UserLocale']:el(lc,n,lang)
    shell=comp(oo,'Shell-Setup');oobe=el(shell,'OOBE')
    for n in ['HideEULAPage','HideOnlineAccountScreens','HideWirelessSetupInOOBE']:el(oobe,n,'true')
    passwords={u:secrets.token_urlsafe(27)+'aA1!' for u in ['provision','builder']}
    accounts=el(el(shell,'UserAccounts'),'LocalAccounts')
    for user,group in [('provision','Administrators'),('builder','Users')]:
        a=add(accounts,'LocalAccount');el(a,'Name',user);el(a,'DisplayName',user);el(a,'Group',group)
        pw=el(a,'Password');el(pw,'Value',passwords[user]);el(pw,'PlainText','true')
    auto=el(shell,'AutoLogon');el(auto,'Enabled','true');el(auto,'LogonCount',1);el(auto,'Username','provision')
    pw=el(auto,'Password');el(pw,'Value',passwords['provision']);el(pw,'PlainText','true')
    f=add(el(shell,'FirstLogonCommands'),'SynchronousCommand');el(f,'Order',1);el(f,'Description','Provision build lab')
    el(f,'CommandLine', 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$d=(Get-Volume | Where-Object FileSystemLabel -eq \'LABSEED\' | Select-Object -First 1).DriveLetter; if(-not $d){exit 1}; & ($d+\':\\bootstrap.ps1\')"')
    ET.indent(root);ET.ElementTree(root).write(d/'Autounattend.xml',encoding='utf-8',xml_declaration=True)
    (d/'Autounattend.xml').chmod(0o600)
    shutil.copy2(R/'guest/windows-bootstrap.ps1',d/'bootstrap.ps1')
    shutil.copy2(R/'keys/lab_ed25519.pub',d/'lab_ed25519.pub')
    dump(d/'credentials.json',passwords);(d/'credentials.json').chmod(0o600)
    # Explicit file list excludes credentials.json from ISO; XML still contains credentials.
    run(['xorriso','-as','mkisofs','-o',d/'seed.iso','-V','LABSEED','-J','-r','-graft-points','Autounattend.xml='+str(d/'Autounattend.xml'),'bootstrap.ps1='+str(d/'bootstrap.ps1'),'lab_ed25519.pub='+str(d/'lab_ed25519.pub'),'installers='+str(d/'installers')])
    (d/'seed.iso').chmod(0o600)
def create(p):
    check()
    if disk(p).exists():raise RuntimeError('Disk exists; never overwrite implicitly')
    if p=='linux':
        run(['qemu-img','create','-f','qcow2','-F','qcow2','-b',R/C['media']['linux_image'],disk(p),str(C[p]['disk_gib'])+'G'])
        template=R/'firmware/linux-vars-template.fd'
    else:
        run(['qemu-img','create','-f','qcow2',disk(p),str(C[p]['disk_gib'])+'G'])
        template=R/'firmware/windows-vars-template.fd'
    shutil.copy2(template,R/'vm'/p/'vars.fd')
def start(p,install=False,restricted=False):
    check()
    if running(p) or live(p):raise RuntimeError('Already running')
    if (R/'vm'/p/'DIRTY').exists():raise RuntimeError('Dirty VM; archive/reset offline before reuse')
    if not disk(p).exists():raise RuntimeError('Run create first')
    for suffix in ['qmp','pid']:(S/(p+'.'+suffix)).unlink(missing_ok=True)
    net='user,id=n0,'+('restrict=on,' if restricted else '')+'hostfwd=tcp:127.0.0.1:'+str(C[p]['port'])+'-:22'
    machine=C['machine']+(',smm=on' if p=='windows' else '')
    cmd=['qemu-system-x86_64','-name','rust-'+p+'-x64','-machine',machine,'-accel','tcg,thread=multi','-cpu',C['cpu'],'-smp',str(C['cpus']),'-m',str(C['memory_mib']),
      '-drive','if=pflash,format=raw,readonly=on,file='+str(R/'firmware'/(p+'-code.fd')),
      '-drive','if=pflash,format=raw,file='+str(R/'vm'/p/'vars.fd'),
      '-drive','if='+('virtio' if p=='linux' else 'ide')+',format=qcow2,file='+str(disk(p)),
      '-netdev',net,'-device',('virtio-net-pci' if p=='linux' else 'e1000')+',netdev=n0',
      '-display','none','-serial','file:'+str(R/'vm'/p/'serial.log'),
      '-qmp','unix:'+str(S/(p+'.qmp'))+',server=on,wait=off','-pidfile',str(S/(p+'.pid')),'-daemonize']
    if p=='windows':
        sock=S/'windows.tpm'
        if sock.exists():raise RuntimeError('TPM socket exists; inspect stale/running swtpm, do not unlink blindly')
        run(['swtpm','socket','--tpmstate','dir='+str(R/'vm/windows/tpm'),'--ctrl','type=unixio,path='+str(sock),'--tpm2','--log','file='+str(R/'vm/windows/swtpm.log')+',level=1','--pid','file='+str(S/'windows.swtpm.pid'),'--daemon'])
        cmd+=['-global','driver=cfi.pflash01,property=secure,value=on','-chardev','socket,id=chrtpm,path='+str(sock),'-tpmdev','emulator,id=tpm0,chardev=chrtpm','-device','tpm-crb,tpmdev=tpm0']
        if install:cmd+=['-drive','media=cdrom,format=raw,readonly=on,file='+str(R/C['media']['windows_iso']),'-drive','media=cdrom,format=raw,readonly=on,file='+str(R/'seeds/windows/seed.iso'),'-boot','once=d']
    elif install:cmd+=['-drive','media=cdrom,format=raw,readonly=on,file='+str(R/'seeds/linux/seed.iso')]
    dump(R/'vm'/p/'last-start.json',{'argv':cmd,'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'restricted':restricted})
    try:run(cmd)
    except Exception:
        (R/'vm'/p/'DIRTY').write_text('Failed start; inspect swtpm and logs\n');raise
    print(json.dumps({'platform':p,'runtime':str(S),'qmp':qmp(p,'query-status')}))
def wait(p,seconds):
    end=time.monotonic()+seconds
    cmd='true' if p=='linux' else pscommand("if (!(Test-Path C:\\ci\\bootstrap-ready)) {exit 1}; exit 0")
    while time.monotonic()<end:
        try:r=remote(p,cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=35)
        except subprocess.TimeoutExpired:time.sleep(5);continue
        if r.returncode==0:return
        time.sleep(5)
    raise RuntimeError('Readiness timeout; inspect QMP screenshot/bootstrap logs; do not mark green')
def stop(p,hard=False):
    if running(p):
        if hard:
            (R/'vm'/p/'DIRTY').write_text('Forced poweroff; quarantine/reset required\n')
            try:qmp(p,'quit')
            except (OSError,RuntimeError):
                if running(p):os.kill(int((S/(p+'.pid')).read_text()),signal.SIGTERM)
        else:qmp(p,'system_powerdown')
    deadline=time.monotonic()+300
    while running(p) and time.monotonic()<deadline:time.sleep(2)
    if running(p):raise RuntimeError('Shutdown timeout; explicitly inspect/force; not stopped')
    if p=='windows':
        pidfile=S/'windows.swtpm.pid'
        if pidfile.exists():
            pid=int(pidfile.read_text().strip())
            result=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True)
            command=result.stdout.strip()
            if command and 'swtpm' in command and str(R/'vm/windows/tpm') in command:
                os.kill(pid,signal.SIGTERM)
                for _ in range(50):
                    out=subprocess.run(['ps','-p',str(pid),'-o','command='],capture_output=True,text=True).stdout.strip()
                    if not out:break
                    time.sleep(.1)
                else:raise RuntimeError('swtpm has not exited')
            elif command:raise RuntimeError('PID identity mismatch; refusing to kill')
            pidfile.unlink(missing_ok=True)
        (S/'windows.tpm').unlink(missing_ok=True)
def snapshot(source):
    source=pathlib.Path(source).resolve()
    if source==R or R.is_relative_to(source):raise RuntimeError('Lab must be outside source tree')
    ident=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:10]
    dest=R/'sources'/ident;dest.mkdir()
    excluded={'.git','target','.local-lab','.DS_Store'}
    manifest=[]
    for base,dirs,names in os.walk(source,followlinks=False):
        dirs[:]=sorted(x for x in dirs if x not in excluded)
        # No external/broken/special symlinks: fail closed, rather than change source semantics.
        for name in dirs+sorted(names):
            p=pathlib.Path(base)/name;rel=p.relative_to(source)
            if name in excluded:continue
            if p.is_symlink():raise RuntimeError('Symlink requires explicit project policy: '+str(rel))
            if p.is_dir():
                (dest/rel).mkdir(parents=True,exist_ok=True)
                continue
            if not p.is_file():raise RuntimeError('Special source file: '+str(rel))
            if name in {'.env','id_rsa','id_ed25519'}:raise RuntimeError('Potential secret: '+str(rel))
            out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,out)
            manifest.append({'path':rel.as_posix(),'sha256':sha(out),'size':out.stat().st_size})
    archive=R/'sources'/(ident+'.tar.gz')
    with tarfile.open(archive,'w:gz') as t:
        for directory in sorted(x for x in dest.rglob('*') if x.is_dir()):t.add(directory,arcname=directory.relative_to(dest).as_posix(),recursive=False)
        for item in manifest:t.add(dest/item['path'],arcname=item['path'],recursive=False)
    dump(R/'sources'/(ident+'.json'),{'id':ident,'archive_sha256':sha(archive),'files':manifest,'excluded':sorted(excluded)})
    print(ident)
def valid_id(ident):
    if not ident or any(x not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for x in ident):raise RuntimeError('Invalid ID')
def push(p,ident):
    valid_id(ident);a=R/'sources'/(ident+'.tar.gz');m=json.loads((R/'sources'/(ident+'.json')).read_text())
    if sha(a)!=m['archive_sha256']:raise RuntimeError('Archive changed')
    if p=='windows':
        dst='C:/ci/work/'+ident+'.tar.gz';scp(p,str(a),dst)
        script="$ErrorActionPreference='Stop'; $a='C:/ci/work/"+ident+".tar.gz'; if((Get-FileHash $a -Algorithm SHA256).Hash.ToLower() -ne '"+m['archive_sha256']+"'){throw 'Hash mismatch'}; $d='C:/ci/work/"+ident+"'; if(Test-Path $d){throw 'Run exists'}; New-Item -ItemType Directory $d | Out-Null; tar.exe -xzf $a -C $d; exit $LASTEXITCODE"
        r=remote(p,pscommand(script))
    else:
        if remote(p,'mkdir -p ~/inbox ~/work').returncode:raise RuntimeError('mkdir failed')
        scp(p,str(a),'inbox/'+ident+'.tar.gz')
        cmd="set -eu; cd ~/inbox; echo '"+m['archive_sha256']+'  '+ident+".tar.gz' | sha256sum -c -; test ! -e ~/work/"+ident+'; mkdir ~/work/'+ident+'; tar -xzf '+ident+'.tar.gz -C ~/work/'+ident
        r=remote(p,cmd)
    if r.returncode:raise RuntimeError('Push/extraction failed')
def exec_remote(p,cmd,seconds,user=None):
    ident=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    out=R/'runs'/ident;out.mkdir();start=time.monotonic()
    record={'id':ident,'platform':p,'command':cmd,'timeout_s':seconds,'status':'running'}
    dump(out/'result.json',record)
    status='environment_failed';code=None
    with open(out/'stdout.log','wb') as stdout,open(out/'stderr.log','wb') as stderr:
        try:
            r=remote(p,cmd,user=user,stdout=stdout,stderr=stderr,timeout=seconds)
            code=r.returncode;status='passed' if code==0 else ('transport_failed' if code==255 else 'command_failed')
        except (subprocess.TimeoutExpired,KeyboardInterrupt) as ex:
            status='timeout' if isinstance(ex,subprocess.TimeoutExpired) else 'cancelled'
            # Fail-closed cleanup: stop entire guest; untrusted descendants cannot survive.
            try:stop(p,hard=True)
            except Exception as cleanup:record['cleanup_error']=repr(cleanup)
        finally:
            record.update(status=status,exit_code=code,elapsed_s=time.monotonic()-start)
            dump(out/'result.json',record)
    print(json.dumps(record,indent=2))
    return 0 if status=='passed' else 1

def main():
    a=argparse.ArgumentParser();s=a.add_subparsers(dest='action',required=True)
    s.add_parser('init');s.add_parser('linux-seed');s.add_parser('windows-seed')
    for action in ['create','start','wait','stop','enroll','qmp','exec','push','get','put']:
        p=s.add_parser(action);p.add_argument('platform',choices=['linux','windows'])
        if action=='start':p.add_argument('--install',action='store_true');p.add_argument('--restricted',action='store_true')
        if action=='stop':p.add_argument('--hard',action='store_true')
        if action=='wait':p.add_argument('--seconds',type=int,default=14400)
        if action=='qmp':p.add_argument('command');p.add_argument('arguments',nargs='?',default='{}')
        if action=='exec':
            p.add_argument('--seconds',type=int,default=600);p.add_argument('--admin',action='store_true');p.add_argument('--ps',action='store_true');p.add_argument('command')
        if action=='push':p.add_argument('snapshot_id')
        if action in ['get','put']:p.add_argument('remote');p.add_argument('local');p.add_argument('--admin',action='store_true')
    p=s.add_parser('snapshot');p.add_argument('source')
    x=a.parse_args();act=x.action
    if act=='init':init();return 0
    if act=='snapshot':snapshot(x.source);return 0
    if act=='linux-seed':linux_seed();return 0
    check()
    if act=='windows-seed':windows_seed();return 0
    p=x.platform
    if act=='create':create(p)
    elif act=='start':start(p,x.install,x.restricted)
    elif act=='wait':wait(p,x.seconds)
    elif act=='stop':stop(p,x.hard)
    elif act=='qmp':print(json.dumps(qmp(p,x.command,json.loads(x.arguments)),indent=2))
    elif act=='enroll':
        cmd='true' if p=='linux' else pscommand('exit 0')
        r=remote(p,cmd,user=C[p].get('admin',C[p]['user']),enroll=True);return r.returncode
    elif act=='exec':
        cmd=pscommand(x.command) if x.ps else x.command
        return exec_remote(p,cmd,x.seconds,C[p].get('admin') if x.admin else None)
    elif act=='push':push(p,x.snapshot_id)
    elif act=='get':scp(p,x.remote,x.local,True,C[p].get('admin') if x.admin else None)
    elif act=='put':scp(p,x.local,x.remote,False,C[p].get('admin') if x.admin else None)
    return 0
if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:print(type(e).__name__+': '+str(e),file=sys.stderr);sys.exit(1)
```

## scripts/ffi-smoke.sh
```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts/ffi-smoke; cd artifacts/ffi-smoke
cat > abi.c <<'EOF'
#include <stdint.h>
#include <stddef.h>
typedef struct { uint32_t a; uint64_t b; } sample;
size_t sample_size(void) { return sizeof(sample); }
size_t sample_align(void) { return _Alignof(sample); }
uint64_t add64(uint64_t a, uint64_t b) { return a+b; }
EOF
cat > main.rs <<'EOF'
#[repr(C)] struct Sample { a:u32,b:u64 }
unsafe extern "C" { fn sample_size()->usize; fn sample_align()->usize; fn add64(a:u64,b:u64)->u64; }
fn main(){ unsafe { assert_eq!(sample_size(),size_of::<Sample>()); assert_eq!(sample_align(),align_of::<Sample>()); assert_eq!(add64(20,22),42); } }
EOF
cc -c abi.c -o abi.o
ar rcs libabi.a abi.o
rustc --edition 2024 main.rs -L native=. -l static=abi -o smoke
./smoke
```

## scripts/record-inputs.py
```python
#!/usr/bin/env python3
import hashlib,json,pathlib
r=pathlib.Path(__file__).resolve().parents[1]
m={}
for folder in [r/'media',r/'firmware',r/'seeds/windows/installers']:
 for p in sorted(folder.rglob('*')):
  if not p.is_file():continue
  h=hashlib.sha256()
  with p.open('rb') as f:
   for b in iter(lambda:f.read(1048576),b''):h.update(b)
  m[p.relative_to(r).as_posix()]=h.hexdigest()
(r/'locks').mkdir(exist_ok=True)
(r/'locks/inputs.json').write_text(json.dumps(m,indent=2)+'\n')
print('Recorded identity only; NOT provenance verification; review/approve lock separately.')
```

## scripts/require-test.py
```python
#!/usr/bin/env python3
"""Stable libtest text gate, exact test name; fail closed on unsupported/custom output."""
import pathlib,re,sys
name=sys.argv[1]
listing=pathlib.Path(sys.argv[2]).read_text(errors='replace')
log=pathlib.Path(sys.argv[3]).read_text(errors='replace')
if not re.search(r'^'+re.escape(name)+r': test\s*$',listing,re.M):
    raise SystemExit('Required test absent from list')
if not re.search(r'^test '+re.escape(name)+r' \.\.\. ok\s*$',log,re.M):
    raise SystemExit('Required test not observed passing; custom/parallel output requires explicit adapter')
if re.search(r'test result: FAILED',log):raise SystemExit('Failure observed')
print('Required test observed passing')
```

## scripts/verify-media.py
```python
#!/usr/bin/env python3
import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((root/'locks/inputs.json').read_text())
if not manifest:raise SystemExit('Empty input lock')
for relative,expected in manifest.items():
    p=(root/relative).resolve()
    if not p.is_relative_to(root) or not p.is_file():raise SystemExit('Invalid input '+relative)
    if len(expected)!=64:raise SystemExit('Invalid SHA256 '+relative)
    h=hashlib.sha256()
    with p.open('rb') as f:
        for data in iter(lambda:f.read(1048576),b''):h.update(data)
    if h.hexdigest()!=expected.lower():raise SystemExit('SHA256 mismatch '+relative)
    print(relative+' OK')
```

## tests/test_host.py
```python
from pathlib import Path
import ast, subprocess, json, os
import xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
import tempfile, importlib.util, contextlib, io, threading, socket, unittest.mock as mock
results=[]
for p in root.rglob('*.py'):
    ast.parse(p.read_text(),filename=str(p));results.append({'test':'python-ast','file':p.relative_to(root).as_posix(),'status':'passed'})
for p in root.rglob('*.sh'):
    r=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True)
    assert r.returncode==0,(p,r.stderr)
    results.append({'test':'bash-syntax','file':p.relative_to(root).as_posix(),'status':'passed'})
spec=importlib.util.spec_from_file_location('lab_reference',root/'lab.py');lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
with tempfile.TemporaryDirectory(dir="/tmp") as tmp:
    tmp=Path(tmp);lab.R=tmp/'lab';lab.R.mkdir();lab.S=tmp/'runtime';lab.S.mkdir()
    lab.C=json.loads((root/'config.example.json').read_text());lab.C['rust']='1.95.0';lab.C['windows']['image']='Windows 11 Pro & QA'
    for d in ['keys','seeds/linux','seeds/windows/installers','guest','sources','runs']:(lab.R/d).mkdir(parents=True,exist_ok=True)
    (lab.R/'keys/lab_ed25519.pub').write_text('ssh-ed25519 AAAATEST mock-key\n')
    (lab.R/'guest/windows-bootstrap.ps1').write_text((root/'guest/windows-bootstrap.ps1').read_text())
    calls=[]
    def fake_run(a,**kw):
        calls.append(a)
        if '-o' in a:Path(a[a.index('-o')+1]).write_bytes(b'MOCK ISO; not a boot image')
    with mock.patch.object(lab,'run',side_effect=fake_run):
        lab.windows_seed();lab.linux_seed()
    tree=ET.parse(lab.R/'seeds/windows/Autounattend.xml');ns={'u':'urn:schemas-microsoft-com:unattend'}
    assert tree.find('.//u:MetaData/u:Value',ns).text=='Windows 11 Pro & QA'
    assert len(tree.findall('.//u:LocalAccount',ns))==2
    command=tree.find('.//u:FirstLogonCommands/u:SynchronousCommand/u:CommandLine',ns).text
    assert "& ($d+':\\bootstrap.ps1')" in command
    assert 'Subsystem sftp' in (lab.R/'seeds/windows/bootstrap.ps1').read_text()
    assert 'credentials.json' not in ' '.join(map(str,calls[0]))
    results.append({'test':'unattend-generation-xml-escaping-accounts-bootstrap','status':'passed'})
    try:
        import yaml
        obj=yaml.safe_load((lab.R/'seeds/linux/user-data').read_text());assert obj['users'][0]['name']=='builder'
        results.append({'test':'cloud-init-yaml-parse','status':'passed'})
    except ImportError:results.append({'test':'cloud-init-yaml-parse','status':'not-run','reason':'PyYAML unavailable'})
    source=tmp/'project';source.mkdir();(source/'src').mkdir();(source/'empty').mkdir();(source/'src/main.rs').write_text('fn main(){}\n');(source/'target').mkdir();(source/'target/excluded').write_text('not source')
    with contextlib.redirect_stdout(io.StringIO()) as cap:lab.snapshot(source)
    ident=cap.getvalue().strip();man=json.loads((lab.R/'sources'/f'{ident}.json').read_text())
    assert man['archive_sha256']==lab.sha(lab.R/'sources'/f'{ident}.tar.gz')
    with __import__('tarfile').open(lab.R/'sources'/f'{ident}.tar.gz') as tar:
        names=tar.getnames();assert 'empty' in names and 'src/main.rs' in names and not any('target' in n for n in names)
    results.append({'test':'snapshot-hash-emptydir-exclusion','status':'passed'})
    original="Write-Output 'quote'; $env:PATH"
    encoded=lab.pscommand(original).split()[-1]
    assert __import__('base64').b64decode(encoded).decode('utf-16le')==original
    assert 'StrictHostKeyChecking=yes' in lab.sshbase('windows')
    results.append({'test':'powershell-encoding-strict-ssh','status':'passed'})
    server=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);server.bind(str(lab.S/'linux.qmp'));server.listen()
    def serve():
        conn,_=server.accept();f=conn.makefile('rwb');f.write(b'{"QMP":{"version":{}}}\r\n');f.flush()
        for _ in range(2):
            req=json.loads(f.readline());f.write(b'{"event":"MOCK_EVENT"}\r\n');f.write((json.dumps({'return':{'status':'running'},'id':req['id']})+'\r\n').encode());f.flush()
        f.close();conn.close();server.close()
    thread=threading.Thread(target=serve);thread.start();assert lab.qmp('linux','query-status')['status']=='running';thread.join()
    results.append({'test':'qmp-handshake-request-id-interleaved-events','status':'passed'})
print(json.dumps({'validation_count':len(results),'results':results},indent=2))
```

## MANIFEST.sha256 (bundle-relative bytes)
```text
e2b43f82639afa8511a6ad05036474558deaa70a3a9d5d25bb4c9e116dcc48fd  .gitignore
06acb20cb61cc8e3bc6f93ccd89ce1991664331f194d0fa708d9ea9d71a23e7a  GUIDE.md
cd5cf000ab24ec0dc409f3fb6482a914f85be50dc5cb3158bb5ee5f15d05e483  README.md
b39d9907999b0e55c03d966bd97a2814de9242a609294a3c8d956762ec7b4921  VALIDATION.json
02cb8794450a2082dbd1467a1d21654c4a48501aa2106cd6cc13020309743d2e  config.example.json
8eb0284f5b6f7dfa0a2ca07e26f0e565d8e36df5880afc4250c5a9d20aa78bbd  fixtures/gate/Cargo.toml
5fc245c3800d2197a99f9e8a9ad094c6898dccccf3367f9c402862e4027d7347  fixtures/gate/src/lib.rs
d8a13f03eadaa4c7e81b78613c0329db96f3b78b48227621ea61331d5c45d4eb  guest/posix-run.sh
905cdebab2001b50ac3f9e602b9f0bfad4a55a3062fdfb7126f6074439bd849c  guest/windows-bootstrap.ps1
2a980143aad256575a4959051037cae6347ef59986ebab1a2a18c17318f7b562  guest/windows-dev.ps1
2b2b2f8741726b993ec7f6fc02663630e4cdc8baaf8d5189ee1ef45866d70218  guest/windows-ffi-smoke.ps1
97e6fd44d9e096d165347d32ba59152881fb0d4eb2f1bc062565423378ffeaf4  guest/windows-run.ps1
9fe4cd46e8878e23055ddc6ff3cb8b9cb1d5d1133184923583ac05abe99f1230  lab.py
039ca3db2d9c11abfc8d7c3bf2ef5d7288865bbb7347a0aee043d4979ba2205b  scripts/ffi-smoke.sh
4a53520431bd6dc877f78162b979ad5b8529a550cbbb1017e54524eb27c00e52  scripts/record-inputs.py
ca255a102d7f77a7708fc5e3a62961f6af2c2185b66729da41cc4c2b3363444c  scripts/require-test.py
67e63a565bb5bf7e77a7b4b4dcc68c1c266256fb36b60694c345a6d7c6090560  scripts/verify-media.py
ae332deee94bb1ba1188d98333faf6fbbeab3b1f182de0ef351f8fb9d92fb0af  tests/test_host.py
```
