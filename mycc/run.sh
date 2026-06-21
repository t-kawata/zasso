#!/usr/bin/env bash
# run.sh — MTPLX 推論サーバー + Claude Code Proxy 起動スクリプト
#
# 2 つのプロセス（MTPLX 推論サーバー、Claude Code Proxy）をこの順に起動する。
# 各プロセスの readiness を curl ポーリングで確認してから次に進む。
# Ctrl+C（SIGINT/SIGTERM）で cleanup が発動し、両プロセスをグレースフルに停止する。
#
# 前提条件:
#   - setup.sh が完了している（.env と models/ が存在する）
#   - ポート MTPLX_PORT / PROXY_PORT が空いている
#   - モデルディレクトリに config.json が存在する
#
# 使用例:
#   ./run.sh                    # デフォルト設定で起動
#   MTPLX_PORT=9090 ./run.sh    # ポートを指定して起動
set -euo pipefail

# --------------------------------------------------
# パス解決
# --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# --------------------------------------------------
# .env 読込
# --------------------------------------------------
# setup.sh が生成する .env を読み込む。不在時は setup.sh の実行を促して終了する。
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck source=./.env
    source "$PROJECT_ROOT/.env"
    set +a
else
    echo "[ERROR] .env が見つかりません。"
    echo "  setup.sh を先に実行してください:"
    echo "    ./setup.sh"
    exit 1
fi

# --------------------------------------------------
# デフォルト値の解決
# --------------------------------------------------
# .env に未定義の場合はデフォルト値を使用する。環境変数での上書きも可能。
MTPLX_PORT="${MTPLX_PORT:-8080}"
PROXY_PORT="${PROXY_PORT:-8082}"
MODEL_DIR="${MODEL_DIR:-./models/Qwen3.6-27B-MTPLX-Optimized-Speed}"

CLEANUP_DONE=false

# --------------------------------------------------
# cleanup — プロセス終了処理
# --------------------------------------------------
# バックグラウンドプロセス（MTPLX / Proxy）を kill し、wait で終了を待つ。
# 二重実行対策: CLEANUP_DONE フラグでガードする。
# 実行例: trap cleanup SIGINT SIGTERM EXIT
cleanup() {
    $CLEANUP_DONE && return
    CLEANUP_DONE=true

    echo ""
    echo "=== シャットダウン ==="
    # kill が失敗してもスクリプト全体を終了させないため、exit code は無視する。
    # （既にプロセスが終了している場合など、kill は常に成功するとは限らない）
    if [ -n "${PID_MTPLX:-}" ]; then
        kill "$PID_MTPLX" 2>/dev/null && echo "  MTPLX: 停止完了" || true
    fi
    if [ -n "${PID_PROXY:-}" ]; then
        kill "$PID_PROXY" 2>/dev/null && echo "  Proxy: 停止完了" || true
    fi
    wait 2>/dev/null || true
    echo "全プロセス停止完了"
}

# --------------------------------------------------
# check_port — ポート空き確認
# --------------------------------------------------
# lsof で指定ポートの LISTEN 状態を確認する。
# 占有されている場合はエラーメッセージを表示し、exit 1 する。
# 第1引数: ポート番号, 第2引数: 表示用サービス名
check_port() {
    local port="$1" service_name="$2"
    # lsof は macOS 標準の /usr/sbin/lsof をフルパスで呼び出す。
    # PATH 解決での呼び出しは、macOS Sequoia 以降のサンドボックス制限により
    # 同一ユーザーのプロセスでも LISTEN 状態を取得できない場合がある。
    if /usr/sbin/lsof -i ":$port" -P -n 2>/dev/null | grep -q LISTEN; then
        local env_var="${service_name}_PORT"
        echo "[ERROR] ポート $port は既に使用中です ($service_name)。"
        echo "  占有プロセスを確認: lsof -i :$port"
        echo "  .env で ${env_var} を変更するか、占有プロセスを停止してください。"
        exit 1
    fi
}

