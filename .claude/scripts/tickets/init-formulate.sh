#!/usr/bin/env bash
#
# init-formulate.sh — formulate-tickets Step 0 初期化
#
# Usage:
#   bash init-formulate.sh --doc-path=<path>
set -euo pipefail

DOC_PATH=""

for arg in "$@"; do
  case "$arg" in
    --doc-path=*) DOC_PATH="${arg#--doc-path=}" ;;
    --help|-h)
      echo "Usage: init-formulate.sh --doc-path=<path>"
      exit 0
      ;;
    *)
      echo "[init] Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$DOC_PATH" ]; then
  echo "[init] ERROR: --doc-path=<path> is not specified." >&2
  exit 1
fi
if [ ! -f "$DOC_PATH" ]; then
  echo "[init] ERROR: Design document file not found: $DOC_PATH" >&2
  exit 1
fi

DOC_DIR="$(dirname "$DOC_PATH")"
TICKETS_PATH="$DOC_DIR/Tickets.json"

echo "[init] Design doc: $DOC_PATH" >&2
echo "[init] Output dir: $DOC_DIR" >&2
echo "[init] Tickets.json: $TICKETS_PATH" >&2

if [ -f "$TICKETS_PATH" ]; then
  echo "[init] Note: $TICKETS_PATH already exists. It will be overwritten by /formulate-tickets." >&2
fi

echo "[init] OK: Initialization complete" >&2
