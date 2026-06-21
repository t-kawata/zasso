#!/bin/sh
# test-doctor.sh — doctor.sh のユニットテスト
#
# 注意: 本テストは doctor.sh の制御フロー（逐次実行の順序と終了条件）を検証する。
# 個別の check_* 関数の動作検証は test-common.sh で実施済み。
#
# テスト方法:
#   - PATH 完全置換でツールの存在/不在を制御（モックバイナリは不使用）
#   - uname/sysctl: テスト用ラッパーで出力を制御（実機では再現不可能な
#     Apple Silicon 以外のシミュレートに必要）
#   - 不在テスト: 該当ツールをテスト環境に追加しないことで実現
#   - 実在テスト: 実コマンドが存在すれば使用、なければ echo ラッパー
#
# 使用方法: sh test-doctor.sh

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCTOR_SH="$(cd "$TEST_DIR/.." && pwd)/doctor.sh"
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

echo "=== doctor.sh ユニットテスト ==="
echo ""

# ============================================================
# ヘルパー関数
# ============================================================

create_test_env() {
    local test_dir
    test_dir=$(mktemp -d "/tmp/dr_test_env_XXXXXX")

    # PATH 完全置換時に必要なシステムツール群（実コマンドに委譲）
    # bash: サブシェル実行に必須。dirname: $(dirname "$0") に必須。
    # head: check_tool 内の head -1 に必須。
    for sys_cmd in bash dirname head; do
        for p in /bin /usr/bin; do
            [ -x "$p/$sys_cmd" ] && ln -sf "$p/$sys_cmd" "$test_dir/$sys_cmd" 2>/dev/null
        done
    done

    cat > "$test_dir/uname" <<'ENDSCRIPT'
#!/bin/sh
echo "${UNAME_OUT:-arm64}"
ENDSCRIPT
    chmod +x "$test_dir/uname"

    cat > "$test_dir/sysctl" <<'ENDSCRIPT'
#!/bin/sh
echo "${SYSCTL_OUT:-1}"
ENDSCRIPT
    chmod +x "$test_dir/sysctl"

    for tool in "$@"; do
        case "$tool" in bash|dirname|head|uname|sysctl) continue ;; esac
        # 実コマンドが存在し、かつ単純なバイナリの場合のみ symlink
        if [ "$tool" = "git" ] && command -v git > /dev/null 2>&1; then
            ln -sf "$(command -v git)" "$test_dir/git" 2>/dev/null
        fi
        # 上記で symlink されなかった場合は echo ラッパー
        if [ ! -x "$test_dir/$tool" ]; then
            cat > "$test_dir/$tool" <<'ENDSCRIPT'
#!/bin/sh
echo "tool version 1.0"
ENDSCRIPT
            chmod +x "$test_dir/$tool"
        fi
    done
    echo "$test_dir"
}

cleanup_test() {
    for path in "$@"; do
        [ -n "$path" ] && [ -d "$path" ] && rm -rf "$path"
    done
}

run_doctor() {
    local env_dir="$1" extra="$2" model="${3:-}"
    (
        [ -n "$extra" ] && eval "export $extra"
        [ -n "$model" ] && export MODEL_DIR="$model"
        PATH="$env_dir" bash "$DOCTOR_SH"
    )
    return $?
}

# ============================================================
# Test 1: 正常系 — 全前提条件充足
# ============================================================
echo "--- Test 1: 全前提条件充足 ---"
T1_E=$(create_test_env brew python3.12 git uv node claude)
T1_M=$(mktemp -d "/tmp/dr_model_XXXXXX"); touch "$T1_M/config.json"
output=$(run_doctor "$T1_E" "UNAME_OUT=arm64 SYSCTL_OUT=1" "$T1_M") 2>&1; rc=$?
cleanup_test "$T1_E" "$T1_M"

case "$output" in *"環境は整っています"*) record 0 "正常系: 全通過で成功メッセージ" ;; *) record 1 "正常系: 期待メッセージなし" ;; esac
[ "$rc" -eq 0 ] && record 0 "正常系: exit code 0" || record 1 "正常系: exit code ${rc}（期待: 0）"

# ============================================================
# Test 2: 異常系 — Apple Silicon 以外
# ============================================================
echo "--- Test 2: Apple Silicon 以外 ---"
T2_E=$(create_test_env)
output=$(run_doctor "$T2_E" "UNAME_OUT=x86_64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T2_E"

case "$output" in *"Apple Silicon ではありません"*) record 0 "非 Apple Silicon でエラーメッセージ" ;; *) record 1 "異常系: 期待メッセージなし" ;; esac
[ "$rc" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${rc}（期待: 1）"
case "$output" in *"診断完了"*) record 1 "Step 1 で停止せず後続" ;; *) record 0 "Step 1 で正しく停止" ;; esac

# ============================================================
# Test 3: 異常系 — Homebrew 不在
# ============================================================
echo "--- Test 3: Homebrew 不在 ---"
T3_E=$(create_test_env python3.12 git uv node claude)
output=$(run_doctor "$T3_E" "UNAME_OUT=arm64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T3_E"

case "$output" in *"Homebrew がインストールされていません"*) record 0 "Homebrew 不在でエラーメッセージ" ;; *) record 1 "異常系: 期待メッセージなし" ;; esac
[ "$rc" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${rc}（期待: 1）"
case "$output" in *"診断完了"*) record 1 "Step 2 で停止せず後続" ;; *) record 0 "Step 2 で正しく停止" ;; esac

