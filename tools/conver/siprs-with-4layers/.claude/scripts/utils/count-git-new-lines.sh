#!/usr/bin/env bash
set -euo pipefail

show_help() {
  cat <<'EOF'
使い方: count-git-new-lines.sh <FROM> [TO] [EXT_FILTER]

複数コミットを跨いだ追加/削除/純増行数を集計します。

引数:
  FROM        集計開始コミット（必須）
  TO          集計終了コミット（省略時は HEAD）
  EXT_FILTER  対象ファイルを絞り込む正規表現（省略時は全ファイル）
              例: "\.rs$"  -> Rustファイルのみ

例:
  count-git-new-lines.sh abc123 HEAD
  count-git-new-lines.sh abc123 def456 "\.rs$"
  count-git-new-lines.sh HEAD~50

引数なしで実行するとこのヘルプを表示します。
EOF
}

if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

FROM="$1"
TO=${2:-HEAD}
EXT_FILTER=${3:-}

git log --numstat --pretty="%H" --no-merges "${FROM}..${TO}" \
  | awk -v ext="$EXT_FILTER" '
    NF==3 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ {
      if (ext == "" || $3 ~ ext) {
        plus += $1; minus += $2; net += ($1 - $2)
      }
    }
    END {
      printf("added=%d removed=%d net=%d\n", plus, minus, net)
    }'
