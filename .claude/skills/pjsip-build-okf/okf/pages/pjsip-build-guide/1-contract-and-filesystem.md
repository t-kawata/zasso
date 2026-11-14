---
type: "Page"
title: "1. Contract and filesystem"
description: "Assume original lab root `$LAB` (example `$HOME/rust-local-lab`), working local VMs, `lab.py`, key-pinned loopback SSH, C:\\ci\\work\\tools\\windows-dev.ps1, standard `builder`, separate provisioning..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-4"
    title: "1. Contract and filesystem"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "8d5420d3e3aa3034d716fa4e5a94a9a6a33bdb6d57a1dcf5b94bb46c0c297b1b"
x-requires: [pages/pjsip-build-guide/0-read-first-correctness-safety-version-boundaries]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "35-67"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-4]

[^pjsip-build-guide-4]: 1. Contract and filesystem — sources/pjsip-build-guide.md, lines 35-67.

