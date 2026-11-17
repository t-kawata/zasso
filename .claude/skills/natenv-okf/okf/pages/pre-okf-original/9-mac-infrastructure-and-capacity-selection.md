---
type: "Page"
title: "9. Mac infrastructure and capacity selection"
description: "Preferred infrastructure: independent Ubuntu Linux VM under Tart; native macOS guests remain native. No Docker-in-macOS-VM nested virtualization assumption. Prepared Ubuntu image example: ```sh tart"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-11"
    title: "9. Mac infrastructure and capacity selection"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "103dfbf7cb43cb88a12734e431d73e5a1a3d7b0cb14e12c9868452b825ce22b2"
x-requires: 
  - "pages/pre-okf-original/8-mac-host-native-guests-oob-readiness"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "281-299"
x-topic: "pre-okf-original"
---
## 9. Mac infrastructure and capacity selection

Preferred infrastructure: independent Ubuntu Linux VM under Tart; native macOS guests remain native. No Docker-in-macOS-VM nested virtualization assumption. Prepared Ubuntu image example:
```sh
tart clone ghcr.io/cirruslabs/ubuntu:latest wan-infra
tart set wan-infra --cpu 2 --memory 4096
tart run --no-graphics wan-infra
```
Run in managed background session for unattended operation. Inspect `/etc/os-release`, image identity, SSH user/key and disk size. If image is not selected Ubuntu release, choose compatible pinned image or install approved Ubuntu Server ISO once. Template contract: SSH readiness, approved user, sudo mode, network, cloud-init completion. A Linux image is not guaranteed to include Tart Guest Agent; use SSH for infrastructure.

Capacity decision, executed before full deployment:
1. Determine actual simultaneously runnable guest count, OS licensing terms, available RAM/disk, backend restrictions.
2. If host A + macOS B + macOS S + Ubuntu infrastructure runs, use complete simultaneous topology.
3. If guest limit blocks extra Ubuntu VM, evaluate host Docker Desktop Linux backend for infrastructure; require WireGuard interface, conntrack, netem, bridge options and published UDP checks. Tools installed in a container do not supply missing backend kernel modules.
4. If that backend fails, run smallest valid host A + macOS B + Ubuntu infrastructure profile. Co-located bootstrap/relay on B is explicitly NAT-B placement, not independent WAN S. Split scenarios or use additional host/remote infrastructure when independent S simultaneous coverage is required.
5. Mark `single_pc:false` whenever infrastructure or endpoint leaves the PC. Do not advertise full simultaneous single-PC coverage from a reduced profile.

VM limits are environment constraints, not hidden success assumptions. This selection preserves a practical construction path without claiming unavailable capacity. Intel Mac is outside baseline; requires separately qualified backend, not an Apple Silicon recipe copied verbatim.

[^pre-okf-original-11]

[^pre-okf-original-11]: 9. Mac infrastructure and capacity selection — sources/pre-okf-original.md, lines 281-299.