# --------------------------------------------------
# detect_serve_cmd — MTPLX サーバーコマンド動的検出
# --------------------------------------------------
# mtplx serve と lightning-mlx serve のどちらが利用可能か動的に判定する。
# 利用可能なコマンドが見つからない場合はエラー終了する。
# 戻り値: "mtplx serve" または "lightning-mlx serve"
detect_serve_cmd() {
    if uv run mtplx --help 2>/dev/null | grep -q "serve"; then
        echo "mtplx serve"
    elif uv run lightning-mlx --help 2>/dev/null | grep -q "serve"; then
        echo "lightning-mlx serve"
    else
        echo "[ERROR] MTPLX サーバーコマンドが見つかりません。"
        echo "  以下のコマンドで利用状況を確認してください:"
        echo "    uv run mtplx --help"
        echo "    uv run lightning-mlx --help"
        exit 1
    fi
}

# --------------------------------------------------
# trap 設定
# --------------------------------------------------
# SIGINT（Ctrl+C）、SIGTERM、EXIT の各シグナルで cleanup を発動する。
# cleanup は CLEANUP_DONE フラグによる二重実行防止を持つため、
# Ctrl+C → cleanup(SIGINT) → プロセス終了 → cleanup(EXIT) となっても安全。
trap cleanup SIGINT SIGTERM EXIT

# --------------------------------------------------
# ポート空き確認
# --------------------------------------------------
echo "=== ポート確認 ==="
check_port "$MTPLX_PORT" "MTPLX"
check_port "$PROXY_PORT" "PROXY"
echo "  ポート空き: OK (MTPLX=${MTPLX_PORT}, Proxy=${PROXY_PORT})"

# --------------------------------------------------
# モデル存在確認
# --------------------------------------------------
# setup.sh がダウンロードしたモデルディレクトリの config.json で存在を確認する。
# ディレクトリ自体または config.json が不在なら setup.sh の実行を促す。
ABS_MODEL_DIR="$PROJECT_ROOT/models/$(basename "$MODEL_DIR")"
if [ ! -d "$ABS_MODEL_DIR" ] || [ ! -f "$ABS_MODEL_DIR/config.json" ]; then
    echo "[ERROR] モデルディレクトリが見つかりません: $ABS_MODEL_DIR"
    echo "  setup.sh を実行してモデルをダウンロードしてください:"
    echo "    ./setup.sh"
    exit 1
fi
echo "  モデル: OK ($(basename "$ABS_MODEL_DIR"))"

# --------------------------------------------------
# MTPLX 推論サーバー起動
# --------------------------------------------------
echo ""
echo "=== MTPLX 推論サーバー起動 ==="
cd "$PROJECT_ROOT"

SERVE_CMD=$(detect_serve_cmd)
echo "  サーバーコマンド: $SERVE_CMD"

# shellcheck disable=SC2086
uv run $SERVE_CMD \
    --model "$ABS_MODEL_DIR" \
    --port "$MTPLX_PORT" \
    --max-tokens 32768 \
    --temp 0.6 \
    --top-p 0.95 &
PID_MTPLX=$!
echo "  PID: $PID_MTPLX"

# MTPLX Readiness ポーリング（最大 120 秒、2 秒間隔）
# /v1/models が 200 を返すまでループする。
# MTPLX_TIMEOUT 環境変数でタイムアウトを上書き可能（テスト用）
echo "  MTPLX 起動待機中..."
MTPLX_TIMEOUT="${MTPLX_TIMEOUT:-120}"
MTPLX_ELAPSED=0
while [ "$MTPLX_ELAPSED" -lt "$MTPLX_TIMEOUT" ]; do
    if curl -sf "http://127.0.0.1:${MTPLX_PORT}/v1/models" >/dev/null 2>&1; then
        echo "  MTPLX 準備完了 (${MTPLX_ELAPSED}s)"
        break
    fi
    sleep 2
    MTPLX_ELAPSED=$((MTPLX_ELAPSED + 2))
