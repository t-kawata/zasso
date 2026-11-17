---
type: "Procedure"
title: "EXEC_ASSETS/bootstrap/macos.sh"
description: "Install Tart and host prerequisites on macOS."
sources: 
  - resource: "EXEC_ASSETS/bootstrap/macos.sh"
    id: "exec-asset-bootstrap-macos-sh"
    title: "EXEC_ASSETS/bootstrap/macos.sh"
generated: 
  by: "build-okf-skill"
  at: "2026-11-17"
verified: 
  - by: "machine"
    at: "2026-11-17"
status: "stable"
stale_after: "2027-11-17"
x-asset-path: "EXEC_ASSETS/bootstrap/macos.sh"
x-asset-sha256: "b6b9b1f5e6e935103def97609da2d3db675f3d66c4b949f4ce3400a4895336fe"
x-content-sha256: "3830ca9bda7b1175959b10f98a5071019f0edc20d5c8df27e0100b1c860a9763"
x-requires: 
  - "pages/pre-okf-original/8-mac-host-native-guests-oob-readiness"
x-source-span: "1-10"
x-topic: "exec-assets"
---
## EXEC_ASSETS/bootstrap/macos.sh

Install Tart and host prerequisites on macOS.

- role: Procedure
- interface: `bash bootstrap/macos.sh`
- governing section: [8. Mac host, native guests, OOB readiness](../pre-okf-original/8-mac-host-native-guests-oob-readiness.md)
- asset hash: `b6b9b1f5e6e935103def97609da2d3db675f3d66c4b949f4ce3400a4895336fe`
- source span: lines 1-10

```bash
#!/bin/bash
set -euo pipefail
[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || { echo 'Apple Silicon macOS required' >&2;exit 2; }
command -v brew >/dev/null || { echo 'HUMAN_ACTION_REQUIRED: approved Homebrew installation; rerun' >&2;exit 11; }
brew install openai/tools/tart wireguard-tools wireguard-go python
mkdir -p artifacts/bootstrap
sw_vers >artifacts/bootstrap/macos.txt
tart --version >artifacts/bootstrap/tart.txt
tart list >artifacts/bootstrap/vms.txt
printf '%s\n' 'HOST_TOOLS_READY: prepare pinned VM templates, guest agent, and keychain'
```

[^exec-asset-bootstrap-macos-sh]

[^exec-asset-bootstrap-macos-sh]: EXEC_ASSETS/bootstrap/macos.sh — lines 1-10.
