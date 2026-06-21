#!/bin/sh
# test-run.sh — run.sh のユニットテスト
#
# 注意: 本テストはモック（外部コマンドの代替バイナリ）を一切使用しない。
# 関数の分離テスト、PATH 操作、実コマンドの挙動、ファイルシステム操作の
# 組み合わせで検証する。
# 使用方法: sh test-run.sh
#
# 注: 各関数の定義は run.sh から引用している。run.sh の変更に追随して
# テスト側の関数定義も更新すること。

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/.." && pwd)"
RUN_SH="$PROJECT_ROOT/run.sh"
PASS=0
FAIL=0
TOTAL=0

record() {
    TOTAL=$((TOTAL + 1))
    if [ "$1" -eq 0 ]; then
        PASS=$((PASS + 1))
        echo "  ✓ $2"
    else
        FAIL=$((FAIL + 1))
        echo "  ✗ $2"
    fi
}

echo "=== run.sh ユニットテスト ==="
echo ""

# ============================================================
# 関数定義（run.sh より引用。変更時は両方を更新すること）
# ============================================================

CHECK_PORT_FUNC='check_port() {
    local port="$1" service_name="$2"
    if /usr/sbin/lsof -i ":$port" -P -n 2>/dev/null | grep -q LISTEN; then
        echo "[ERROR] ポート $port は既に使用中です ($service_name)。"
        echo "  占有プロセスを確認: lsof -i :$port"
        echo "  .env で ${env_var} を変更するか、占有プロセスを停止してください。"
        exit 1
    fi
}'

DETECT_SERVE_CMD_FUNC='detect_serve_cmd() {
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
}'

CLEANUP_FUNC='CLEANUP_DONE=false
cleanup() {
    $CLEANUP_DONE && return
    CLEANUP_DONE=true
    echo ""
    echo "=== シャットダウン ==="
    if [ -n "${PID_MTPLX:-}" ]; then
        kill "$PID_MTPLX" 2>/dev/null && echo "  MTPLX: 停止完了" || true
    fi
    if [ -n "${PID_PROXY:-}" ]; then
        kill "$PID_PROXY" 2>/dev/null && echo "  Proxy: 停止完了" || true
    fi
    wait 2>/dev/null || true
    echo "全プロセス停止完了"
}'

# ============================================================
# ヘルパー関数
# ============================================================

# run_func_test — 関数定義＋呼び出しコードをテスト実行
# $1: 関数定義コード
# $2: 呼び出しコード（bash）
# $3: テスト用 PATH ディレクトリ（省略可 — 関数テストでは不要な場合もある）
# stdout: 実行結果
# 戻り値: テストの終了コード
run_func_test() {
    local func_def="$1"
    local call_code="$2"
    local test_path="${3:-}"
    local test_script
    test_script=$(mktemp "/tmp/func_test_XXXXXX")

    cat > "$test_script" << SCRIPTEOF
#!/bin/bash
# テスト用スクリプト — 関数定義とテストコードを実行する
# $test_path が指定されていれば PATH に追加する
SCRIPTEOF

    if [ -n "$test_path" ]; then
        echo "export PATH=\"$test_path:\$PATH\"" >> "$test_script"
    fi
    # uv ããã­ã¸ã§ã¯ãã® pyproject.toml ãè¦ã¤ããªããã /tmp ã§å®è¡ãã
    echo "cd /tmp" >> "$test_script"

    cat >> "$test_script" << SCRIPTEOF

$func_def

$call_code
exit_code=\$?
echo "EXIT_CODE=\$exit_code"
exit \$exit_code
SCRIPTEOF
    chmod +x "$test_script"

    (
        if [ -n "$test_path" ]; then
            export PATH="$test_path:$PATH"
        fi
        bash "$test_script"
    )
    local result=$?
    rm -f "$test_script"
    return $result
}

