---
type: "Page"
title: "5. Exact POSIX build: Linux/x64, Mac/ARM64"
description: "Script `lane/posix-build.sh`: phases `opus site configure build nettest install probe stage all`. Environment WORK/SRC/OPUS_SRC/KIT absolute; JOBS default4. Native host architecture checked; `make..."
sources: 
  - resource: "sources/pjsip-build-guide.md"
    id: "pjsip-build-guide-8"
    title: "5. Exact POSIX build: Linux/x64, Mac/ARM64"
generated: 
  by: "build-okf-skill"
  at: "2026-11-14"
verified: 
  - by: "machine"
    at: "2026-11-14"
status: "stable"
stale_after: "2027-11-14"
x-content-sha256: "7a33a9c864aefd60e26d97fbe4a6742c9e2cd8275e46dd8186bccfc9769fee76"
x-requires: [pages/pjsip-build-guide/3-source-acquisition-freeze-once-identical-per-lane, pages/pjsip-build-guide/4-transport-inputs-to-original-local-lab]
x-source-alias: "sources/pjsip-build-guide.md"
x-source-span: "170-206"
x-topic: "pjsip-build-guide"
---
## 5. Exact POSIX build: Linux/x64, Mac/ARM64
Script `lane/posix-build.sh`: phases `opus site configure build nettest install probe stage all`. Environment WORK/SRC/OPUS_SRC/KIT absolute; JOBS default4. Native host architecture checked; `make dep` before make; log pipelines use pipefail. Outer original `lab exec` owns guest timeout/cleanup (do not substitute alarm-kill parent while descendants survive). In `all`, executable self-recursion requires `chmod +x` after transfer/extraction.

### 5.1 Linux
```bash
cd "$LAB"
python3 lab.py exec linux --seconds 28800 "export LANE=linux WORK=\$HOME/native/$RUN SRC=\$HOME/native/$RUN/pjproject OPUS_SRC=\$HOME/native/$RUN/opus KIT=\$HOME/native/$RUN/kit JOBS=4 OPUS_CHECK=1; chmod +x \$KIT/lane/posix-build.sh; \$KIT/lane/posix-build.sh all"
```
Script Linux configure: `--prefix=WORK/stage/prefix --with-opus=WORK/prefix-opus --disable-video --disable-libwebrtc --disable-upnp --disable-pjsua2 --disable-darwin-ssl --with-ssl=/usr`; C/C++ flags `-O2 -fPIC`; threads/SSL/ALSA detected; bundled SRTP/default codecs remain, not only G.711/Opus. Native ioqueue default select: conservative same baseline, no unrequested experimental epoll change. Want epoll? explicit separate variant and full requalification, not silent optimization.

### 5.2 macOS
```bash
export LANE=macos WORK="$KIT/work/macos/$RUN"
export SRC="$WORK/pjproject" OPUS_SRC="$WORK/opus" KIT="$WORK/kit" JOBS=4 OPUS_CHECK=1
# Save top-level toolkit path first if shell KIT is needed later; this line deliberately points to run-local scripts.
export SSL_PREFIX="$(brew --prefix openssl@3)"
export MACOSX_DEPLOYMENT_TARGET=11.0
chmod +x "$KIT/lane/posix-build.sh"
"$KIT/lane/posix-build.sh" all
```
After run reset shell `KIT=$HOME/pjsip-rust-kit` (or original actual root); artifact is `WORK/stage.tar.gz`. `--disable-darwin-ssl --with-ssl=BREW_OPENSSL_PREFIX` makes required backend OpenSSL explicit; native Apple TLS alternative is distinct variant (configure/backend/framework/link verification must change), not inferred from an optional system library. Apple Silicon validated by uname; no `--host=x86_64...`; no Rosetta. Retain target min OS + SDK + compiler; raw library CPU verification later.

### 5.3 What phases actually do
`opus`: release tar GNU configure static PIC, no shared lib; optional `OPUS_CHECK=1` executes make check; installs prefix-opus. `site`: copies project-owned limits-only POSIX config_site.h (`PJSUA_MAX_ACC32`), avoiding overriding configure capability macros. `configure`: captures configure.log and generated os_auto.h/build.mak. `build`: make dep, make -j4. `nettest`: five upstream suite executables from their module/bin cwd, required for relative certificates/fixtures; globs exact1 executable; absent/ambiguous fails. `install`: make install; explicitly installs exact config_site.h, static libopus.a+headers into own prefix; records Opus path relocation. `probe`: compile actual C consumer with `pkg-config --static --cflags/--libs libpjproject`; PJSUA create/init/null/start/destroy, UDP/TCP/TLS factory attempt, codec enumeration+OpusPLC0, size/alignment/offset data. `stage`: prefix+evidence tar; follows trusted-source symlinks under own stage (`tar -h`); no host-home share.

Native suite behavior: hardware/network assumptions may fail under headless TCG. Do not simply mark skipped. Capture executable `--help/--list` from actual suite before selecting named tests; define required headless subset + explicit device/network exclusions separately. `SUITES` can select module subset for diagnostic run, NOT complete upstream conformance. Suite timeout has no default internal kill in helper; original runner timeout28800 is outer safety, adjust measured. Host Mac invocation: wrap operator timeout/cleanup if needed; don't conflate manual Ctrl-C with completed native suite. PJSUA2 intentionally disabled on POSIX profile; this is PJSUA C FFI, not C++ PJSUA2.

### 5.4 Validate feature detection, not just configure exit
Retrieve stage tar, then host-side:
```bash
# In original LAB; Linux stage artifact:
python3 lab.py get linux "native/$RUN/stage.tar.gz" "$HOME/pjsip-rust-kit/out/$RUN-linux-stage.tar.gz"
# Host Mac copy to top-level toolkit, using saved absolute WORK:
cp "$WORK/stage.tar.gz" "$HOME/pjsip-rust-kit/out/$RUN-macos-stage.tar.gz"
```
Review `configure.log` SSL/Opus/audio/SRTP, `build.mak`, generated headers, build warnings. Explicit options missing/misspelled/ignored => fail. Verify GNU source `./configure --help` against script flags if amended. Native error/transport result in probe is mandatory gate, not warning. No external SDK/library layout guessed silently.

[^pjsip-build-guide-8]

[^pjsip-build-guide-8]: 5. Exact POSIX build: Linux/x64, Mac/ARM64 — sources/pjsip-build-guide.md, lines 170-206.

