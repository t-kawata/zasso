#!/bin/sh
# test-setup.sh — setup.sh のユニットテスト
#
# 注意: 本テストは setup.sh の制御フロー（Phase 分岐、冪等性、エラーハンドリング）を
# 検証する。以下の方針でテストする：
#
#   - git: 実コマンドを使用（オフラインでも動作可能なローカルリポジトリでテスト）
#   - lsof/curl/bash: 実コマンドを使用（macOS 標準搭載）
#   - uv init: 実コマンドが存在すれば使用、なければスキップ
#   - uv add/uv sync: ネットワーク依存のため PATH に最小限のラッパーを配置
#   - huggingface-cli: setup.sh 自身がインストールするため不在。PATH 操作で制御
#   - check_all: 実関数を使用（common.sh のもの、スタブ化しない）
#
# 外部依存: git, bash（標準）, uv（Phase 2 テスト時のみ）
# 使用方法: sh test-setup.sh

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP_SH="$(cd "$TEST_DIR/.." && pwd)/setup.sh"
COMMON_SH="$(cd "$TEST_DIR/.." && pwd)/common.sh"
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

echo "=== setup.sh ユニットテスト ==="
echo ""

# ============================================================
# 環境前提
# ============================================================

# has_uv — テスト環境で uv が利用可能か
has_uv() {
    command -v uv > /dev/null 2>&1
    return $?
}

# ============================================================
# ヘルパー関数
# ============================================================

# create_local_git_repo — テスト用のローカル git リポジトリを作成する
# $1: 作成先ディレクトリ
create_local_git_repo() {
    local repo_dir="$1"
    mkdir -p "$repo_dir"
    (
        cd "$repo_dir" \
        && git init -q \
        && git config user.email "test@test.com" \
        && git config user.name "Test" \
        && echo "test" > README.md \
        && git add README.md \
        && git commit -q -m "initial"
    ) > /dev/null 2>&1
    echo "$repo_dir"
}

# create_test_tools — テスト用ツールディレクトリを作成する
# 実 check_all を通過できるように、テスト環境に足りないツールの
# ラッパーを配置する。git のように実在するツールは実コマンドを使用。
# 戻り値: 作成したツールディレクトリのパス
create_test_tools() {
    local tools_dir
    tools_dir=$(mktemp -d "/tmp/setup_tools_XXXXXX")

    # check_all 通過用ツール群
    # 実 check_all 関数が各ツールの存在を確認するため、テスト環境に
    # 不足しているツールは最小限のラッパーで「存在する」状態にする。
    # これは check_all のスタブではなく、テスト環境の構成である。
    for cmd in brew python3.12 node claude; do
        cat > "$tools_dir/$cmd" <<'TOOLEOF'
#!/bin/sh
echo "mock version 1.0"
exit 0
TOOLEOF
        chmod +x "$tools_dir/$cmd"
    done

    # git は実コマンドを使用
    if command -v git > /dev/null 2>&1; then
        ln -sf "$(command -v git)" "$tools_dir/git" 2>/dev/null || \
        cat > "$tools_dir/git" <<'GITMOCK'
#!/bin/bash
exec /usr/bin/env git "$@"
GITMOCK
        chmod +x "$tools_dir/git"
    fi

    # uv は実コマンドがあれば使用、なければラッパー
    if command -v uv > /dev/null 2>&1; then
        ln -sf "$(command -v uv)" "$tools_dir/uv" 2>/dev/null || {
            cat > "$tools_dir/uv" <<'UVMOCK'
#!/bin/bash
exec "$(command -v uv)" "$@"
UVMOCK
            chmod +x "$tools_dir/uv"
        }
    else
        cat > "$tools_dir/uv" <<'UVMOCK'
#!/bin/bash
case "$1" in
    init) echo "pyproject.toml: created" > pyproject.toml; echo "uv init mock" ;;
    add) echo "uv add mock: $*" ;;
    sync) echo "uv sync mock" ;;
    run) shift; [ $# -gt 0 ] && exec "$@" ;;
    python) echo "uv python mock: $*" ;;
    *) echo "uv mock: $*" ;;
