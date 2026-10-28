#!/usr/bin/env bash
#
# init-split-to-ticket.sh — /split-to-tickets Step 0 initialization
#
# Usage:
#   bash init-split-to-ticket.sh [--doc-path=<path>]
set -euo pipefail

DOC_PATH="RFC.md"

for arg in "$@"; do
  case "$arg" in
    --doc-path=*) DOC_PATH="${arg#--doc-path=}" ;;
    --help|-h)
      echo "Usage: init-split-to-ticket.sh [--doc-path=<path>]  (default: RFC.md)"
      exit 0
      ;;
    *)
      echo "[init] Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$DOC_PATH" ]; then
  echo "[init] ERROR: --doc-path=<path> is empty." >&2
  exit 1
fi
if [ ! -f "$DOC_PATH" ]; then
  echo "[init] ERROR: design document not found: $DOC_PATH" >&2
  exit 1
fi

DOC_DIR="$(dirname "$DOC_PATH")"
TICKETS_PATH="$DOC_DIR/Tickets.json"

echo "[init] design document: $DOC_PATH" >&2
echo "[init] output directory: $DOC_DIR" >&2
echo "[init] Tickets.json: $TICKETS_PATH" >&2

if [ -f "$TICKETS_PATH" ]; then
  echo "[init] warning: $TICKETS_PATH already exists and /split-to-tickets will overwrite it." >&2
fi

echo "[init] OK: initialization complete" >&2
