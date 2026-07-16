#!/usr/bin/env bash
#
# write-claude-md-formulate.sh — formulate-tickets 用 CLAUDE.md 生成
#
# Usage:
#   bash write-claude-md-formulate.sh --claude-md=<path> --doc-path=<path> --title="<title>"
#
# --title には Step 1 で抽出した設計書タイトルを指定する。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CLAUDE_MD=""
DOC_PATH=""
TITLE=""

for arg in "$@"; do
  case "$arg" in
    --claude-md=*) CLAUDE_MD="${arg#--claude-md=}" ;;
    --doc-path=*) DOC_PATH="${arg#--doc-path=}" ;;
    --title=*) TITLE="${arg#--title=}" ;;
    --help|-h)
      echo "Usage: write-claude-md-formulate.sh --claude-md=<path> --doc-path=<path> --title=\"<title>\""
      exit 0
      ;;
    *)
      echo "[claude-md] 不明な引数: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$CLAUDE_MD" ] || [ -z "$DOC_PATH" ] || [ -z "$TITLE" ]; then
  echo "[claude-md] ERROR: --claude-md, --doc-path, --title は全て必須です。" >&2
  exit 1
fi

echo "[claude-md] CLAUDE.md 生成中: $CLAUDE_MD" >&2

node "$SCRIPT_DIR/write-claude-md.js" \
  "$CLAUDE_MD" \
  "formulate-tickets" \
  "$TITLE" \
  "$DOC_PATH" \
  <<'BODY'

## 目的とスコープ

<設計書の目的・スコープの要約 — Step 1 で抽出した内容>

## アーキテクチャ概要

<主要コンポーネントとその責務の一覧 — Step 1 で抽出した内容>

## 主要な型とデータ構造

<主要な型・トレイト・構造体とそれらの関係性 — Step 1 で抽出した内容>

## モジュール／コンポーネント間の関係

<設計書に記述された各コンポーネント・モジュール間の依存関係と結合の一覧 — Step 1 で抽出した内容>

## スタブ一覧と解決計画

<本設計書に基づく実装で発生するスタブ（[::STUB::]）の一覧と、各スタブをどのチケットがどのように解決するかの対応関係 — Step 1 で抽出した内容>
BODY

echo "[claude-md] OK: $CLAUDE_MD を生成しました" >&2
