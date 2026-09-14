#!/usr/bin/env bash
#
# init-formulate-for-next.sh — formulate-tickets-for-next Step 0 initialization
#
# Usage:
#   bash init-formulate-for-next.sh --rfc-path=<path> [--omissions-path=<path>]
set -euo pipefail

RFC_PATH=""
OMISSIONS_PATH=""

for arg in "$@"; do
  case "$arg" in
    --rfc-path=*) RFC_PATH="${arg#--rfc-path=}" ;;
    --omissions-path=*) OMISSIONS_PATH="${arg#--omissions-path=}" ;;
    --help|-h)
      echo "Usage: init-formulate-for-next.sh --rfc-path=<path> [--omissions-path=<path>]"
      exit 0
      ;;
    *)
      echo "[init] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$RFC_PATH" ]; then
  echo "[init] ERROR: --rfc-path=<path> が指定されていません。" >&2
  exit 1
fi
if [ ! -f "$RFC_PATH" ]; then
  echo "[init] ERROR: RFCファイルが見つかりません: $RFC_PATH" >&2
  exit 1
fi
if [ -n "$OMISSIONS_PATH" ] && [ ! -f "$OMISSIONS_PATH" ]; then
  echo "[init] ERROR: OMISSIONSファイルが見つかりません: $OMISSIONS_PATH" >&2
  exit 1
fi

echo "[init] 次世代RFC: $RFC_PATH" >&2
echo "[init] OK: 初期化完了" >&2
