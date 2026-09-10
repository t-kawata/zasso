#!/usr/bin/env bash
#
# write-claude-md-formulate-for-next.sh — Generate CLAUDE.md for formulate-tickets-for-next
#
# Usage:
#   bash write-claude-md-formulate-for-next.sh --claude-md=<path> --rfc-path=<path> --title=<title>
set -euo pipefail

CLAUDE_MD=""
RFC_PATH=""
TITLE=""

for arg in "$@"; do
  case "$arg" in
    --claude-md=*) CLAUDE_MD="${arg#--claude-md=}" ;;
    --rfc-path=*) RFC_PATH="${arg#--rfc-path=}" ;;
    --title=*) TITLE="${arg#--title=}" ;;
    --help|-h)
      echo "Usage: write-claude-md-formulate-for-next.sh --claude-md=<path> --rfc-path=<path> --title=<title>"
      exit 0
      ;;
    *)
      echo "[init] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$CLAUDE_MD" ] || [ -z "$RFC_PATH" ] || [ -z "$TITLE" ]; then
  echo "[init] ERROR: --claude-md, --rfc-path, --title はすべて必須です。" >&2
  exit 1
fi

mkdir -p "$(dirname "$CLAUDE_MD")"
cat > "$CLAUDE_MD" <<EOF
# formulate-tickets-for-next

$TITLE
EOF

echo "[init] OK: $CLAUDE_MD を生成しました。" >&2
