#!/usr/bin/env bash
# scan-crimes.sh — crime scan common wrapper
#
# If Malfeasance.json does not exist in the specified directory (or CWD),
# initialize it with ensure-malfeasance.js, then display the list of unresolved crimes.
#
# Usage:
#   ./scan-crimes.sh                    # Display Malfeasance.json in CWD
#   ./scan-crimes.sh <directory>        # Display Malfeasance.json in the specified directory
#
# Intended to be called as the first step of crime inspection/resolution
# from all make/plan/start/review commands.

set -euo pipefail

# Resolve .claude/ directory to absolute path (for script path resolution)
_R="$(cd "$(dirname "$0")/../.." && pwd)"

TARGET_DIR="${1:-}"

if [ -n "$TARGET_DIR" ]; then
  # Change to specified directory before execution
  cd "$TARGET_DIR"
fi

# Initialize Malfeasance.json if it does not exist
node "$_R/scripts/tickets/ensure-malfeasance.js" > /dev/null

# Display unresolved crimes (reads Malfeasance.json in CWD)
node "$_R/scripts/tickets/malfeasance-all.js" "open"
