---
type: "Page"
title: "9. Build and execute Rust FFI tests in each actual OS"
description: "Not upstream PJSIP environment API; do not assume existing third-party pjsip-sys crate understands these names. External Python verification is mandatory; build.rs checks target/version/expected..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-12"
    title: "9. Build and execute Rust FFI tests in each actual OS"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "f35e6dcc74f66025f814a1b1d9d7424f29e64b7bb49844c9c2d307022830c6ce"
x-requires: [pages/pjsip-build-guide/8-import-artifacts-into-rust-project-no-installation-into-usr-local]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "306-381"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-12]

[^pjsip-build-guide-12]: 9. Build and execute Rust FFI tests in each actual OS — sources/pjsip-build-guide.md, lines 306-381.

