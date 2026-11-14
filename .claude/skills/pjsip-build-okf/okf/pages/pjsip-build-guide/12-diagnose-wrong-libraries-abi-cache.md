---
type: "Page"
title: "12. Diagnose wrong libraries/ABI/cache"
description: "Rust link errors: confirm target/content_id/CRT; `cargo build -vv --locked` preserves rustc and build-script output; native symbol inspection nm/dumpbin; original `pkg-config --static` flags..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-15"
    title: "12. Diagnose wrong libraries/ABI/cache"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "88e71785d921b272fd69a7b19f26bf6882599cd6f2e849272c4859ceb7797770"
x-requires: [pages/pjsip-build-guide/11-native-and-end-to-end-integration-beyond-abi-smoke]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "404-434"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-15]

[^pjsip-build-guide-15]: 12. Diagnose wrong libraries/ABI/cache — sources/pjsip-build-guide.md, lines 404-434.