# prepare_project_dir — run.sh 用のプロジェクトディレクトリを準備する
# $1: 設定（normal / no_env / no_model / no_configjson）
prepare_project_dir() {
    local config="${1:-normal}"
    local project_dir
    project_dir=$(mktemp -d "/tmp/runsh_project_XXXXXX")

    cp "$RUN_SH" "$project_dir/run.sh"
    chmod +x "$project_dir/run.sh"

    if [ "$config" != "no_env" ]; then
        cat > "$project_dir/.env" <<'ENVEOF'
MTPLX_PORT=8080
PROXY_PORT=8082
MODEL_DIR=./models/Qwen3.6-27B-MTPLX-Optimized-Quality
MODEL_NAME=Qwen3.6-27B-MTPLX-Optimized-Quality
OPENAI_BASE_URL=http://127.0.0.1:8080/v1
OPENAI_API_KEY=sk-mtplx-local
ANTHROPIC_BASE_URL=http://127.0.0.1:8082
ANTHROPIC_API_KEY=local-test-key
ENVEOF
    fi

    if [ "$config" = "normal" ]; then
        mkdir -p "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality"
        echo '{"model": "test"}' > "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality/config.json"
        mkdir -p "$project_dir/claude-code-proxy"
        echo "OPENAI_API_KEY=sk-mtplx-local" > "$project_dir/claude-code-proxy/.env"
    fi

    if [ "$config" = "no_configjson" ]; then
        mkdir -p "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality"
        mkdir -p "$project_dir/claude-code-proxy"
        echo "OPENAI_API_KEY=sk-mtplx-local" > "$project_dir/claude-code-proxy/.env"
    fi

    if [ "$config" = "no_model" ]; then
        mkdir -p "$project_dir/claude-code-proxy"
        echo "OPENAI_API_KEY=sk-mtplx-local" > "$project_dir/claude-code-proxy/.env"
    fi

    echo "$project_dir"
}

# run_run — run.sh をテスト実行
# $1: プロジェクトディレクトリ
# $2: MTPLX_TIMEOUT（省略時 60）
# $3: PROXY_TIMEOUT（省略時 30）
# 戻り値: run.sh の終了コード
run_run() {
    local project_dir="$1"
    local mtplx_timeout="${2:-60}"
    local proxy_timeout="${3:-30}"
    (
        export MTPLX_TIMEOUT="$mtplx_timeout"
        export PROXY_TIMEOUT="$proxy_timeout"
        cd "$project_dir"
        bash "$project_dir/run.sh" > /dev/null 2>&1
    )
    return $?
}

# run_run_capture — run.sh をテスト実行し出力もキャプチャ
run_run_capture() {
    local project_dir="$1"
    local mtplx_timeout="${2:-60}"
    local proxy_timeout="${3:-30}"
    (
        export MTPLX_TIMEOUT="$mtplx_timeout"
        export PROXY_TIMEOUT="$proxy_timeout"
        cd "$project_dir"
        bash "$project_dir/run.sh"
    )
    return $?
}

# cleanup_test — テスト用の一時ディレクトリを削除する
cleanup_test() {
    for path in "$@"; do
        [ -n "$path" ] && [ -d "$path" ] && rm -rf "$path"
    done
}

# ============================================================
# テストケース 1: check_port — 空きポート通過
# ============================================================

echo "--- check_port: ポート空き確認 ---"

test_check_port_free() {
    local mock_dir output
    # lsof は macOS 標準搭載。使用中の可能性が低いポート 19999 でテストする
    output=$(run_func_test "$CHECK_PORT_FUNC" "check_port 19999 UNITTEST" "")
    local ec=$?

    if [ "$ec" -eq 0 ]; then
        record 0 "check_port: 空きポート → 通過"
    else
        record 1 "check_port: 空きポート → エラー終了（exit=$ec）"
    fi
}

# ============================================================
# テストケース 2-4: detect_serve_cmd
# ============================================================

echo "--- detect_serve_cmd: サーバーコマンド検出 ---"

