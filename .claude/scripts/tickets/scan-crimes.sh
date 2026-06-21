#!/usr/bin/env bash
# scan-crimes.sh — 犯罪スキャン共通ラッパー
#
# Malfeasance.json が存在しない場合に ensure-malfeasance.js で初期化してから、
# 未解決の犯罪一覧を表示する。
#
# 使用法:
#   ./scan-crimes.sh
#
# 全 make/plan/start/review コマンドから犯罪点検・犯罪解決の最初のステップとして
# 呼び出されることを想定する。

set -euo pipefail

# .claude/ ディレクトリを絶対パスで解決
_R="$(cd "$(dirname "$0")/../.." && pwd)"

MALFEASANCE_PATH="$_R/commands/Malfeasance.json"

# Malfeasance.json が存在しなければ初期化
if [ ! -f "$MALFEASANCE_PATH" ]; then
  node "$_R/scripts/tickets/ensure-malfeasance.js" > /dev/null
fi

# 未解決の犯罪を表示
node "$_R/scripts/tickets/malfeasance-all.js" "open"
