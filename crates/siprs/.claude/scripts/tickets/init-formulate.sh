#!/usr/bin/env bash
#
# init-formulate.sh — formulate-tickets Step 0 initialization
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
      echo "[init] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$DOC_PATH" ]; then
  echo "[init] ERROR: --doc-path=<path> が指定されていません。" >&2
  exit 1
fi
if [ ! -f "$DOC_PATH" ]; then
  echo "[init] ERROR: 設計書ファイルが見つかりません: $DOC_PATH" >&2
  exit 1
fi

DOC_DIR="$(dirname "$DOC_PATH")"
TICKETS_PATH="$DOC_DIR/Tickets.json"

echo "[init] 設計書: $DOC_PATH" >&2
echo "[init] 出力ディレクトリ: $DOC_DIR" >&2

if [ -f "$TICKETS_PATH" ]; then
  echo "[init] 注意: $TICKETS_PATH は既に存在します。/formulate-tickets により上書きされます。" >&2
fi

echo "[init] OK: 初期化完了" >&2
