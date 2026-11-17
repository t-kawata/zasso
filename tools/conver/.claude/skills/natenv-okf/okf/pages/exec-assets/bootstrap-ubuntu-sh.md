---
type: "Procedure"
title: "EXEC_ASSETS/bootstrap/ubuntu.sh"
description: "Install Docker, Compose, WireGuard tools, Python, and kernel checks on Ubuntu."
sources: 
  - resource: "EXEC_ASSETS/bootstrap/ubuntu.sh"
    id: "exec-asset-bootstrap-ubuntu-sh"
    title: "EXEC_ASSETS/bootstrap/ubuntu.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/bootstrap/ubuntu.sh"
x-asset-sha256: "e4756667bfdefb15aca0566238a41255537c27bf4916db74eb809c665f288a9a"
x-content-sha256: "8f20c889bcbae6fbd160ee064bb7d049ec430dfc3a40a3b92241aab70cf33929"
x-requires: 
  - "pages/pre-okf-original/6-ubuntu-infrastructure-bootstrap"
x-source-span: "1-20"
x-topic: "exec-assets"
---
## EXEC_ASSETS/bootstrap/ubuntu.sh

Install Docker, Compose, WireGuard tools, Python, and kernel checks on Ubuntu.

- role: Procedure
- interface: `bash bootstrap/ubuntu.sh`
- governing section: [6. Ubuntu infrastructure bootstrap](../pre-okf-original/6-ubuntu-infrastructure-bootstrap.md)
- asset hash: `e4756667bfdefb15aca0566238a41255537c27bf4916db74eb809c665f288a9a`
- source span: lines 1-20

```bash
#!/usr/bin/env bash
set -euo pipefail
. /etc/os-release
[[ "$ID" == ubuntu ]] || { echo 'Ubuntu infrastructure required' >&2;exit 2; }
sudo apt-get update
sudo apt-get install -y ca-certificates curl python3 wireguard-tools openssh-server
if ! command -v docker >/dev/null;then
 sudo install -m 0755 -d /etc/apt/keyrings
 sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
 sudo chmod a+r /etc/apt/keyrings/docker.asc
 echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
 sudo apt-get update
 sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo systemctl enable --now docker ssh
for mod in wireguard nf_conntrack sch_netem;do sudo modprobe "$mod";done
sudo docker version
sudo docker compose version
sudo ip link add wg-check type wireguard
sudo ip link del wg-check
```

[^exec-asset-bootstrap-ubuntu-sh]

[^exec-asset-bootstrap-ubuntu-sh]: EXEC_ASSETS/bootstrap/ubuntu.sh — lines 1-20.
