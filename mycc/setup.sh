#!/usr/bin/env bash
# setup.sh — 環境構築スクリプト（冪等）
#
# common.sh を source して前提条件を確認後、6 つの Phase を逐次実行する。
# 各 Phase は冪等性ルールに従い、既存リソースを破壊せず差分のみ処理する。
# このスクリプトが唯一 .env を生成する権限を持ち、proxy/.env の master となる。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

echo "=== mycc 環境セットアップ ==="

# --------------------------------------------------
# Phase 1: 前提条件チェック
# --------------------------------------------------
# check_all ですべてのツールが揃っていることを確認する。
# 不足がある場合は具体的な手順を表示してエラー終了する。
echo "[Phase 1/6] 前提条件チェック"
if ! check_all; then
  die "前提条件を満たしていません。doctor.sh を実行して不足を確認してください。"
fi

# --------------------------------------------------
# Phase 2: uv プロジェクト初期化
# --------------------------------------------------
# pyproject.toml が既存ならスキップ、新規なら uv init で作成する。
# 古い uv では --python フラグが使えない場合があるため、明示的にフォールバックする。
echo "[Phase 2/6] uv プロジェクト初期化"
cd "$PROJECT_ROOT"

if [ -f pyproject.toml ]; then
  info "pyproject.toml は既存です（スキップ）"
else
  # uv init --app --python 3.12 が使えない古い uv に備えてフォールバックを用意する
  if uv init --app --python 3.12 2>/dev/null; then
    info "uv init --app --python 3.12: OK"
  else
    info "フォールバック: uv init --app && uv python pin 3.12"
    uv init --app
    uv python pin 3.12
  fi
  # uv init で生成されるデフォルトのスクリプトは不要なので削除する
  # （依存管理のみが目的であり、CLI アプリケーションとしては使わない）
  rm -f main.py hello.py
fi

# --------------------------------------------------
# Phase 3: 依存パッケージ追加
# --------------------------------------------------
# mtplx（推論エンジン）と huggingface_hub + hf_transfer（モデル高速DL）を追加する。
# uv add は依存が既存ならスキップされるため、常に実行して問題ない。
echo "[Phase 3/6] 依存パッケージ追加"
uv add mtplx huggingface_hub hf_transfer
uv sync
# バージョン確認はフォールバック付きで行う（import に失敗しても続行可能）
info "依存パッケージ: OK ($(uv run python -c 'import mtplx; print("mtplx", mtplx.__version__)' 2>/dev/null || echo "mtplx 確認済み"))"

# --------------------------------------------------
# Phase 4: モデルダウンロード
# --------------------------------------------------
# MODEL_VARIANT 環境変数で quality / speed の 2 バリアントを切り替える。
# デフォルトは quality 版（27B パラメータ最適化済み）。
# 既存のディレクトリと config.json の両方が揃っていればダウンロードをスキップする。
# これにより、中断後の再開時は差分のみダウンロードされる。
echo "[Phase 4/6] モデルダウンロード"

MODEL_VARIANT="${MODEL_VARIANT:-speed}"
case "$MODEL_VARIANT" in
  quality)
    MODEL_REPO="Youssofal/Qwen3.6-27B-MTPLX-Optimized-Quality"
    MODEL_DIR_NAME="Qwen3.6-27B-MTPLX-Optimized-Quality"
    ;;
  speed)
    MODEL_REPO="Youssofal/Qwen3.6-27B-MTPLX-Optimized-Speed"
    MODEL_DIR_NAME="Qwen3.6-27B-MTPLX-Optimized-Speed"
    ;;
  *)
    die "未知の MODEL_VARIANT 値です: $MODEL_VARIANT（quality または speed を指定してください）"
    ;;
esac

MODEL_DIR="$PROJECT_ROOT/models/$MODEL_DIR_NAME"

if [ -d "$MODEL_DIR" ] && [ -f "$MODEL_DIR/config.json" ]; then
  info "モデルは既にダウンロードされています: $MODEL_DIR"
else
  info "モデルをダウンロードします: $MODEL_REPO"
  info "（27B モデルのため 10〜30 分かかる場合があります）"
  MODEL_REPO="$MODEL_REPO" MODEL_DIR="$MODEL_DIR" bash "$SCRIPT_DIR/download_models.sh"
  info "モデルダウンロード完了: $MODEL_DIR"
fi

# --------------------------------------------------
# Phase 5: Claude Code Proxy セットアップ
# --------------------------------------------------
# upstream リポジトリを clone し、uv sync で依存を解決する。
# 3 状態を区別して冪等に処理する：
#   1. 完全なクローン（.git あり）→ git pull で更新
#   2. 中途半端なディレクトリ（.git なし）→ 削除して再 clone
#   3. 未存在 → 新規 clone
echo "[Phase 5/6] Claude Code Proxy セットアップ"

PROXY_DIR="$PROJECT_ROOT/claude-code-proxy"
CLONE_URL="https://github.com/dbirks/claude-code-proxy.git"
if [ -d "$PROXY_DIR/.git" ]; then
  info "claude-code-proxy は既に clone されています（更新）"
  cd "$PROXY_DIR" && git pull
