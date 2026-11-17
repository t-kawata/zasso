---
type: "Page"
title: "8. Mac host, native guests, OOB readiness"
description: "8. Mac host, native guests, OOB readiness"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-10"
    title: "8. Mac host, native guests, OOB readiness"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "b54a156ed976ba7b8adebb13aca0de4c7525ad285a028a0993ad85d49a60dadc"
x-requires: 
  - "pages/pre-okf-original/7-windows-host-and-native-guests"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "226-280"
x-topic: "pre-okf-original"
---
## 8. Mac host, native guests, OOB readiness

### 8.1 Tools and templates

Baseline: Apple Silicon. Host:
```sh
cd ~/wan-lab
bash bootstrap/macos.sh
tart --version
tart run --help
tart exec --help
```
Homebrew absence reports required initial approval. Inspect installer source; no unreviewed remote shell piped into root. `brew install openai/tools/tart` follows current upstream distribution; record actual version/source, not an assumed historical vendor.

Prepared image path:
```sh
tart clone ghcr.io/cirruslabs/macos-tahoe-base:latest wan-base
# Capture actual OS/image revision; pin before reproducible reruns.
tart clone wan-base wan-b
tart clone wan-base wan-s
tart set wan-b --cpu 2 --memory 4096
tart set wan-s --cpu 2 --memory 4096
mkdir -p artifacts/vm
tart run --no-graphics wan-b >artifacts/vm/b.log 2>&1 &
echo $! >artifacts/vm/b.pid
tart exec wan-b /usr/bin/sw_vers
```
Use image compatible with actual host/license; latest is acquisition convenience only. Prepared non-vanilla images normally include Guest Agent; confirm, do not infer from filename. User-session RPC agent and privileged resize daemon are distinct. Guest login/agent readiness belongs to template sealing.

OOB checks: `tart exec wan-b /usr/bin/id`; command printing stdout/stderr then exit 7 must preserve status; experimental tunnel down must not disable exec. For large binary transfer use verified shared files, not terminal streams.

```sh
# Start a stopped VM with explicit shares; never run same VM twice.
tart run --no-graphics --dir=lab:$HOME/wan-share:ro --dir=results:$HOME/wan-results wan-b
```
Confirm flags with pinned `tart run --help`. Guest share path commonly `/Volumes/My Shared Files/lab`; enumerate actual mounted shares. Use per-node key share; read-only product inputs, separate writable results. B must not read A/S private keys.

### 8.2 Keychain/privacy prerequisites

Headless VM startup on recent macOS may require existing unlocked login keychain. Diagnose `SecKeyCreateRandomKey_ios`, `Failed to generate keypair`, `Interaction is not allowed with the Security Server` before changing network configuration. Use existing approved keychain/session; `security unlock-keychain login.keychain` supports automation with protected secret input. Do not replace personal keychain or create empty-password keychains as a default. First permission/credential enrollment is preparation; repeated tests remain CLI-driven.

Local Network privacy may block host tools reaching private guest IPs. Grant appropriate approved permission once; broad global privacy preference changes are not default bootstrap actions. Guest Agent OOB avoids depending on experimental IP but does not remove every host OS authorization requirement.

Diagnostic host log:
```sh
log stream --predicate='process=="tart" OR process CONTAINS "Virtualization"' >artifacts/vm/virtualization.log
```
Bound duration externally; stop collector after incident. Guest IP discovery:
```sh
tart list
tart ip wan-b
tart exec wan-b /bin/sh -lc 'ifconfig -a; netstat -rn'
```
Ubuntu DHCP DUID issue: configure `dhcp-identifier: mac`; do not delete global host DHCP lease databases as routine repair. Shared-network guest access to host uses guest default-router IP; Softnet isolation changes that assumption.

[^pre-okf-original-10]

[^pre-okf-original-10]: 8. Mac host, native guests, OOB readiness — sources/pre-okf-original.md, lines 226-280.