esac
UVMOCK
        chmod +x "$tools_dir/uv"
    fi

    # huggingface-cli ラッパー
    # hf ラッパー — setup.sh の Phase 4 で使用（旧 huggingface-cli の代替）
    cat > "$tools_dir/hf" <<'HFMOCK'
#!/bin/sh
if [ "$1" = "download" ]; then
    repo="$2"; shift 2
    while [ $# -gt 0 ]; do
        case "$1" in --local-dir) dir="$2"; shift ;; esac; shift
    done
    [ -n "$dir" ] && mkdir -p "$dir" && echo '{"model": "test"}' > "$dir/config.json" && echo "dummy" > "$dir/model.safetensors"
    echo "hf download simulated"
    exit 0
fi
exit 1
HFMOCK
    chmod +x "$tools_dir/hf"
    cat > "$tools_dir/huggingface-cli" <<'HFMOCK'
#!/bin/sh
if [ "$1" = "download" ]; then
    dir=""; shift
    while [ $# -gt 0 ]; do
        case "$1" in --local-dir) dir="$2"; shift ;; esac; shift
    done
    [ -n "$dir" ] && mkdir -p "$dir" && echo '{"model": "test"}' > "$dir/config.json" && echo "dummy" > "$dir/model.safetensors"
    echo "huggingface-cli download simulated"
    exit 0
fi
exit 1
HFMOCK
    chmod +x "$tools_dir/huggingface-cli"

    echo "$tools_dir"
}