done
if [ "$MTPLX_ELAPSED" -ge "$MTPLX_TIMEOUT" ]; then
    echo "[ERROR] MTPLX サーバーが ${MTPLX_TIMEOUT} 秒以内に起動しませんでした。"
    echo "  考えられる原因:"
    echo "    - メモリ不足（M2 32GB ではモデルロードに時間がかかる場合があります）"
    echo "    対策: --max-tokens を 16384 に下げる、他のアプリを閉じる"
    echo "    - モデルファイルの破損"
    echo "    対策: setup.sh を再実行してください"
    exit 1
fi

# --------------------------------------------------
# Claude Code Proxy 起動
# --------------------------------------------------
echo ""
echo "=== Claude Code Proxy 起動 ==="
if [ ! -d "$PROJECT_ROOT/claude-code-proxy" ]; then
    echo "[ERROR] claude-code-proxy ディレクトリが見つかりません。"
    echo "  setup.sh を実行してください:"
    echo "    ./setup.sh"
    exit 1
fi

cd "$PROJECT_ROOT/claude-code-proxy"

if [ ! -f .env ]; then
    echo "[ERROR] claude-code-proxy/.env が見つかりません。"
    echo "  setup.sh を実行してください:"
    echo "    ./setup.sh"
    exit 1
fi

uv run uvicorn server.fastapi:app --host 127.0.0.1 --port "$PROXY_PORT" &
PID_PROXY=$!
echo "  PID: $PID_PROXY"

# Proxy Readiness ポーリング（最大 30 秒、1 秒間隔）
# ルートパスが 200 を返すまでループする。
# PROXY_TIMEOUT 環境変数でタイムアウトを上書き可能（テスト用）
echo "  Proxy 起動待機中..."
PROXY_TIMEOUT="${PROXY_TIMEOUT:-30}"
PROXY_ELAPSED=0
while [ "$PROXY_ELAPSED" -lt "$PROXY_TIMEOUT" ]; do
    if curl -sf "http://127.0.0.1:${PROXY_PORT}" >/dev/null 2>&1; then
        echo "  Proxy 準備完了 (${PROXY_ELAPSED}s)"
        break
    fi
    sleep 1
    PROXY_ELAPSED=$((PROXY_ELAPSED + 1))
done
if [ "$PROXY_ELAPSED" -ge "$PROXY_TIMEOUT" ]; then
    echo "[ERROR] Proxy が ${PROXY_TIMEOUT} 秒以内に起動しませんでした。"
    echo "  考えられる原因:"
    echo "    - 依存パッケージが不足している"
    echo "    対策: cd claude-code-proxy && uv sync を実行"
    echo "    - ポート $PROXY_PORT が既に使用中"
    echo "    対策: .env で PROXY_PORT を変更"
    # Proxy 失敗時は MTPLX も停止する
    kill "$PID_MTPLX" 2>/dev/null || true
    exit 1
fi

# --------------------------------------------------
# 起動完了表示
# --------------------------------------------------
echo ""
echo "=========================================="
echo "  全プロセス起動完了"
echo "=========================================="
echo ""
echo "  OpenAI 互換（MTPLX）:  http://127.0.0.1:${MTPLX_PORT}/v1"
echo "  Anthropic 互換（Proxy）: http://127.0.0.1:${PROXY_PORT}"
echo ""
echo "  別ターミナルで Claude Code を使用:"
echo "    export ANTHROPIC_BASE_URL=http://127.0.0.1:${PROXY_PORT}"
echo "    export ANTHROPIC_API_KEY=local-test-key"
echo "    claude"
echo ""
echo "  別ターミナルでテスト:"
echo "    ./test.js"
echo ""
echo "  停止方法: Ctrl+C"
echo "=========================================="

# フォアグラウンドで待機 — Ctrl+C で trap → cleanup が発動する
wait
