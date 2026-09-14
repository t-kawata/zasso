#!/usr/bin/env bash
# consolidate-stubs-gate.sh — blocking three-part gate for /consolidate-stubs Step 5.
# Run from the directory containing Tickets.json. Exits non-zero on any real
# problem (a terminal-excuse plan, a malformed marker, a non-existent key, or a
# manifest that is not consumable by /find-omissions). Markers re-pointed to a
# completed key are the intended output and do not fail.
set -euo pipefail

# Resolve the validators from this script's own location so the gate can be
# invoked from any Tickets.json root (including a test workspace).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$SCRIPT_DIR/validate-no-external-excuses.js" --for-consolidate
node "$SCRIPT_DIR/validate-stub-format.js" --scan .

# Validate the newest consolidated manifest; a missing manifests/ dir aborts here.
MANIFEST="$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json | head -1)"
cat "$MANIFEST" | node "$SCRIPT_DIR/batch-create-resolving-tickets.js" --no-write
