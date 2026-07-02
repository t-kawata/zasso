#!/usr/bin/env bash
# scan-crimes.sh — 犯罪スキャン共通ラッパー
#
# 指定ディレクトリ（または CWD）の Malfeasance.json が存在しなければ
# ensure-malfeasance.js で初期化してから、未解決の犯罪一覧を表示する。
#
# 使用法:
#   ./scan-crimes.sh                    # CWD の Malfeasance.json を表示
#   ./scan-crimes.sh <directory>        # 指定ディレクトリの Malfeasance.json を表示
#
# 全 make/plan/start/review コマンドから犯罪点検・犯罪解決の最初のステップとして
# 呼び出されることを想定する。

set -euo pipefail

# .claude/ ディレクトリを絶対パスで解決（スクリプトパス解決用）
_R="$(cd "$(dirname "$0")/../.." && pwd)"

TARGET_DIR="${1:-}"

if [ -n "$TARGET_DIR" ]; then
  # 指定ディレクトリに移動してから実行
  cd "$TARGET_DIR"
fi

# Malfeasance.json が存在しなければ初期化
node "$_R/scripts/tickets/ensure-malfeasance.js" > /dev/null

# 未解決の犯罪を表示（CWD の Malfeasance.json を読み取る）
node "$_R/scripts/tickets/malfeasance-all.js" "open"
