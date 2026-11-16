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

# Validate the newest consolidated manifest. A package with zero markers has nothing
# to group into units, so /consolidate-stubs writes no manifest. A marker left without
# a manifest, or a manifest whose markers are gone, still fails.
MANIFEST="$(ls -t manifests/CONSOLIDATED-MANIFEST-*.json 2>/dev/null | head -1 || true)"
if [ -z "$MANIFEST" ]; then
  node -e '
    const { scanDirectory } = require(process.argv[1]);
    const stubs = [];
    scanDirectory(process.cwd(), stubs);
    if (stubs.length > 0) {
      console.error("[consolidate-stubs-gate] BLOCKED: " + stubs.length + " [::STUB::] marker(s) remain but no consolidated manifest exists.");
      console.error("[consolidate-stubs-gate] Action: re-run /consolidate-stubs Steps 3-4, then re-run this gate.");
      process.exit(1);
    }
    console.log("[consolidate-stubs-gate] PASS: 0 [::STUB::] markers - no consolidated manifest is required.");
  ' "$SCRIPT_DIR/review/find-all-stubs.js"
else
  cat "$MANIFEST" | node "$SCRIPT_DIR/batch-create-resolving-tickets.js" --no-write
fi
