---
type: "Page"
title: "0. Read-first: correctness/safety/version boundaries"
description: "PJSIP 2.17 release confirmed; CMake remains experimental; latest documentation includes POST-2.17 fixes/features. In particular, later CMake install/export layout and `find_package(Pj)` examples..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-3"
    title: "0. Read-first: correctness/safety/version boundaries"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "b55105b9e51e2b1da4c3de07c452fc0eef6e54b9f4db9aa17302060a7ed52ac9"
x-requires: [pages/pjsip-build-guide/local-only-companion-native-guest-builds-raw-static-library-bundles-reproducible]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "5-34"
x-topic: "pjsip-build-guide"
---
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

[^pjsip-build-guide-3]

[^pjsip-build-guide-3]: 0. Read-first: correctness/safety/version boundaries — sources/pjsip-build-guide.md, lines 5-34.