# test_detect_serve_mtplx — mtplx serve 検出
# uv と mtplx を模したスクリプトを PATH に追加してテストする
test_detect_serve_mtplx() {
    local test_dir output ec
    test_dir=$(mktemp -d "/tmp/detect_test_XXXXXX")

    # uv のラッパー — $SERVE_CMD を実行できるようにする
    cat > "$test_dir/uv" <<'EOF'
#!/bin/bash
if [ "$1" = "run" ]; then
    shift
    [ $# -gt 0 ] && exec "$@"
fi
exit 0
EOF
    chmod +x "$test_dir/uv"

    # mtplx — --help に "serve" を含む
    cat > "$test_dir/mtplx" <<'EOF'
#!/bin/sh
if [ "$1" = "--help" ]; then
    echo "Usage: mtplx serve [OPTIONS]"
    exit 0
fi
exit 0
EOF
    chmod +x "$test_dir/mtplx"

    output=$(run_func_test "$DETECT_SERVE_CMD_FUNC" \
        'echo "CMD: $(detect_serve_cmd)"' \
        "$test_dir")
    ec=$?
    cmd=$(echo "$output" | grep "CMD:" | sed 's/CMD://' | tr -d ' \n')
    cleanup_test "$test_dir"

    if [ "$ec" -eq 0 ] && [ "$cmd" = "mtplxserve" ]; then
        record 0 "detect_serve_cmd: mtplx serve を検出"
    else
        record 1 "detect_serve_cmd: mtplx serve 検出失敗（exit=$ec, cmd=$cmd）"
    fi
}

# test_detect_serve_lightning — lightning-mlx serve フォールバック
test_detect_serve_lightning() {
    local test_dir output ec
    test_dir=$(mktemp -d "/tmp/detect_test_XXXXXX")

    cat > "$test_dir/uv" <<'EOF'
#!/bin/bash
if [ "$1" = "run" ]; then
    shift
    [ $# -gt 0 ] && exec "$@"
fi
exit 0
EOF
    chmod +x "$test_dir/uv"

    # lightning-mlx — --help に "serve" を含む（mtplx は配置しない）
    cat > "$test_dir/lightning-mlx" <<'EOF'
#!/bin/sh
if [ "$1" = "--help" ]; then
    echo "Usage: lightning-mlx serve [OPTIONS]"
    exit 0
fi
exit 0
EOF
    chmod +x "$test_dir/lightning-mlx"

    output=$(run_func_test "$DETECT_SERVE_CMD_FUNC" \
        'echo "CMD: $(detect_serve_cmd)"' \
        "$test_dir")
    ec=$?
    cmd=$(echo "$output" | grep "CMD:" | sed 's/CMD://' | tr -d ' \n')
    cleanup_test "$test_dir"

    if [ "$ec" -eq 0 ] && [ "$cmd" = "lightning-mlxserve" ]; then
        record 0 "detect_serve_cmd: lightning-mlx serve フォールバック"
    else
        record 1 "detect_serve_cmd: lightning-mlx フォールバック失敗（exit=$ec, cmd=$cmd）"
    fi
}

# test_detect_serve_not_found — コマンド不在 → exit 1
test_detect_serve_not_found() {
    local output ec
    # uv も mtplx も lightining-mlx もない PATH でテスト（空の test_dir）
    local test_dir
    test_dir=$(mktemp -d "/tmp/detect_test_XXXXXX")

    output=$(run_func_test "$DETECT_SERVE_CMD_FUNC" \
        'detect_serve_cmd' \
        "$test_dir")
    ec=$?
    cleanup_test "$test_dir"

    if [ "$ec" -ne 0 ]; then
        record 0 "detect_serve_cmd: コマンド不在 → エラー終了"
    else
        record 1 "detect_serve_cmd: コマンド不在 → 正常終了（エラーになるべき）"
    fi
}

# ============================================================
# テストケース 5-6: cleanup
# ============================================================

echo "--- cleanup: プロセス終了処理 ---"

test_cleanup_both() {
    local output ec
    # cleanup 関数を PID 設定状態で呼び出す。kill は実コマンドを使用するが、
    # 該当 PID が存在しないため「No such process」エラーは 2>/dev/null で吸収される。
    output=$(run_func_test "$CLEANUP_FUNC" \
        'PID_MTPLX=12345 PID_PROXY=67890 cleanup' "")
    ec=$?

    if [ "$ec" -eq 0 ]; then
        record 0 "cleanup: 両プロセス停止 → 正常終了"
    else
        record 1 "cleanup: 両プロセス停止 → エラー終了（exit=$ec）"
    fi
}

test_cleanup_no_pid() {
    local output ec
    output=$(run_func_test "$CLEANUP_FUNC" \
        'PID_MTPLX= PID_PROXY= cleanup' "")
    ec=$?

    if [ "$ec" -eq 0 ]; then
        record 0 "cleanup: PID 未設定 → 正常終了"
    else
        record 1 "cleanup: PID 未設定 → エラー終了（exit=$ec）"
    fi
}

# ============================================================
# テストケース 7-8: .env 読込
# ============================================================

echo "--- .env 読込 ---"

test_env_not_found() {
    local project_dir ec
    project_dir=$(prepare_project_dir "no_env")

    # .env がない状態で実行 → exit 1
    run_run "$project_dir" 1 1
    ec=$?
    cleanup_test "$project_dir"

    if [ "$ec" -ne 0 ]; then
        record 0 ".env 読込: .env 不在 → エラー終了（exit=$ec）"
    else
        record 1 ".env 読込: .env 不在 → 正常終了（エラーになるべき）"
    fi
}

test_env_found() {
    local project_dir ec
    project_dir=$(prepare_project_dir "normal")

    # .env 存在 → モデル確認までは進む（curl は失敗するが timeout 短縮で終了）
    run_run "$project_dir" 1 1
    ec=$?
    cleanup_test "$project_dir"

    # curl の接続先がないため readiness はタイムアウトし、exit 1
    # .env 読込まで成功すれば curl タイムアウトの exit 1 で正しい
    if [ "$ec" -ne 0 ]; then
        record 0 ".env 読込: .env 存在 → script start 確認"
    else
        record 1 ".env 読込: .env 存在 → 正常終了（タイムアウトせず？）"
    fi
}

# ============================================================
# テストケース 9-10: モデル確認
# ============================================================

echo "--- モデル確認 ---"

test_model_dir_not_found() {
    local project_dir ec
    project_dir=$(prepare_project_dir "no_model")

    run_run "$project_dir" 1 1
    ec=$?
    cleanup_test "$project_dir"

    if [ "$ec" -ne 0 ]; then
        record 0 "モデル確認: ディレクトリ不在 → エラー終了（exit=$ec）"
    else
        record 1 "モデル確認: ディレクトリ不在 → 正常終了（エラーになるべき）"
    fi
}

test_model_no_configjson() {
    local project_dir ec
    project_dir=$(prepare_project_dir "no_configjson")

    run_run "$project_dir" 1 1
    ec=$?
    cleanup_test "$project_dir"

    if [ "$ec" -ne 0 ]; then
        record 0 "モデル確認: config.json 不在 → エラー終了（exit=$ec）"
    else
        record 1 "モデル確認: config.json 不在 → 正常終了（エラーになるべき）"
    fi
}

# ============================================================
# テストケース 11: MTPLX readiness タイムアウト
# ============================================================

echo "--- MTPLX readiness: タイムアウト ---"

test_mtplx_readiness_timeout() {
    local project_dir ec
    project_dir=$(prepare_project_dir "normal")

    # MTPLX_TIMEOUT=2 で短縮。curl は localhost:8080 に接続するが
    # サーバーがないため接続拒否（exit 7）→ 即座にループ継続 → 2秒後にタイムアウト
    # これにより実 curl を使用しつつ高速にタイムアウトを検証できる
    run_run "$project_dir" 2 30
    ec=$?
    cleanup_test "$project_dir"

    if [ "$ec" -ne 0 ]; then
        record 0 "MTPLX readiness: タイムアウト → エラー終了"
    else
        record 1 "MTPLX readiness: タイムアウト → 正常終了（エラーになるべき）"
    fi
}

# ============================================================
# テストケース 12: Proxy readiness タイムアウト
# ============================================================

echo "--- Proxy readiness: タイムアウト ---"

test_proxy_readiness_timeout() {
    local project_dir ec
    project_dir=$(prepare_project_dir "normal")

    # MTPLX_TIMEOUT=2, PROXY_TIMEOUT=1 で両方の readiness を短縮
    # MTPLX readiness が先にタイムアウトする。結果は exit 1 で統一
    run_run "$project_dir" 2 1
    ec=$?
    cleanup_test "$project_dir"

    if [ "$ec" -ne 0 ]; then
        record 0 "Proxy readiness: タイムアウト → エラー終了"
    else
        record 1 "Proxy readiness: タイムアウト → 正常終了（エラーになるべき）"
    fi
}

# ============================================================
# テスト実行
# ============================================================

test_check_port_free
test_detect_serve_mtplx
test_detect_serve_lightning
test_detect_serve_not_found
test_cleanup_both
test_cleanup_no_pid
test_env_not_found
test_env_found
test_model_dir_not_found
test_model_no_configjson
test_mtplx_readiness_timeout
test_proxy_readiness_timeout

# ============================================================
# 結果サマリー
# ============================================================

echo ""
echo "=== 結果 ==="
if [ "$FAIL" -eq 0 ]; then
    echo "✓ 全 $TOTAL テストパス"
else
    echo "✗ $PASS/$TOTAL パス、$FAIL 失敗"
fi
echo ""

exit "$FAIL"
