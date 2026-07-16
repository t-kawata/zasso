#!/usr/bin/env bash
#
# init-formulate-for-next.sh — formulate-tickets-for-next Step 0 初期化
#
# Usage:
#   bash init-formulate-for-next.sh --rfc-path=<path> [--omissions-path=<path>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

NEXT_RFC_PATH=""
OMISSIONS_PATH=""

for arg in "$@"; do
  case "$arg" in
    --rfc-path=*) NEXT_RFC_PATH="${arg#--rfc-path=}" ;;
    --omissions-path=*) OMISSIONS_PATH="${arg#--omissions-path=}" ;;
    --help|-h)
      echo "Usage: init-formulate-for-next.sh --rfc-path=<path> [--omissions-path=<path>]"
      exit 0
      ;;
    *)
      echo "[init] Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$NEXT_RFC_PATH" ]; then
  echo "[init] ERROR: --rfc-path=<path> is not specified." >&2
  exit 1
fi
if [ ! -f "$NEXT_RFC_PATH" ]; then
  echo "[init] ERROR: Next-generation RFC file not found: $NEXT_RFC_PATH" >&2
  exit 1
fi

NEXT_RFC_DIR="$(dirname "$NEXT_RFC_PATH")"
TICKETS_PATH="Tickets.json"

echo "[init] Next-gen RFC: $NEXT_RFC_PATH" >&2
echo "[init] Output dir: $NEXT_RFC_DIR" >&2
echo "[init] Tickets.json: $TICKETS_PATH" >&2

# Tickets.json の存在確認（なければスケルトン生成）
if [ ! -f "$TICKETS_PATH" ]; then
  echo "[init] Note: Tickets.json not found. A skeleton will be generated." >&2
  node .claude/scripts/tickets/init-tickets-json.js "$TICKETS_PATH" "$NEXT_RFC_PATH"
  if [ $? -ne 0 ]; then
    echo "[init] ERROR: Failed to generate Tickets.json skeleton." >&2
    exit 1
  fi
  echo "[init] Tickets.json generated: $TICKETS_PATH" >&2
fi

# OMISSIONS が指定されていればスキーマ検証
if [ -n "$OMISSIONS_PATH" ]; then
  if [ ! -f "$OMISSIONS_PATH" ]; then
    echo "[init] ERROR: OMISSIONS file not found: $OMISSIONS_PATH" >&2
    exit 1
  fi
  echo "[init] Running OMISSIONS validation: $OMISSIONS_PATH" >&2
  node .claude/scripts/lib/validate-omissions.js "$OMISSIONS_PATH"
  echo "[init] OMISSIONS validation: PASS" >&2
fi

echo "[init] OK: Initialization complete" >&2
