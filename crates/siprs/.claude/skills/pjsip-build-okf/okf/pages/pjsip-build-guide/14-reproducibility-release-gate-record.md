---
type: "Page"
title: "14. Reproducibility/release gate record"
description: "Per lane retain: source tag/base/final commit/tree; patch IDs/hash/order/security dispositions; inputsource tarSHA; generated config_site exact hash; configure args+env/build.mak/os_auto.h; native..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-17"
    title: "14. Reproducibility/release gate record"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "6b34e92337d3d4e5d94f62e43093cc5b1f1d92e12cfa7e671bec38f91cb57ba6"
x-requires: [pages/pjsip-build-guide/13-relocation-system-dependencies-and-runtime-packaging]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "457-461"
x-topic: "pjsip-build-guide"
---
## 14. Reproducibility/release gate record
Per lane retain: source tag/base/final commit/tree; patch IDs/hash/order/security dispositions; inputsource tarSHA; generated config_site exact hash; configure args+env/build.mak/os_auto.h; native compiler/SDK/toolset/CRT/platform/minOS; Opus sourceSHA+build options; OpenSSL backend/version; actual rawartifact paths/hash; native/probe/suite outputs/counts; bundleCID/archiveSHA; Rust lock/toolchain/libclang/bindgen; build target/features; Rust discovery/execution logs; final binary dependency graph/hash; clean-runtime acceptance. Three lanes must share intendedsource/patchlevel/logicalcapabilities, not necessarily binary hashes/backend.

Pass = no required phase absent, no ignored/missing requiredcodec, no unsupported bindinglayout, no zero-test acceptance, no unknownsyslib silently filled, no plaintext credential in publishedartifact, no unauditedsecurity promotion. Native artifact use is authorized inside repository `third_party`, not global /usr/local mutation. Unmodified original Runbook remains canonical environment/recovery instruction.

[^pjsip-build-guide-17]

[^pjsip-build-guide-17]: 14. Reproducibility/release gate record — sources/pjsip-build-guide.md, lines 457-461.

