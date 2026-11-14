---
type: "Page"
title: "8. Import artifacts into Rust project (no installation into /usr/local)"
description: "DEST absent/empty; tool won't overlay existing artifact. Archive tampering/extra files/changed link policy => reject. Bindgen OUT_DIR generated files/cache not written inside immutable bundle...."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-11"
    title: "8. Import artifacts into Rust project (no installation into /usr/local)"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "5d84b1056bfee44038bdf44575b48f03f78300044a9e28a09cfd890071e0bfea"
x-requires: [pages/pjsip-build-guide/7-stage-audit-and-normalized-bundle-creation-on-mac]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "288-305"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-11]

[^pjsip-build-guide-11]: 8. Import artifacts into Rust project (no installation into /usr/local) — sources/pjsip-build-guide.md, lines 288-305.

