#!/usr/bin/env bash
#
# query-all-nodes.sh — 全ノード品質点検用ファイル生成 + ランダムサンプリング選出
#
# 1. 全ノードに対して query.js --hops=2 を実行し、結果を _quality/Nxxxx.md に保存
# 2. 総ノード数の 5%（切り捨て）を bash $RANDOM で重複なく選出
# 3. 選出ノードの get-node-for-check.js コマンド一覧を stdout に出力
#
# Usage:
#   query-all-nodes.sh --graph=<path> --source=<path>        # 初回: 保存 + 選出
#   query-all-nodes.sh --graph=<path> --additional           # 追加: 選出のみ（_quality 再生成なし）
#
# Options:
#   --graph=<path>   グラフファイルのパス
#   --source=<path>  ソースファイルのパス（初回のみ必須）
#   --additional     追加ラウンド: _quality 生成をスキップし、再ランダム選出のみ行う
#
# Exit codes:
#   0  正常終了
#   1  エラー終了（引数不足・ファイル不在等）

set -euo pipefail

# ============================================================
# 定数
# ============================================================

SAMPLE_RATE=0.05
QUALITY_DIR="_quality"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUERY_JS="$SCRIPT_DIR/query.js"

# ============================================================
# 引数パース
# ============================================================

GRAPH_PATH=""
SOURCE_PATH=""
ADDITIONAL=false

for arg in "$@"; do
  case "$arg" in
    --graph=*) GRAPH_PATH="${arg#--graph=}" ;;
    --source=*) SOURCE_PATH="${arg#--source=}" ;;
    --additional) ADDITIONAL=true ;;
    --help|-h)
      echo "Usage: query-all-nodes.sh --graph=<path> --source=<path>"
      echo "       query-all-nodes.sh --graph=<path> --additional"
      exit 0
      ;;
    *)
      echo "[ERROR] 不明な引数: $arg" >&2
      echo "Usage: query-all-nodes.sh --graph=<path> --source=<path>" >&2
      echo "       query-all-nodes.sh --graph=<path> --additional" >&2
      exit 1
      ;;
  esac
done

if [ -z "$GRAPH_PATH" ]; then
  echo "[ERROR] --graph=<path> が指定されていません。" >&2
  exit 1
fi
if [ ! -f "$GRAPH_PATH" ]; then
  echo "[ERROR] グラフファイルが見つかりません: $GRAPH_PATH" >&2
  exit 1
fi
if [ "$ADDITIONAL" = false ]; then
  if [ -z "$SOURCE_PATH" ]; then
    echo "[ERROR] --source=<path> が指定されていません。" >&2
    exit 1
  fi
  if [ ! -f "$SOURCE_PATH" ]; then
    echo "[ERROR] ソースファイルが見つかりません: $SOURCE_PATH" >&2
    exit 1
  fi
  if [ ! -f "$QUERY_JS" ]; then
    echo "[ERROR] query.js が見つかりません: $QUERY_JS" >&2
    exit 1
  fi
fi

# ============================================================
# 全ノードID取得
# ============================================================

NODE_IDS=$(node -e "
  const g = require('fs').readFileSync('$GRAPH_PATH', 'utf8');
  const parsed = JSON.parse(g);
  const ids = parsed.nodes.map(n => n.id);
  console.log(ids.join(' '));
")

if [ -z "$NODE_IDS" ]; then
  echo "[ERROR] グラフからノードIDを取得できませんでした。" >&2
  exit 1
fi

# 配列化
read -ra ID_ARRAY <<< "$NODE_IDS"
TOTAL_NODES=${#ID_ARRAY[@]}

# ============================================================
# 初回のみ: _quality/ 生成 + query.js 実行
# ============================================================

if [ "$ADDITIONAL" = false ]; then
  mkdir -p "$QUALITY_DIR"

  echo "=== 全 $TOTAL_NODES ノードの query.js 結果を $QUALITY_DIR/ に保存中 ===" >&2

  for node_id in "${ID_ARRAY[@]}"; do
    output_file="$QUALITY_DIR/${node_id}.md"
    if node "$QUERY_JS" --graph="$GRAPH_PATH" --source="$SOURCE_PATH" --id="$node_id" --hops=2 > "$output_file" 2>/dev/null; then
      echo "  $node_id -> $output_file" >&2
    else
      node "$QUERY_JS" --graph="$GRAPH_PATH" --source="$SOURCE_PATH" --id="$node_id" --hops=2 > "$output_file" 2>&1 || true
      echo "  $node_id -> $output_file (exit $?)" >&2
    fi
  done

  echo "=== 保存完了 ===" >&2
fi

# ============================================================
# ランダムサンプリング（Fisher-Yates シャッフル + 先頭N件）
# ============================================================

SAMPLE_COUNT=$(node -e "console.log(Math.max(1, Math.floor($TOTAL_NODES * $SAMPLE_RATE)))")

# Fisher-Yates シャッフル（bash $RANDOM を使用）
SHUFFLED=("${ID_ARRAY[@]}")
for ((i = TOTAL_NODES - 1; i > 0; i--)); do
  j=$(( RANDOM % (i + 1) ))
  tmp="${SHUFFLED[i]}"
  SHUFFLED[i]="${SHUFFLED[j]}"
  SHUFFLED[j]="$tmp"
done

# 先頭 SAMPLE_COUNT 件を選出
SELECTED=("${SHUFFLED[@]:0:SAMPLE_COUNT}")

# ============================================================
# stdout にコマンド一覧を出力
# ============================================================

echo ""
echo "全 ${TOTAL_NODES} 件のノードのうち ${SAMPLE_COUNT} 件を選出した。"
echo "以下のコマンドで内容を表示し、下記「点検項目」を点検しなさい。"
echo ""

for selected_id in "${SELECTED[@]}"; do
  echo "node .claude/scripts/rfc-graph/get-node-for-check.js ${selected_id}"
done

echo ""
echo "# 点検項目"
echo "1. 他のノードとの関係性が設計文書の記述を正しく反映しているか"
echo "2. 各ノードの内容が設計文書の該当箇所を過不足なくカバーしているか"
echo "3. /formulate-tickets 及び /formulate-tickets-for-next スラッシュコマンドがこのグラフからチケット分解する際に、不足している情報がないか"
