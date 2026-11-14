---
type: "Page"
title: "7. Stage audit and normalized bundle creation on Mac"
description: "Original lab get transfers file; compare guest Get-FileHash/sha256sum to received SHA. Preserve received tar read-only. All third-party source/patch/installer/compiler versions reviewed. Stage tar..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-10"
    title: "7. Stage audit and normalized bundle creation on Mac"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "2075279e8b5fee2522829383330330bea51906e1c91ad4c8fd06f519856fbc95"
x-requires: [pages/pjsip-build-guide/5-exact-posix-build-linux-x64-mac-arm64, pages/pjsip-build-guide/6-exact-windows-x64-msvc-build]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "240-287"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-10]

[^pjsip-build-guide-10]: 7. Stage audit and normalized bundle creation on Mac — sources/pjsip-build-guide.md, lines 240-287.

