#!/usr/bin/env bash
# scan-crimes.sh — crime scan common wrapper
#
# If Malfeasance.json does not exist in the specified directory (or CWD),
# initialize it with ensure-malfeasance.js, then display crimes.
#
# Usage:
#   ./scan-crimes.sh                    # Display open crimes in CWD
#   ./scan-crimes.sh --all              # Display all crimes in CWD
#   ./scan-crimes.sh <directory>        # Display open crimes in the specified directory
#   ./scan-crimes.sh <directory> --all  # Display all crimes in the specified directory
#
# Intended to be called as the first step of crime inspection/resolution
# from all make/plan/start/review commands.

set -euo pipefail

# Resolve .claude/ directory to absolute path (for script path resolution)
_R="$(cd "$(dirname "$0")/../.." && pwd)"

# Parse flags: --all enables the full listing; any non-flag argument is
# treated as the target directory. Argument order is irrelevant.
ALL_MODE="0"
TARGET_DIR=""
for arg in "$@"; do
  case "$arg" in
    --all) ALL_MODE="1" ;;
    *) TARGET_DIR="$arg" ;;
  esac
done

if [ -n "$TARGET_DIR" ]; then
  # Change to specified directory before execution
  cd "$TARGET_DIR"
fi

# Initialize Malfeasance.json if it does not exist
node "$_R/scripts/tickets/ensure-malfeasance.js" > /dev/null

# Display crimes: every record with --all, open-only otherwise (reads Malfeasance.json in CWD)
if [ "$ALL_MODE" = "1" ]; then
  node "$_R/scripts/tickets/malfeasance-all.js"
else
  node "$_R/scripts/tickets/malfeasance-all.js" "open"
fi