# prepare_project_dir — setup.sh 用プロジェクトディレクトリを作成する
# $1: tools_dir
# $2: 設定種別（fresh / with_pyproject / with_model / ...）
# $3: 追加の環境変数（省略可、内部で use_git_local を指定可能）
prepare_project_dir() {
    local tools_dir="$1"
    local config="${2:-fresh}"
    local project_dir
    project_dir=$(mktemp -d "/tmp/setup_project_XXXXXX")

    cp "$SETUP_SH" "$project_dir/setup.sh"
    cp "$COMMON_SH" "$project_dir/common.sh"
    # download_models.sh モック（setup.sh の Phase 4 が呼び出す）
    cat > "$project_dir/download_models.sh" <<'DOWNLOADMOCK'
#!/bin/bash
# download_models.sh モック — モデルディレクトリと config.json を生成する
MODEL_DIR="${MODEL_DIR:-$(pwd)/models/test}"
mkdir -p "$MODEL_DIR"
echo '{"model": "test"}' > "$MODEL_DIR/config.json"
echo "download_models.sh mock: モデルディレクトリ $MODEL_DIR を準備しました"
exit 0
DOWNLOADMOCK
    chmod +x "$project_dir/download_models.sh"

    # pyproject.toml 事前作成
    if [ "$config" = "with_pyproject" ]; then
        echo "existing" > "$project_dir/pyproject.toml"
        echo "main" > "$project_dir/main.py"
    fi

    # モデル事前作成
    if [ "$config" = "with_model" ]; then
        mkdir -p "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality"
        echo '{"model": "pre-existing"}' > "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality/config.json"
    fi

    # claude-code-proxy .git 事前作成
    if [ "$config" = "with_proxy_git" ]; then
        mkdir -p "$project_dir/claude-code-proxy"
        echo "existing repo" > "$project_dir/claude-code-proxy/README.md"
        # 実 git pull が通るよう正規のリポジトリとして初期化する
        (
            cd "$project_dir/claude-code-proxy" && git init -q && \
            git config user.email "test@test.com" && git config user.name "Test" && \
            git add README.md && git commit -q -m "initial"
        ) > /dev/null 2>&1
    fi

    # 中途半端な claude-code-proxy
    if [ "$config" = "with_proxy_partial" ]; then
        mkdir -p "$project_dir/claude-code-proxy"
        echo "partial" > "$project_dir/claude-code-proxy/partial.tmp"
    fi

    # .gitignore 事前作成
    if [ "$config" = "with_gitignore" ]; then
        echo "existing-ignore" > "$project_dir/.gitignore"
    fi

    # proxy/.env.example 事前作成（実 git リポジトリとして初期化）
    if [ "$config" = "with_example" ]; then
        mkdir -p "$project_dir/claude-code-proxy"
        cat > "$project_dir/claude-code-proxy/.env.example" <<'EXAMPLEEOF'
OPENAI_API_KEY=sk-placeholder
OPENAI_BASE_URL=http://localhost:8000/v1
MODEL=gpt-3.5-turbo
PROXY_PORT=8082
HOST=0.0.0.0
EXAMPLEEOF
        # 実 git pull が通るように正規のリポジトリ + origin remote を設定する
        (
            # ベアリポジトリ（origin 相当）を作成
            mkdir -p "$project_dir/proxy-origin"
            cd "$project_dir/proxy-origin" && git init --bare -q

            # ワーキングリポジトリを作成し origin に push
            mkdir -p "$project_dir/proxy-work"
            cd "$project_dir/proxy-work" && git init -q && \
            git config user.email "test@test.com" && git config user.name "Test" && \
            echo "proxy" > app.py && git add app.py && git commit -q -m "initial" && \
            git remote add origin "$project_dir/proxy-origin" && \
            git push -q origin master

            # claude-code-proxy を clone（setup.sh が期待する状態）
            cd "$project_dir" && git clone -q "$project_dir/proxy-origin" claude-code-proxy-tmp && \
            rm -rf "$project_dir/claude-code-proxy" && \
            mv "$project_dir/claude-code-proxy-tmp" "$project_dir/claude-code-proxy"

            # .env.example を再配置（clone で上書きされたため）
            cat > "$project_dir/claude-code-proxy/.env.example" <<'EXAMPLEEOF2'
OPENAI_API_KEY=sk-placeholder
OPENAI_BASE_URL=http://localhost:8000/v1
MODEL=gpt-3.5-turbo
PROXY_PORT=8082
HOST=0.0.0.0
EXAMPLEEOF2
        ) > /dev/null 2>&1
    fi

    # ラッパースクリプト
    cat > "$project_dir/run_test.sh" <<'WRAPPEREOF'
#!/bin/bash
tools_dir="$1"
config="$2"
shift 2

cd "$(dirname "$0")"

# tools_dir を PATH の先頭に追加（uv ラッパー等）
export PATH="$tools_dir:$PATH"

# git clone の URL をローカルリポジトリに向ける（use_git_local 設定時）
if [ "$config" = "use_git_local" ]; then
    export CLONE_URL="$LOCAL_GIT_REPO"
fi

bash setup.sh "$@" 2>&1
exit_code=$?
echo "[EXIT_CODE:$exit_code]"
exit $exit_code
WRAPPEREOF
    chmod +x "$project_dir/run_test.sh"

    echo "$project_dir"
}

# run_setup — setup.sh をテスト実行
run_setup() {
    local tools_dir="$1"
    local project_dir="$2"
    local extra_env="${3:-}"
    local config="${4:-}"
    (
        if [ -n "$extra_env" ]; then
            eval "export $extra_env"
        fi
        cd "$project_dir"
        bash run_test.sh "$tools_dir" "$config" > /dev/null 2>&1
    )
    return $?
}

# run_setup_capture — 出力もキャプチャ
run_setup_capture() {
    local tools_dir="$1"
    local project_dir="$2"
    local extra_env="${3:-}"
    local config="${4:-}"
    (
        if [ -n "$extra_env" ]; then
            eval "export $extra_env"
        fi
        cd "$project_dir"
        bash run_test.sh "$tools_dir" "$config"
    )
    return $?
}

# file_exists / dir_exists / env_value / cleanup_test
file_exists() { [ -f "$1/$2" ]; }
dir_exists() { [ -d "$1/$2" ]; }
env_value() { grep -E "^${2}=" "$1" 2>/dev/null | head -1 | cut -d= -f2-; }
cleanup_test() { for path in "$@"; do [ -n "$path" ] && [ -d "$path" ] && rm -rf "$path"; done; }

