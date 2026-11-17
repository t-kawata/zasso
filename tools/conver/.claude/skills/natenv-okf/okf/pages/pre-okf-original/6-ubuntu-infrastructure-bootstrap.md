---
type: "Page"
title: "6. Ubuntu infrastructure bootstrap"
description: "Run inside Ubuntu host/VM: ```sh cd ~/wan-lab bash bootstrap/ubuntu.sh ``` Installs Docker official repository when Docker absent, Compose plugin, WireGuard tools, Python, SSH; checks kernel modules"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-8"
    title: "6. Ubuntu infrastructure bootstrap"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "c7b2ccb3c3dcc98e02568804d7aa93f6f682411de878804ada113e586d849b7d"
x-requires: 
  - "pages/pre-okf-original/5-control-plane-and-agent-execution"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "124-160"
x-topic: "pre-okf-original"
---
## 6. Ubuntu infrastructure bootstrap

Run inside Ubuntu host/VM:
```sh
cd ~/wan-lab
bash bootstrap/ubuntu.sh
```
Installs Docker official repository when Docker absent, Compose plugin, WireGuard tools, Python, SSH; checks kernel modules wireguard/nf_conntrack/sch_netem and interface creation. Existing incompatible Docker installation is not forcibly removed: inspect `docker version`, `docker compose version`, package ownership. Rootless Docker is not reference target. No `--privileged` workaround for missing host/backend kernel features.

Subsequent infrastructure commands require Docker-authorized user. Use an approved root shell or explicit sudo consistently. Docker group grants administrator-equivalent control; not automatically assigned. Root-created private files remain 0600; transfer through privileged OOB, never chmod world-readable.

Kernel checks:
```sh
uname -a
ip -br addr
sudo modprobe wireguard
sudo modprobe nf_conntrack
sudo modprobe sch_netem
sudo ip link add wg-check type wireguard
sudo ip link del wg-check
sudo docker version
sudo docker compose version
```
Missing module may be built-in; interface/runtime check is decisive. Missing module availability in Docker Desktop backend cannot be fixed merely by installing tools in containers.

Ubuntu transport static example; actual NIC name from `ip -br link`:
```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: false
      dhcp6: false
      addresses: [192.168.240.2/24]
```
Dedicated transport only; no default gateway needed for offline Hyper-V lab. Keep separate Internet preparation NIC until images/dependencies cached, then detach/restrict. Avoid competing cloud-init/netplan owners. Validate `netplan generate`; apply through console/OOB or `netplan try`, not blind SSH self-disconnection. On Tart DHCP use actual NIC with `dhcp4: true`, `dhcp-identifier: mac` if `tart ip` cannot resolve DUID-based leases.

[^pre-okf-original-8]

[^pre-okf-original-8]: 6. Ubuntu infrastructure bootstrap — sources/pre-okf-original.md, lines 124-160.

