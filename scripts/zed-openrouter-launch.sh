#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  zed-openrouter-launch.sh <OPENROUTER_API_KEY> [-- <zed args...>]

Examples:
  ./zed-openrouter-launch.sh sk-or-v1-xxxx
  ./zed-openrouter-launch.sh sk-or-v1-xxxx -- ~/src/my-project

What it does:
  - sets Claude Code / Claude Agent environment variables to use
    OpenRouter's Anthropic-compatible endpoint, pinned to
    deepseek/deepseek-v4-flash-0731
  - launches Zed from the same environment

Notes:
  - Works in POSIX sh on macOS, Linux, and Windows Git Bash/MSYS/Cygwin/WSL.
  - On native Windows PowerShell/cmd.exe, run this via Git Bash or WSL.
  - OpenRouter's native Anthropic-compatible endpoint is officially
    guaranteed only for Anthropic-provider models; non-Anthropic models
    (including DeepSeek) work in practice but tool-call / thinking-block
    behavior is not guaranteed by OpenRouter. Verify with /status and
    the OpenRouter activity dashboard after launch.
USAGE
}

if [ "${1-}" = "" ] || [ "${1-}" = "-h" ] || [ "${1-}" = "--help" ]; then
  usage
  exit 0
fi

OPENROUTER_API_KEY=$1
shift || true

if [ "${1-}" = "--" ]; then
  shift || true
fi

# OpenRouter の Anthropic互換エンドポイントを Claude Code に向ける
export ANTHROPIC_BASE_URL="https://openrouter.ai/api"
export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"
# Anthropic への直接フォールバックを防止するため必ず空にする
export ANTHROPIC_API_KEY=""

# Claude Code 内部の論理モデル → OpenRouter 経由の DeepSeek 実モデルのマッピング
export ANTHROPIC_MODEL="deepseek/deepseek-v4-flash-0731@preset/baidu-ds-v4-flash-0731"
export ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek/deepseek-v4-flash-0731@preset/baidu-ds-v4-flash-0731"
export ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek/deepseek-v4-flash-0731@preset/baidu-ds-v4-flash-0731"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek/deepseek-v4-flash-0731@preset/baidu-ds-v4-flash-0731"
export CLAUDE_CODE_SUBAGENT_MODEL="deepseek/deepseek-v4-flash-0731@preset/baidu-ds-v4-flash-0731"
# export CLAUDE_CODE_EFFORT_LEVEL="xhigh"

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
