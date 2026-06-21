#!/bin/bash
# download_models.sh — MTPLX モデルファイル手動ダウンロードスクリプト
#
# 使用方法（手動）:
#   export HF_TOKEN="hf_あなたのトークン"
#   bash download_models.sh
#
# 使用方法（setup.sh からの呼び出し）:
#   export MODEL_REPO="Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed"
#   export MODEL_DIR="mycc/models/Qwen3.6-27B-MTPLX-Optimized-Speed"
#   bash download_models.sh
#
# 対応バリアント:
#   Quality 版: Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality  (6 シャード, ~27GB)
#   Speed 版:   Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed     (3 シャード, ~15GB, デフォルト)

set -euo pipefail

# 環境変数から設定（未設定時は Speed 版をデフォルトとする）
MODEL_REPO="${MODEL_REPO:-Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed}"
MODEL_DIR="${MODEL_DIR:-$(cd "$(dirname "$0")" && pwd)/models/$(echo "$MODEL_REPO" | sed 's/.*\///')}"
BASE_URL="https://huggingface.co/${MODEL_REPO}/resolve/main"

# シャード数をリポジトリから動的に特定
# model.safetensors.index.json があればそこから、なければ固定値を使う

# 認証
if [ -n "${HF_TOKEN:-}" ]; then
  CURL_AUTH="-H \"Authorization: Bearer $HF_TOKEN\""
  echo "[INFO] HF_TOKEN を使用して認証します"
else
  CURL_AUTH=""
  echo "[WARN] HF_TOKEN が設定されていません。未認証のためレート制限が厳しい可能性があります。"
  echo "  export HF_TOKEN=\"hf_あなたのトークン\""
  echo ""
fi

CURL_OPTS="-L --retry 3 --retry-delay 5"

# メタデータファイル一覧
META_FILES=(
  "config.json"
  "configuration.json"
  "generation_config.json"
  "model.safetensors.index.json"
  "preprocessor_config.json"
  "tokenizer.json"
  "tokenizer_config.json"
  "special_tokens_map.json"
  "chat_template.jinja"
  "mtplx_build_metadata.json"
  "mtplx_runtime.json"
  "mtplx_upload_manifest.json"
)

# fmt_bytes — バイト数を見やすい単位に変換（macOS 互換）
fmt_bytes() {
  local bytes=$1
  if [ "$bytes" -ge 1073741824 ]; then
    echo "$(awk "BEGIN { printf \"%.1f\", $bytes/1073741824 }") GB"
  elif [ "$bytes" -ge 1048576 ]; then
    echo "$(awk "BEGIN { printf \"%.1f\", $bytes/1048576 }") MB"
  elif [ "$bytes" -ge 1024 ]; then
    echo "$(awk "BEGIN { printf \"%.1f\", $bytes/1024 }") KB"
  else
    echo "${bytes} B"
  fi
}

# detect_shards — model.safetensors.index.json からシャード構成を取得
detect_shards() {
  local index_file="$MODEL_DIR/model.safetensors.index.json"
  if [ -f "$index_file" ]; then
    # weight_map の値を集計してユニークなファイル名を抽出
    awk -F'"' '/\.safetensors"/{print $2}' "$index_file" | sort -u
  fi
}

# ------------------------------------------------
echo ""
echo "=========================================="
echo " MTPLX モデルダウンロード"
echo " リポジトリ: $MODEL_REPO"
echo " 保存先: $MODEL_DIR"
echo "=========================================="
echo ""

mkdir -p "$MODEL_DIR"

# Step 1: メタデータ
echo "--- Step 1/3: メタデータファイル ---"
echo ""

for file in "${META_FILES[@]}"; do
  echo -n "  [META] $file ... "
  if eval "curl $CURL_OPTS $CURL_AUTH -s -o \"$MODEL_DIR/$file\" \"$BASE_URL/$file\""; then
    size=$(stat -f%z "$MODEL_DIR/$file" 2>/dev/null || echo 0)
    echo "OK ($(fmt_bytes $size))"
  else
    echo "スキップ"
    rm -f "$MODEL_DIR/$file"
  fi
done

# Step 2: 重みファイル
echo ""
echo "--- Step 2/3: 重みファイル ---"
echo ""

# メタデータからシャードを検出、なければ index.json から動的に取得
if [ -f "$MODEL_DIR/model.safetensors.index.json" ]; then
  WEIGHT_FILES=($(detect_shards))
fi

# それでも空ならデフォルト値
if [ ${#WEIGHT_FILES[@]} -eq 0 ]; then
  echo "  [WARN] シャード情報が取得できませんでした。3 シャード (Speed 版) としてダウンロードします。"
  WEIGHT_FILES=(
    "model-00001-of-00003.safetensors"
    "model-00002-of-00003.safetensors"
    "model-00003-of-00003.safetensors"
  )
fi

echo "  検出されたシャード: ${#WEIGHT_FILES[@]} ファイル"
echo ""

DOWNLOAD_PIDS=""
for file in "${WEIGHT_FILES[@]}"; do
  echo "  [START] $file"
  (
    eval "curl $CURL_OPTS $CURL_AUTH --progress-bar -o \"$MODEL_DIR/$file.tmp\" \"$BASE_URL/$file\""
    if [ $? -eq 0 ]; then
      mv "$MODEL_DIR/$file.tmp" "$MODEL_DIR/$file"
      size=$(stat -f%z "$MODEL_DIR/$file" 2>/dev/null || echo 0)
      echo "  [DONE]  $file ($(fmt_bytes $size))"
    else
      echo "  [FAIL]  $file"
      rm -f "$MODEL_DIR/$file.tmp"
      exit 1
    fi
  ) &
  DOWNLOAD_PIDS="$DOWNLOAD_PIDS $!"
  sleep 1
done

FAIL_COUNT=0
for pid in $DOWNLOAD_PIDS; do
  wait "$pid" || FAIL_COUNT=$((FAIL_COUNT + 1))
done

# Step 3: 検証
echo ""
echo "--- Step 3/3: ダウンロード検証 ---"
echo ""

TOTAL_SIZE=0
ALL_OK=true
for file in "${WEIGHT_FILES[@]}"; do
  if [ -f "$MODEL_DIR/$file" ]; then
    size=$(stat -f%z "$MODEL_DIR/$file" 2>/dev/null || echo 0)
    TOTAL_SIZE=$((TOTAL_SIZE + size))
    echo "  ✅ $file ($(fmt_bytes $size))"
  else
    echo "  ❌ $file — 見つかりません"
    ALL_OK=false
  fi
done

echo ""
echo "=========================================="
if [ "$ALL_OK" = true ] && [ "$FAIL_COUNT" -eq 0 ]; then
  echo " ✅ ダウンロード完了"
  echo "    総サイズ: $(fmt_bytes $TOTAL_SIZE)"
  echo "    保存先: $MODEL_DIR"
else
  echo " ❌ 一部のファイルがダウンロードできませんでした"
  echo "    再実行してください: bash download_models.sh"
  exit 1
fi
echo "=========================================="
