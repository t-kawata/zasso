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
      echo "[init] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$NEXT_RFC_PATH" ]; then
  echo "[init] ERROR: --rfc-path=<path> が指定されていません。" >&2
  exit 1
fi
if [ ! -f "$NEXT_RFC_PATH" ]; then
  echo "[init] ERROR: 次世代RFCファイルが見つかりません: $NEXT_RFC_PATH" >&2
  exit 1
fi

NEXT_RFC_DIR="$(dirname "$NEXT_RFC_PATH")"
TICKETS_PATH="Tickets.json"

echo "[init] 次世代RFC: $NEXT_RFC_PATH" >&2
echo "[init] 出力ディレクトリ: $NEXT_RFC_DIR" >&2
echo "[init] Tickets.json: $TICKETS_PATH" >&2

# Tickets.json の存在確認（なければスケルトン生成）
if [ ! -f "$TICKETS_PATH" ]; then
  echo "[init] 注意: Tickets.json が見つかりません。スケルトンを新規生成します。" >&2
  node .claude/scripts/tickets/init-tickets-json.js "$TICKETS_PATH" "$NEXT_RFC_PATH"
  if [ $? -ne 0 ]; then
    echo "[init] ERROR: Tickets.json のスケルトン生成に失敗しました。" >&2
    exit 1
  fi
  echo "[init] Tickets.json を生成しました: $TICKETS_PATH" >&2
fi

# OMISSIONS が指定されていればスキーマ検証
if [ -n "$OMISSIONS_PATH" ]; then
  if [ ! -f "$OMISSIONS_PATH" ]; then
    echo "[init] ERROR: OMISSIONSファイルが見つかりません: $OMISSIONS_PATH" >&2
    exit 1
  fi
  echo "[init] OMISSIONS 検証を実行中: $OMISSIONS_PATH" >&2
  node .claude/scripts/lib/validate-omissions.js "$OMISSIONS_PATH"
  echo "[init] OMISSIONS 検証: 合格" >&2
fi

echo "[init] OK: 初期化完了" >&2