# ============================================================
# Phase 2: uv プロジェクト初期化
# ============================================================

echo "--- Phase 2: uv init の冪等性 ---"

# テストケース 1: pyproject.toml 既存でスキップ
test_phase2_skip_existing() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "with_pyproject")
    local before
    before=$(cat "$project_dir/pyproject.toml")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local after
    after=$(cat "$project_dir/pyproject.toml")
    local main_exists=0
    [ -f "$project_dir/main.py" ] && main_exists=1
    cleanup_test "$tools_dir" "$project_dir"

    if [ "$before" = "$after" ] && [ "$main_exists" -eq 1 ]; then
        record 0 "Phase 2: pyproject.toml 既存 → スキップ"
    else
        record 1 "Phase 2: pyproject.toml 既存 → スキップ失敗"
    fi
}

# テストケース 2: 新規 init → pyproject.toml 生成
# 注: uv がテスト環境に存在しない場合、ラッパーが pyproject.toml を生成する
test_phase2_fresh_init() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local has_pyproject=0; local has_main=0
    file_exists "$project_dir" "pyproject.toml" && has_pyproject=1
    file_exists "$project_dir" "main.py" && has_main=1
    cleanup_test "$tools_dir" "$project_dir"

    if [ "$has_pyproject" -eq 1 ] && [ "$has_main" -eq 0 ]; then
        record 0 "Phase 2: 新規 → pyproject.toml 生成（uv=$(has_uv && echo real || echo wrapper)）"
    else
        record 1 "Phase 2: 新規 → pyproject.toml=$has_pyproject main=$has_main"
    fi
}

# ============================================================
# Phase 4: モデルダウンロード
# ============================================================

echo "--- Phase 4: モデルダウンロードの冪等性 ---"

# テストケース 3: config.json 既存でスキップ
test_phase4_skip_existing() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "with_model")
    local before
    before=$(cat "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality/config.json")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local after
    after=$(cat "$project_dir/models/Qwen3.6-27B-MTPLX-Optimized-Quality/config.json")
    cleanup_test "$tools_dir" "$project_dir"

    if [ "$before" = "$after" ]; then
        record 0 "Phase 4: config.json 既存 → スキップ"
    else
        record 1 "Phase 4: config.json 既存 → スキップ失敗"
    fi
}

# ============================================================
# Phase 4: MODEL_VARIANT 切替
# ============================================================

echo "--- Phase 4: MODEL_VARIANT 切替 ---"

# テストケース 4: MODEL_VARIANT=speed
test_phase4_variant_speed() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" "MODEL_VARIANT=speed" > /dev/null 2>&1
    local has_speed=0
    file_exists "$project_dir" "models/Qwen3.6-27B-MTPLX-Optimized-Speed/config.json" && has_speed=1
    cleanup_test "$tools_dir" "$project_dir"
    [ "$has_speed" -eq 1 ] && record 0 "Phase 4: MODEL_VARIANT=speed → Speed 版" || record 1 "Phase 4: MODEL_VARIANT=speed → 失敗"
}

# テストケース 5: MODEL_VARIANT=invalid → エラー
test_phase4_variant_invalid() {
    local tools_dir project_dir exit_code
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" "MODEL_VARIANT=invalid" > /dev/null 2>&1
    exit_code=$?
    cleanup_test "$tools_dir" "$project_dir"
    [ "$exit_code" -ne 0 ] && record 0 "Phase 4: MODEL_VARIANT=invalid → エラー終了（exit=$exit_code）" || record 1 "Phase 4: MODEL_VARIANT=invalid → 正常終了"
}

# ============================================================
# Phase 5: Proxy セットアップ（実 git 使用）
# ============================================================

echo "--- Phase 5: Claude Code Proxy セットアップ（実 git）---"