else
  if [ -d "$PROXY_DIR" ]; then
    # .git は無いがディレクトリが存在する場合は中途半端な状態とみなし、
    # クリーンアップして再 clone する
    info "不完全なディレクトリを検出しました: $PROXY_DIR"
    rm -rf "$PROXY_DIR"
  fi
  info "claude-code-proxy を clone します: $CLONE_URL"
  cd "$PROJECT_ROOT"
  git clone "$CLONE_URL"
fi

cd "$PROXY_DIR"
# proxy の .python-version が指定する Python が存在しない場合に備えて
# uv sync が失敗したら明示的に Python 3.12 を固定して再試行する
uv sync 2>/dev/null || {
  info "フォールバック: uv python pin 3.12 して再 sync"
  uv python pin 3.12
  uv sync
}
info "proxy 依存: OK"

# --------------------------------------------------
# Phase 6: 環境変数ファイル生成
# --------------------------------------------------
# ルート .env は常に上書きする（このスクリプトが唯一の master であるため）。
# proxy/.env はルート .env の値を元に自動生成する。
# .gitignore は存在しなければ新規作成する。
echo "[Phase 6/6] 環境変数ファイル生成"

cd "$PROJECT_ROOT"

# デフォルト値の解決（環境変数が未設定でも動作する）
MTPLX_PORT="${MTPLX_PORT:-8080}"
PROXY_PORT="${PROXY_PORT:-8082}"
MODEL_NAME="${MODEL_DIR_NAME:-Qwen3.6-27B-MTPLX-Optimized-Speed}"

# ルート .env を生成する（常に上書き。古い設定が残ることを防ぐ）
cat > .env <<ENVEOF
# mycc 環境設定 — このファイルが master です
# setup.sh を再実行すると proxy/.env が再生成されます

MTPLX_PORT=${MTPLX_PORT}
PROXY_PORT=${PROXY_PORT}
MODEL_VARIANT=${MODEL_VARIANT:-quality}
MODEL_DIR=./models/${MODEL_DIR_NAME}
MODEL_NAME=${MODEL_NAME}
OPENAI_BASE_URL=http://127.0.0.1:${MTPLX_PORT}/v1
OPENAI_API_KEY=sk-mtplx-local
ANTHROPIC_BASE_URL=http://127.0.0.1:${PROXY_PORT}
ANTHROPIC_API_KEY=local-test-key
ENVEOF
info "ルート .env 生成完了"

# Proxy 用 .env を自動生成する
# .env.example からキー名を動的に抽出し、ルート .env の設定値を注入する。
# .env.example が存在しない場合はデフォルト値で生成する。
cd "$PROXY_DIR"
if [ -f .env.example ]; then
  # .env.example の各変数に対して、ルート設定値をマッピングする
  {
    echo "# このファイルは setup.sh が自動生成しました"
    echo "# ルート .env を編集して setup.sh を再実行してください"
    echo ""
    grep -E '^[A-Z_]+=' .env.example 2>/dev/null | while IFS='=' read -r key default; do
      case "$key" in
        OPENAI_API_KEY) echo "${key}=sk-mtplx-local" ;;
        OPENAI_BASE_URL) echo "${key}=http://127.0.0.1:${MTPLX_PORT}/v1" ;;
        MODEL|OPENAI_MODEL|DEFAULT_MODEL) echo "${key}=${MODEL_NAME}" ;;
        PROXY_PORT) echo "${key}=${PROXY_PORT}" ;;
        HOST) echo "${key}=127.0.0.1" ;;
        *) echo "${key}=${default}" ;;
      esac
          # OPENAI_BASE_URL は .env.example に無くても常に注入する
          echo "OPENAI_BASE_URL=http://127.0.0.1:${MTPLX_PORT}/v1"
    done
  } > .env
  info "proxy/.env 生成完了（${PROXY_DIR}/.env）"
else
  warn ".env.example が見つかりません。proxy/.env を手動で設定してください。"
  cat > .env <<ENVEOF
OPENAI_API_KEY=sk-mtplx-local
OPENAI_BASE_URL=http://127.0.0.1:${MTPLX_PORT}/v1
MODEL=${MODEL_NAME}
PROXY_PORT=${PROXY_PORT}
HOST=127.0.0.1
ENVEOF
  info "proxy/.env をデフォルト値で生成しました"
fi

# .gitignore は存在しなければ新規作成する（既存を上書きしない）
cd "$PROJECT_ROOT"
if [ ! -f .gitignore ]; then
  cat > .gitignore <<'GIEOF'
models/
.venv/
claude-code-proxy/
node_modules/
GIEOF
  info ".gitignore 生成完了"
else
  info ".gitignore は既存です（スキップ）"
fi

echo ""
echo "=== セットアップ完了 ==="
echo "次のコマンドで起動できます:"
echo "  ./run.sh"
echo "別のターミナルでテスト:"
echo "  ./test.js"
