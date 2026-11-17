#!/bin/bash
set -euo pipefail
out=${1:-artifacts/provenance};mkdir -p "$out"
date -u +%FT%TZ >"$out/time.txt"
uname -a >"$out/kernel.txt"
cat /etc/os-release >"$out/os-release.txt"
dpkg-query -W >"$out/packages.tsv"
docker version >"$out/docker.txt"
docker compose version >"$out/compose.txt"
docker image inspect wan-node:local >"$out/image.json"
sha256sum Dockerfile generate.py compose.json scripts/* config/asterisk/* config/coturn.conf >"$out/input-sha256.txt"