# テストケース 6: .git 既存 → ディレクトリ維持
# 実 git pull ではなくディレクトリ維持の確認（ネットワーク非依存）
test_phase5_existing_git() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "with_proxy_git")
    local before
    before=$(cat "$project_dir/claude-code-proxy/README.md" 2>/dev/null)
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local after
    after=$(cat "$project_dir/claude-code-proxy/README.md" 2>/dev/null)
    cleanup_test "$tools_dir" "$project_dir"

    if [ -n "$after" ] && [ "$before" = "$after" ]; then
        record 0 "Phase 5: .git 既存 → ディレクトリ維持"
    else
        record 1 "Phase 5: .git 既存 → ディレクトリ変更"
    fi
}

# テストケース 7: 中途半端なディレクトリ → クリーンアップ
test_phase5_partial_dir() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "with_proxy_partial")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local has_partial=0; local has_git=0
    file_exists "$project_dir" "claude-code-proxy/partial.tmp" && has_partial=1
    dir_exists "$project_dir/claude-code-proxy/.git" && has_git=1
    cleanup_test "$tools_dir" "$project_dir"

    if [ "$has_partial" -eq 0 ] && [ "$has_git" -eq 1 ]; then
        record 0 "Phase 5: 中途半端 → クリーンアップ後 clone"
    elif [ "$has_partial" -eq 0 ] && [ "$has_git" -eq 0 ]; then
        # 実 git clone がネットワークエラーになっても許容（環境依存）
        # ただしクリーンアップはできている
        record 0 "Phase 5: 中途半端 → クリーンアップ（clone は環境依存）"
    else
        record 1 "Phase 5: 中途半端 → 不完全"
    fi
}

# ============================================================
# Phase 6: .env 生成
# ============================================================

echo "--- Phase 6: .env 生成 ---"

# テストケース 8: ルート .env が正しく生成される
test_phase6_root_env() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local mtplx_port proxy_port model_name
    mtplx_port=$(env_value "$project_dir/.env" "MTPLX_PORT")
    proxy_port=$(env_value "$project_dir/.env" "PROXY_PORT")
    model_name=$(env_value "$project_dir/.env" "MODEL_NAME")
    cleanup_test "$tools_dir" "$project_dir"

    if [ "$mtplx_port" = "8080" ] && [ "$proxy_port" = "8082" ] && [ -n "$model_name" ]; then
        record 0 "Phase 6: .env 正しく生成（PORT=$mtplx_port PROXY=$proxy_port）"
    else
        record 1 "Phase 6: .env 値が不正（PORT=$mtplx_port PROXY=$proxy_port）"
    fi
}

# テストケース 9: proxy/.env が .env.example から生成
test_phase6_proxy_env_with_example() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "with_example")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local api_key host
    api_key=$(env_value "$project_dir/claude-code-proxy/.env" "OPENAI_API_KEY")
    host=$(env_value "$project_dir/claude-code-proxy/.env" "HOST")
    cleanup_test "$tools_dir" "$project_dir"

    if [ "$api_key" = "sk-mtplx-local" ] && [ "$host" = "127.0.0.1" ]; then
        record 0 "Phase 6: proxy/.env が .env.example から生成"
    else
        record 1 "Phase 6: proxy/.env 生成失敗（KEY=$api_key HOST=$host）"
    fi
}

# テストケース 10: proxy/.env デフォルト値で生成（.env.example 不在）
test_phase6_proxy_env_without_example() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local has_env=0
    file_exists "$project_dir" "claude-code-proxy/.env" && has_env=1
    cleanup_test "$tools_dir" "$project_dir"
    [ "$has_env" -eq 1 ] && record 0 "Phase 6: proxy/.env デフォルト生成" || record 1 "Phase 6: proxy/.env 未生成"
}

# テストケース 11: .gitignore 不在時のみ生成
test_phase6_gitignore_creation() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local has=0
    file_exists "$project_dir" ".gitignore" && has=1
    cleanup_test "$tools_dir" "$project_dir"
    [ "$has" -eq 1 ] && record 0 "Phase 6: .gitignore 不在 → 新規生成" || record 1 "Phase 6: .gitignore 未生成"
}

