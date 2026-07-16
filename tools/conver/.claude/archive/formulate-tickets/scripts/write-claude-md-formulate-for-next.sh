#!/usr/bin/env bash
#
# write-claude-md-formulate-for-next.sh — formulate-tickets-for-next 用 CLAUDE.md 追記生成
#
# Usage:
#   bash write-claude-md-formulate-for-next.sh --claude-md=<path> --rfc-path=<path> --title="<title>"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CLAUDE_MD=""
RFC_PATH=""
TITLE=""

for arg in "$@"; do
  case "$arg" in
    --claude-md=*) CLAUDE_MD="${arg#--claude-md=}" ;;
    --rfc-path=*) RFC_PATH="${arg#--rfc-path=}" ;;
    --title=*) TITLE="${arg#--title=}" ;;
    --help|-h)
      echo "Usage: write-claude-md-formulate-for-next.sh --claude-md=<path> --rfc-path=<path> --title=\"<title>\""
      exit 0
      ;;
    *)
      echo "[claude-md] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$CLAUDE_MD" ] || [ -z "$RFC_PATH" ] || [ -z "$TITLE" ]; then
  echo "[claude-md] ERROR: --claude-md, --rfc-path, --title は全て必須です。" >&2
  exit 1
fi

echo "[claude-md] CLAUDE.md 追記生成中: $CLAUDE_MD" >&2

node "$SCRIPT_DIR/write-claude-md.js" \
  "$CLAUDE_MD" \
  "formulate-tickets-for-next" \
  "$TITLE" \
  "$RFC_PATH" \
  <<'BODY'

## 目的とスコープ

<次世代RFCの目的・スコープの要約 — Step 1 で抽出した内容>

## 主要な型とデータ構造

<主要な型・トレイト・構造体とそれらの関係性 — Step 1 で抽出した内容>

## モジュール／コンポーネント間の関係

<RFCに記述された各コンポーネント・モジュール間の依存関係と結合の一覧 — Step 1 で抽出した内容>

## スタブ一覧と解決計画

<本RFCに基づく実装で発生するスタブの一覧と、各スタブをどのチケットがどのように解決するかの対応関係 — Step 1 で抽出した内容>
BODY

echo "[claude-md] OK: $CLAUDE_MD に追記生成しました" >&2
