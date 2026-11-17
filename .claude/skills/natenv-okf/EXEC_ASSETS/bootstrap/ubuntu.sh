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
