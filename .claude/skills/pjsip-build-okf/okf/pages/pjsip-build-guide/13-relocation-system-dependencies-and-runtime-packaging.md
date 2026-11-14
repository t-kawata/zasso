---
type: "Page"
title: "13. Relocation/system dependencies and runtime packaging"
description: "Raw static PJSIP+static Opus do not statically absorb every OS/crypto lib. System references intentional, explicit bundle policy `abs:` paths recorded. Rust product packaging MUST inspect final..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-16"
    title: "13. Relocation/system dependencies and runtime packaging"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "ef73a069d204bcdefe0ec467e5560c1e91dc8ace2d2088a9581ecf3e6d4e67ef"
x-requires: [pages/pjsip-build-guide/12-diagnose-wrong-libraries-abi-cache]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "435-456"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-16]

[^pjsip-build-guide-16]: 13. Relocation/system dependencies and runtime packaging — sources/pjsip-build-guide.md, lines 435-456.