# ============================================================
# Test 4: 異常系 — Python 3.12 不足
# ============================================================
echo "--- Test 4: Python 3.12 不足 ---"
T4_E=$(create_test_env brew git uv node claude)
output=$(run_doctor "$T4_E" "UNAME_OUT=arm64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T4_E"

case "$output" in *"Python 3.12 がインストールされていません"*) record 0 "Python 3.12 不足でエラーメッセージ" ;; *) record 1 "異常系: 期待メッセージなし" ;; esac
[ "$rc" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${rc}（期待: 1）"

# ============================================================
# Test 5: 異常系 — Node.js 不足
# ============================================================
echo "--- Test 5: Node.js 不足 ---"
T5_E=$(create_test_env brew python3.12 git uv claude)
output=$(run_doctor "$T5_E" "UNAME_OUT=arm64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T5_E"

case "$output" in *"Node.js がインストールされていません"*) record 0 "Node.js 不足でエラーメッセージ" ;; *) record 1 "異常系: 期待メッセージなし" ;; esac
[ "$rc" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${rc}（期待: 1）"
case "$output" in *"uv: OK"*) record 0 "Step 5（uv）まで通過" ;; *) record 1 "Step 5 の出力なし" ;; esac

# ============================================================
# Test 6: 異常系 — Claude Code 不在
# ============================================================
echo "--- Test 6: Claude Code 不在 ---"
T6_E=$(create_test_env brew python3.12 git uv node)
output=$(run_doctor "$T6_E" "UNAME_OUT=arm64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T6_E"

case "$output" in *"Claude Code がインストールされていません"*) record 0 "Claude Code 不足でエラーメッセージ" ;; *) record 1 "異常系: 期待メッセージなし" ;; esac
[ "$rc" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${rc}（期待: 1）"
case "$output" in *"Node.js: OK"*) record 0 "Step 6（Node.js）まで通過" ;; *) record 1 "Step 6 の出力なし" ;; esac

# ============================================================
# Test 7: 警告系 — モデル不在のみ
# ============================================================
echo "--- Test 7: モデル不在のみ ---"
T7_E=$(create_test_env brew python3.12 git uv node claude)
output=$(run_doctor "$T7_E" "UNAME_OUT=arm64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T7_E"

case "$output" in *"モデルファイルが見つかりません"*"setup.sh を実行"*) record 0 "モデル不在の警告 + setup.sh 案内" ;; *) record 1 "モデル不在の警告なし" ;; esac
[ "$rc" -eq 0 ] && record 0 "exit code 0（モデル不在でも非終了）" || record 1 "exit code ${rc}（期待: 0）"
case "$output" in *"Apple Silicon: OK"*"Claude Code: OK"*) record 0 "全ツールが通過" ;; *) record 1 "一部ツールが未通過" ;; esac

# ============================================================
# Test 8: 境界値 — MODEL_DIR 環境変数指定
# ============================================================
echo "--- Test 8: MODEL_DIR 環境変数指定 ---"
T8_E=$(create_test_env brew python3.12 git uv node claude)
T8_M=$(mktemp -d "/tmp/dr_model_XXXXXX"); touch "$T8_M/config.json"
T8_N=$(basename "$T8_M")
output=$(run_doctor "$T8_E" "UNAME_OUT=arm64 SYSCTL_OUT=1" "$T8_M") 2>&1; rc=$?
cleanup_test "$T8_E" "$T8_M"

case "$output" in *"$T8_N"*) record 0 "MODEL_DIR 環境変数が反映" ;; *) record 1 "カスタム MODEL_DIR の出力なし" ;; esac
[ "$rc" -eq 0 ] && record 0 "exit code 0" || record 1 "exit code ${rc}（期待: 0）"

# ============================================================
# Test 9: 境界値 — git 不足
# ============================================================
echo "--- Test 9: git 除去 ---"
T9_E=$(create_test_env brew python3.12 uv node claude)
output=$(run_doctor "$T9_E" "UNAME_OUT=arm64 SYSCTL_OUT=1") 2>&1; rc=$?
cleanup_test "$T9_E"

case "$output" in *"Git がインストールされていません"*) record 0 "git 不足で Step 4 でエラー終了" ;; *) record 1 "git 不足時のメッセージなし" ;; esac
[ "$rc" -eq 1 ] && record 0 "exit code 1" || record 1 "exit code ${rc}（期待: 1）"
case "$output" in *"Apple Silicon: OK"*"Homebrew: OK"*"Python 3.12: OK"*) record 0 "Step 1-3 が正しく通過" ;; *) record 1 "Step 1-3 の出力なし" ;; esac

# ============================================================
# Test 10: 順序確認
# ============================================================
echo "--- Test 10: 診断出力の順序確認 ---"
T10_E=$(create_test_env brew python3.12 git uv node claude)
T10_M=$(mktemp -d "/tmp/dr_model_XXXXXX"); touch "$T10_M/config.json"
output=$(run_doctor "$T10_E" "UNAME_OUT=arm64 SYSCTL_OUT=1" "$T10_M") 2>&1; rc=$?
cleanup_test "$T10_E" "$T10_M"

# キーフレーズの出現順序を確認（RFC 処理フロー順）
has_seq=true
for phrase in "=== mycc 環境診断 ===" "Apple Silicon: OK" "Homebrew: OK" "Claude Code: OK" "=== 診断完了 ===" "環境は整っています"; do
    case "$output" in *"$phrase"*) ;; *) has_seq=false; break ;; esac
done
$has_seq && record 0 "RFC 処理フロー通りの出力順序" || record 1 "出力順序が不正"
[ "$rc" -eq 0 ] && record 0 "exit code 0" || record 1 "exit code ${rc}（期待: 0）"

# ============================================================
echo ""
echo "=== 結果: $PASS/$TOTAL passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then exit 1; fi
