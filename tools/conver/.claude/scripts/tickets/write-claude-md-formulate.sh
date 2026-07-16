#!/usr/bin/env bash
#
# write-claude-md-formulate.sh — Generate CLAUDE.md for formulate-tickets
#
# Usage:
#   bash write-claude-md-formulate.sh --claude-md=<path> --doc-path=<path> --title=<title>
set -euo pipefail

CLAUDE_MD=""
DOC_PATH=""
TITLE=""

for arg in "$@"; do
  case "$arg" in
    --claude-md=*) CLAUDE_MD="${arg#--claude-md=}" ;;
    --doc-path=*) DOC_PATH="${arg#--doc-path=}" ;;
    --title=*) TITLE="${arg#--title=}" ;;
    --help|-h)
      echo "Usage: write-claude-md-formulate.sh --claude-md=<path> --doc-path=<path> --title=<title>"
      exit 0
      ;;
    *)
      echo "[init] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$CLAUDE_MD" ] || [ -z "$DOC_PATH" ] || [ -z "$TITLE" ]; then
  echo "[init] ERROR: --claude-md, --doc-path, --title はすべて必須です。" >&2
  exit 1
fi

mkdir -p "$(dirname "$CLAUDE_MD")"
cat > "$CLAUDE_MD" <<EOF
# formulate-tickets

$TITLE
EOF

echo "[init] OK: $CLAUDE_MD を生成しました。" >&2
