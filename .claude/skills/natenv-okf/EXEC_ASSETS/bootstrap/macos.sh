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
