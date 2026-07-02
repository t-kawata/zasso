#!/usr/bin/env sh
set -eu

usage() {
  cat <<'USAGE'
Usage:
  zed-anthropx-launch.sh [-- <zed args...>]

Examples:
  ./zed-anthropx-launch.sh -- ~/src/my-project

What it does:
  - sets Claude Code / Claude Agent environment variables to use
    DeepSeek's Anthropic-compatible endpoint (via anthropx)
  - launches Zed from the same environment

Notes:
  - anthropx のエンドポイントは認証トークンを検証しないため、
    ダミー値を固定で設定している。APIキーは不要。
  - Works in POSIX sh on macOS, Linux, and Windows Git Bash/MSYS/Cygwin/WSL.
  - On native Windows PowerShell/cmd.exe, run this via Git Bash or WSL.
USAGE
}

if [ "${1-}" = "-h" ] || [ "${1-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "${1-}" = "--" ]; then
  shift || true
fi

# DeepSeek の Anthropic互換エンドポイントを Claude Code に向ける
# anthropx は認証トークンを検証しないため、ダミー値で十分
export ANTHROPIC_BASE_URL="http://127.0.0.1:8888"
export ANTHROPIC_AUTH_TOKEN="dummy"

# Claude Code 内部の論理モデル → DeepSeek 実モデルのマッピング
export ANTHROPIC_MODEL="deepseek/deepseek-v4-flash"
export ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek/deepseek-v4-pro"
export ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek/deepseek-v4-flash"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="openai01/gpt-4o"
export CLAUDE_CODE_SUBAGENT_MODEL="deepseek/deepseek-v4-flash"
export CLAUDE_CODE_EFFORT_LEVEL="high"

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
