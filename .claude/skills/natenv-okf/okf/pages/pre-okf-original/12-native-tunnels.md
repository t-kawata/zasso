---
type: "Page"
title: "12. Native tunnels"
description: "12. Native tunnels"
sources: 
  - resource: "sources/pre-okf-original.md"
    id: "pre-okf-original-14"
    title: "12. Native tunnels"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-content-sha256: "cd1b8b76b018cf4525243b26ef5e30cd851758167412952ab382454fc3484d27"
x-requires: 
  - "pages/pre-okf-original/11-generate-build-start-infrastructure"
x-source-alias: "sources/pre-okf-original.md"
x-source-span: "361-417"
x-topic: "pre-okf-original"
---
## 12. Native tunnels

### 12.1 Windows service

Elevated native host/guest, correct node config already securely copied:
```powershell
$w="$env:ProgramFiles\WireGuard\wireguard.exe"
& $w /installtunnelservice C:\WanLab\b.conf
if($LASTEXITCODE -ne 0){throw 'Tunnel install failed'}
Get-Service 'WireGuardTunnel$b'
& "$env:ProgramFiles\WireGuard\wg.exe" show b
Get-NetIPAddress -InterfaceAlias b
Get-NetRoute -AddressFamily IPv4
```
Filename determines service name; use single quotes around `$` service names. Host A uses a.conf; S uses s.conf. No UI manager needed. Generate traffic before treating an absent initial handshake as fault. Inspect latest handshake, received/sent bytes, assigned inner address, route.

```powershell
& $w /dumplog >C:\WanLab\artifacts\wireguard.log
& $w /uninstalltunnelservice b
```
Stop before replacing config; reinstall afterward. Administrator permission/ACL required. No `wg showconf` in ordinary artifacts: private keys would leak. Keep normal `wg show` hidden-key output.

### 12.2 macOS interface

Run inside each relevant host/guest, not only outer host. Install tools beforehand. Absolute configuration path avoids Homebrew prefix ambiguity:
```sh
sudo mkdir -p /usr/local/etc/wireguard
sudo install -m 600 b.conf /usr/local/etc/wireguard/wan.conf
sudo wg-quick up /usr/local/etc/wireguard/wan.conf
sudo wg show
ifconfig -a
route -n get 10.77.0.20
```
Discover actual utun interface by assigned10.78.2.10; never assume utun0. WireGuard userspace helper availability/PATH must work under sudo. Shutdown with same absolute config:
```sh
sudo wg-quick down /usr/local/etc/wireguard/wan.conf
```
A/B/S have separate OS stacks. `AllowedIPs` installs lab-specific routes only; no0.0.0.0/0, no management default-route takeover. A retained physical NIC is not a valid public-fallback escape hatch for the SUT.

### 12.3 Linux network namespaces

Root constructs topology; products run unprivileged. WireGuard interface created in host namespace retains outer UDP socket there; interface moved into endpoint namespace. No experimental default route to physical NIC.
```sh
sudo bash scripts/linux-endpoint.sh up a /absolute/private/a.conf
sudo bash scripts/linux-endpoint.sh up b /absolute/private/b.conf
sudo bash scripts/linux-endpoint.sh up s /absolute/private/s.conf
sudo ip netns exec wan-a runuser -u <actual-user> -- python3 /absolute/scripts/probe.py udp --bind 10.78.1.10 --target 10.77.0.20:9000
```
The script strips wg-quick-only Address/MTU directives, configures interface explicitly, preserves private-file permissions. Namespace has loopback+tunnel, only lab routes. Resolve actual executable/runtime paths, not container paths. If product requires DNS, `/etc/netns/wan-a/resolv.conf` and lab DNS fixture; numeric baseline needs none.

Cleanup refuses namespace deletion while processes remain:
```sh
sudo ip netns pids wan-a
sudo bash scripts/linux-endpoint.sh down a
```
Stop products first. Do not delete namespaces merely to conceal leaked processes.

[^pre-okf-original-14]

[^pre-okf-original-14]: 12. Native tunnels — sources/pre-okf-original.md, lines 361-417.

