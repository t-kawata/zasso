---
type: "Page"
title: "Local-only companion; native guest builds; raw static-library bundles; reproducible import/ABI/runtime gates"
description: "Revision 2026-11-13. Companion to `Apple-Silicon-Local-Rust-FFI-Runbook.md`; preserve original unchanged. This document owns PJSIP/dependency source acquisition, exact lane build commands,..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-2"
    title: "Local-only companion; native guest builds; raw static-library bundles; reproducible import/ABI/runtime gates"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "36b046c04efe6d6e2009c81f81d0834a67036e4aa0e1cce4c9bdd4ec5ae7b2a3"
x-requires: [pages/pjsip-build-guide/preamble]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "2-4"
x-topic: "pjsip-build-guide"
---
## Local-only companion; native guest builds; raw static-library bundles; reproducible import/ABI/runtime gates
Revision 2026-11-13. Companion to `Apple-Silicon-Local-Rust-FFI-Runbook.md`; preserve original unchanged. This document owns PJSIP/dependency source acquisition, exact lane build commands, artifact staging/normalization, Rust import/bindgen/linking, native/FFI tests. Original owns VM provisioning/QEMU/TPM/SSH/timeout/reset. All computation local to one Apple-Silicon Mac. “Cross-platform build” here = native compilation inside target-OS local x64 guest; NOT Mac→Windows compiler cross-linking. Never replace Windows/x64 guest with Windows ARM+translation, Wine, MinGW ABI, remote runner. Rust targets: `x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`.

[^pjsip-build-guide-2]

[^pjsip-build-guide-2]: Local-only companion; native guest builds; raw static-library bundles; reproducible import/ABI/runtime gates — sources/pjsip-build-guide.md, lines 2-4.

