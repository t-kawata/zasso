#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  launch-zed.sh [<API_KEY>] [-- <zed args...>]

Examples:
  ./launch-zed.sh
  ./launch-zed.sh -- ~/src/my-project
  ./launch-zed.sh sk-mtplx-local -- ~/src/my-project

What it does:
  - sets Claude Code environment variables to use the local
    MTPLX + Claude Code Proxy (http://127.0.0.1:8082)
  - launches Zed from the same environment

Notes:
  - run.sh で MTPLX + Proxy が起動している状態で実行すること
  - API_KEY は省略可能（デフォルト: sk-mtplx-local）
USAGE
}

if [ "${1-}" = "-h" ] || [ "${1-}" = "--help" ]; then
  usage
  exit 0
fi

# API キーの解決: 第1引数が -- で始まるか空ならデフォルト値を用いる
API_KEY="sk-mtplx-local"
case "${1-}" in
  ""|--*) ;;                     # 未指定または -- → デフォルト
  *) API_KEY="$1"; shift ;;      # 明示指定
esac

if [ "${1-}" = "--" ]; then
  shift || true
fi

# ローカル MTPLX + Proxy のエンドポイント
export ANTHROPIC_BASE_URL="http://127.0.0.1:8082"
export ANTHROPIC_AUTH_TOKEN="$API_KEY"

# 全モデルをローカルモデルにマッピング
export ANTHROPIC_MODEL="Qwen3.6-27B-MTPLX-Optimized-Speed"
export ANTHROPIC_DEFAULT_OPUS_MODEL="Qwen3.6-27B-MTPLX-Optimized-Speed"
export ANTHROPIC_DEFAULT_SONNET_MODEL="Qwen3.6-27B-MTPLX-Optimized-Speed"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="Qwen3.6-27B-MTPLX-Optimized-Speed"
export CLAUDE_CODE_SUBAGENT_MODEL="Qwen3.6-27B-MTPLX-Optimized-Speed"
export CLAUDE_CODE_EFFORT_LEVEL="xhigh"

# zed コマンドがあればそれを優先
if command -v zed >/dev/null 2>&1; then
  exec zed "$@"
fi

# OSごとのフォールバック
case "$(uname -s 2>/dev/null || echo unknown)" in
  Darwin)
    if [ -x "/Applications/Zed.app/Contents/MacOS/cli" ]; then
      exec "/Applications/Zed.app/Contents/MacOS/cli" "$@"
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    if command -v zed.exe >/dev/null 2>&1; then
      exec zed.exe "$@"
    fi
    ;;
esac

echo "Could not find the Zed launcher command." >&2
echo "Install the 'zed' CLI, or edit this script to point to your Zed executable." >&2
exit 1
