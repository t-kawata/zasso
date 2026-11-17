---
type: "Page"
title: "2. Architecture and placement"
description: "2. Architecture and placement"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-4"
    title: "2. Architecture and placement"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "c183fa314f567215ee2d338e76295c075480c0a09ab7c32386aef2751a6c091b"
x-requires: 
  - "pages/pre-okf-original/1-terms-layers-fidelity"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "31-50"
x-topic: "pre-okf-original"
---
## 2. Architecture and placement

```text
Native A: 10.78.1.10 -- WG-A --> ingress-a -- LAN-A -- ra -- [cga] --+
Native B: 10.78.2.10 -- WG-B --> ingress-b -- LAN-B -- rb ----------+-- virtual WAN
Native S: 10.79.0.10 -- WG-S --> ingress-s ------------------------+
                                                                  +-- Asterisk .10
                                                                  +-- observer .20/.21
                                                                  +-- coturn .30
```

Placement profiles:
- Linux: A/B/S host binaries in distinct network namespaces; Docker Engine on host or dedicated Ubuntu VM. No product container required.
- Windows: host=A, Windows VM=B, Windows VM=S, Ubuntu VM=infrastructure. Alternative: management-only host, all native nodes in Windows VMs.
- Apple Silicon Mac: host=A, macOS VM=B, macOS VM=S, Ubuntu Linux VM=infrastructure, subject to actual virtualization/license/resource limits. Resolve capacity before expensive provisioning; see Section 9. Same-OS VM runs native binaries, not an OS compatibility layer.

Separate bootstrap and relay processes may share S with distinct ports, configuration, events and lifecycle. Separate nodes only when independently impaired/addressed/isolated behavior is under test. Never create multiple tunnels in one native stack and call them independent nodes: local-address delivery may bypass routers.

Infrastructure containers use Ubuntu 24.04 LTS baseline. Dockerfile supports UBUNTU_IMAGE override. Ubuntu 26.04 LTS adoption requires package/kernel/CLI readiness checks then version pinning; not a silent migration during a run. Build final immutable images before isolated tests. Windows/macOS GUI applications require a CLI/test-control surface and synthetic input/decoded-output path; headless network tests do not certify UI rendering or device-specific behavior.

[^pre-okf-original-4]

[^pre-okf-original-4]: 2. Architecture and placement — sources/pre-okf-original.md, lines 31-50.

