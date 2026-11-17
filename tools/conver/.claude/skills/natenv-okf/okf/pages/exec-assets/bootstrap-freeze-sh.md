---
type: "Procedure"
title: "EXEC_ASSETS/bootstrap/freeze.sh"
description: "Freeze image, package, toolchain, and source provenance for repeatable rebuilds."
sources: 
  - resource: "EXEC_ASSETS/bootstrap/freeze.sh"
    id: "exec-asset-bootstrap-freeze-sh"
    title: "EXEC_ASSETS/bootstrap/freeze.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/bootstrap/freeze.sh"
x-asset-sha256: "4b38887be93f702a3e47c0f7f99da4185b88cbaedc0feeb55f87fb2f24c0a69f"
x-content-sha256: "e77417e4933f7b8e9fa2e6dfd4dca693e326d4c5e9f9cce61312c43d0d71f774"
x-requires: 
  - "pages/pre-okf-original/11-generate-build-start-infrastructure"
x-source-span: "1-11"
x-topic: "exec-assets"
---
## EXEC_ASSETS/bootstrap/freeze.sh

Freeze image, package, toolchain, and source provenance for repeatable rebuilds.

- role: Procedure
- interface: `bash bootstrap/freeze.sh`
- governing section: [11. Generate, build, start infrastructure](../pre-okf-original/11-generate-build-start-infrastructure.md)
- asset hash: `4b38887be93f702a3e47c0f7f99da4185b88cbaedc0feeb55f87fb2f24c0a69f`
- source span: lines 1-11

```bash
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
```

[^exec-asset-bootstrap-freeze-sh]

[^exec-asset-bootstrap-freeze-sh]: EXEC_ASSETS/bootstrap/freeze.sh — lines 1-11.