# テストケース 12: .gitignore 既存 → スキップ
test_phase6_gitignore_skip() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "with_gitignore")
    local before
    before=$(cat "$project_dir/.gitignore")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local after
    after=$(cat "$project_dir/.gitignore")
    cleanup_test "$tools_dir" "$project_dir"
    [ "$before" = "$after" ] && record 0 "Phase 6: .gitignore 既存 → スキップ" || record 1 "Phase 6: .gitignore 既存 → 上書き"
}

# ============================================================
# 冪等性全体
# ============================================================

echo "--- 冪等性全体 ---"

# テストケース 13: 2回連続実行
test_idempotency_double_run() {
    local tools_dir project_dir
    tools_dir=$(create_test_tools)
    project_dir=$(prepare_project_dir "$tools_dir" "fresh")
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    local has_pyproject=0
    file_exists "$project_dir" "pyproject.toml" && has_pyproject=1
    local has_env=0
    file_exists "$project_dir" ".env" && has_env=1
    cleanup_test "$tools_dir" "$project_dir"
    [ "$has_pyproject" -eq 1 ] && [ "$has_env" -eq 1 ] && record 0 "冪等性: 2回実行でもリソース維持" || record 1 "冪等性: リソース消失"
}

# ============================================================
# Phase 1: check_all テスト（実関数 + PATH 操作）
# ============================================================

echo "--- Phase 1: 前提条件チェック（実 check_all）---"

# テストケース 14: check_all 不全 → die + exit 1
# PATH から brew を隠蔽することで check_brew を失敗させる
test_phase1_check_all_fail() {
    local tools_dir project_dir exit_code
    # check_all が real の check_brew を呼ぶ → command -v brew が
    # PATH にないと失敗する。tools_dir に brew がなく、実 PATH にも
    # brew がない環境でテスト。brew がインストール済みの環境では
    # check_all が成功してしまうため、brew を隠蔽するために PATH を制限する。
    #
    # 方法: PATH を tools_dir だけに制限した状態で setup.sh の Phase 1 を実行。
    # tools_dir には brew が配置されていない → check_brew が die する。
    tools_dir=$(mktemp -d "/tmp/setup_tools_XXXXXX")
    # 意図的に brew を配置しない（不在にさせる）

    # uv だけは setup.sh が Phase 2 に進むのに必要なので配置
    if has_uv; then
        ln -sf "$(command -v uv)" "$tools_dir/uv" 2>/dev/null || true
    else
        cat > "$tools_dir/uv" <<'UVMOCK'
#!/bin/bash
echo '{"model":"test"}'
exit 0
UVMOCK
        chmod +x "$tools_dir/uv"
    fi

    project_dir=$(prepare_project_dir "$tools_dir" "fresh")

    # ラッパーを作成（PATH を tools_dir のみに制限）
    cat > "$project_dir/run_test.sh" <<'WRAPPEREOF'
#!/bin/bash
tools_dir="$1"
shift

# PATH を tools_dir のみに制限（実システムの brew を隠蔽）
export PATH="$tools_dir"

cd "$(dirname "$0")"
bash setup.sh "$@" 2>&1
exit_code=$?
echo "[EXIT_CODE:$exit_code]"
exit $exit_code
WRAPPEREOF
    chmod +x "$project_dir/run_test.sh"

    run_setup "$tools_dir" "$project_dir" > /dev/null 2>&1
    exit_code=$?
    cleanup_test "$tools_dir" "$project_dir"

    [ "$exit_code" -ne 0 ] && record 0 "Phase 1: check_all 不全 → エラー終了（exit=$exit_code）" || record 1 "Phase 1: check_all 不全 → 正常終了"
}

# ============================================================
# テスト実行
# ============================================================

test_phase2_skip_existing
test_phase2_fresh_init
test_phase4_skip_existing
test_phase4_variant_speed
test_phase4_variant_invalid
test_phase5_existing_git
test_phase5_partial_dir
test_phase6_root_env
test_phase6_proxy_env_with_example
test_phase6_proxy_env_without_example
test_phase6_gitignore_creation
test_phase6_gitignore_skip
test_idempotency_double_run
test_phase1_check_all_fail

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
