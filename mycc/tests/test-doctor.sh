#!/bin/sh
# test-doctor.sh — doctor.sh のユニットテスト
#
# 注意: 本テストは doctor.sh の制御フロー（逐次実行の順序と終了条件）を
# 検証する。個別の check_* 関数の動作検証は test-common.sh で実施済み。
# 全テストはサブシェルで実行し、テスト間の相互影響を防ぐ。
# 使用方法: sh test-doctor.sh

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCTOR_SH="$(cd "$TEST_DIR/.." && pwd)/doctor.sh"
PASS=0
FAIL=0
TOTAL=0

# record — テスト結果を記録する
# $1: 終了コード（0=成功、1=失敗）
# $2: テスト説明
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
# ヘルパー関数: モックディレクトリの作成
# check_* 関数がすべて成功するように外部コマンドをモックする
# ============================================================
# create_mock_all_pass — 全チェック通過用のモック環境を作成する
# 戻り値: 作成したモックディレクトリのパス（呼び出し元で rm -rf 必須）
create_mock_all_pass() {
    local mock_dir
    mock_dir=$(mktemp -d)

    # Apple Silicon 確認用モック
    cat > "$mock_dir/uname" <<'MOCKEOF'
#!/bin/sh
echo "arm64"
MOCKEOF
    cat > "$mock_dir/sysctl" <<'MOCKEOF'
#!/bin/sh
echo "1"
MOCKEOF

    # 各ツールのモック（brew, python3.12, git, uv, node, claude）
    for cmd in brew python3.12 git uv node claude; do
        cat > "$mock_dir/$cmd" <<'MOCKEOF'
#!/bin/sh
echo "mock version 1.0"
MOCKEOF
        chmod +x "$mock_dir/$cmd"
    done

    chmod +x "$mock_dir/uname" "$mock_dir/sysctl"
    echo "$mock_dir"
}

# create_mock_dir — PATH 完全置換用のモックディレクトリを作成する
# 指定されたコマンド一覧のモックスクリプトを作成し、bash ラッパーも含める。
# uname と sysctl は Apple Silicon 確認を通過する値（arm64, 1）を返す。
# $@: モックするコマンド名（例: brew python3.12 git uv node claude）
# 戻り値: 作成したモックディレクトリのパス（呼び出し元で rm -rf 必須）
create_mock_dir() {
    local mock_dir
    mock_dir=$(mktemp -d)

    # bash ラッパー（実 bash に委譲）
    cat > "$mock_dir/bash" <<'MOCKEOF'
#!/bin/sh
exec /bin/bash "$@"
MOCKEOF
    chmod +x "$mock_dir/bash"

    # uname — Apple Silicon 確認通過用（arm64 を返す）
    cat > "$mock_dir/uname" <<'MOCKEOF'
#!/bin/sh
echo "arm64"
MOCKEOF
    chmod +x "$mock_dir/uname"

    # sysctl — Apple Silicon 確認通過用（hw.optional.arm64 = 1）
    cat > "$mock_dir/sysctl" <<'MOCKEOF'
#!/bin/sh
echo "1"
MOCKEOF
    chmod +x "$mock_dir/sysctl"

    # dirname — スクリプト内の $(dirname "$0") で必要（実 dirname に委譲）
    cat > "$mock_dir/dirname" <<'MOCKEOF'
#!/bin/sh
exec /usr/bin/dirname "$@"
MOCKEOF
    chmod +x "$mock_dir/dirname"

    # 各コマンドのモック
    for cmd in "$@"; do
        # uname と sysctl は上で作成済み
        case "$cmd" in
            uname|sysctl) continue ;;
        esac
        cat > "$mock_dir/$cmd" <<'MOCKEOF'
#!/bin/sh
echo "mock version 1.0"
MOCKEOF
        chmod +x "$mock_dir/$cmd"
    done
    echo "$mock_dir"
}

# ============================================================
# Test 1: 正常系 — 全前提条件充足
# ============================================================
echo "--- Test 1: 全前提条件充足 ---"
mock1=$(create_mock_all_pass)
# モデル確認通過用のディレクトリを作成
model_dir1=$(mktemp -d)
touch "$model_dir1/config.json"

exit_code=0
result=$( (MODEL_DIR="$model_dir1" PATH="$mock1:$PATH" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock1" "$model_dir1"

case "$result" in
    *"環境は整っています"*) record 0 "正常系: 全通過で成功メッセージ" ;;
    *) record 1 "正常系: 期待メッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 0 ] && record 0 "正常系: exit code 0" || record 1 "正常系: exit code ${exit_code}（期待: 0）"

# ============================================================
# Test 2: 異常系 — Apple Silicon 以外
# ============================================================
echo "--- Test 2: Apple Silicon 以外 ---"
mock2=$(mktemp -d)
# uname が x86_64 を返し、sysctl が 0 を返す
cat > "$mock2/uname" <<'EOF'
#!/bin/sh
echo "x86_64"
EOF
cat > "$mock2/sysctl" <<'EOF'
#!/bin/sh
echo "0"
EOF
chmod +x "$mock2/uname" "$mock2/sysctl"
# brew などは PATH に通してあることにする（Step 1 で止まるため不要）

exit_code=0
# 元の PATH も含める（brew 等が存在する環境でテスト）
result=$( (PATH="$mock2:$PATH" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock2"

case "$result" in
    *"Apple Silicon ではありません"*) record 0 "異常系: Apple Silicon 以外でエラーメッセージ" ;;
    *) record 1 "異常系: 期待メッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${exit_code}（期待: 1）"

# 出力に "=== 診断完了" が含まれていない（Step 1 で停止した）ことを確認
case "$result" in
    *"診断完了"*) record 1 "異常系: Step 1 で停止せず後続に進んだ" ;;
    *) record 0 "異常系: Step 1 で正しく停止" ;;
esac

# ============================================================
# Test 3: 異常系 — Homebrew 不在
# ============================================================
echo "--- Test 3: Homebrew 不在 ---"
# Apple Silicon 確認用モックのみ作成（brew はモックしない → 不在）
mock3=$(create_mock_dir)

exit_code=0
result=$( (PATH="$mock3" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock3"

case "$result" in
    *"Homebrew がインストールされていません"*) record 0 "異常系: Homebrew 不在でエラーメッセージ" ;;
    *) record 1 "異常系: Homebrew 不在時のメッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${exit_code}（期待: 1）"

case "$result" in
    *"診断完了"*) record 1 "異常系: Step 2 で停止せず後続に進んだ" ;;
    *) record 0 "異常系: Step 2 で正しく停止" ;;
esac

# ============================================================
# Test 4: 異常系 — 特定ツール不足（Python 3.12、Step 3 で停止）
# ============================================================
echo "--- Test 4: Python 3.12 不足（Step 3） ---"
# python3.12 はモックしない → 不在扱い
mock4=$(create_mock_dir brew git uv node claude)

exit_code=0
result=$( (PATH="$mock4" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock4"

case "$result" in
    *"Python 3.12 がインストールされていません"*) record 0 "異常系: Python 3.12 不足でエラーメッセージ" ;;
    *) record 1 "異常系: Python 3.12 不足時のメッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${exit_code}（期待: 1）"

# ============================================================
# Test 5: 異常系 — 特定ツール不足（Node.js、Step 6 で停止）
# ============================================================
echo "--- Test 5: Node.js 不足（Step 6） ---"
# node はモックしない → 不在扱い
mock5=$(create_mock_dir brew python3.12 git uv claude)

exit_code=0
result=$( (PATH="$mock5" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock5"

case "$result" in
    *"Node.js がインストールされていません"*) record 0 "異常系: Node.js 不足でエラーメッセージ（Step 6）" ;;
    *) record 1 "異常系: Node.js 不足時のメッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${exit_code}（期待: 1）"

# Step 5（uv）までは通過していることを確認
case "$result" in
    *"uv: OK"*) record 0 "異常系: Step 5（uv）まで正しく通過" ;;
    *) record 1 "異常系: Step 5（uv）の出力なし" ;;
esac

# ============================================================
# Test 6: 異常系 — Claude Code 不在（Step 7）
# ============================================================
echo "--- Test 6: Claude Code 不在（Step 7） ---"
# claude はモックしない → 不在扱い
mock6=$(create_mock_dir brew python3.12 git uv node)

exit_code=0
result=$( (PATH="$mock6" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock6"

case "$result" in
    *"Claude Code がインストールされていません"*) record 0 "異常系: Claude Code 不足でエラーメッセージ（Step 7）" ;;
    *) record 1 "異常系: Claude Code 不足時のメッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "異常系: exit code 1" || record 1 "異常系: exit code ${exit_code}（期待: 1）"

case "$result" in
    *"Node.js: OK"*) record 0 "異常系: Step 6（Node.js）まで正しく通過" ;;
    *) record 1 "異常系: Step 6（Node.js）の出力なし" ;;
esac

# ============================================================
# Test 7: 警告系 — モデル不在のみ（全ツール通過）
# ============================================================
echo "--- Test 7: モデル不在のみ（全ツール通過） ---"
mock7=$(create_mock_all_pass)

exit_code=0
result=$( (PATH="$mock7:$PATH" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock7"

case "$result" in
    *"モデルファイルが見つかりません"*"setup.sh を実行"*) record 0 "警告系: モデル不在の警告 + setup.sh 案内" ;;
    *) record 1 "警告系: モデル不在の警告なし (got: $result)" ;;
esac
[ "$exit_code" -eq 0 ] && record 0 "警告系: exit code 0（モデル不在でも非終了）" || record 1 "警告系: exit code ${exit_code}（期待: 0）"

# 全ツールチェックが通過していることを確認（モデル警告の前にツール OK 表示がある）
case "$result" in
    *"Apple Silicon: OK"*"Homebrew: OK"*"Python 3.12: OK"*"Git: OK"*"uv: OK"*"Node.js: OK"*"Claude Code: OK"*) record 0 "警告系: 全ツールが通過" ;;
    *) record 1 "警告系: 一部ツールが未通過 (got: $result)" ;;
esac

# ============================================================
# Test 8: 境界値 — MODEL_DIR 環境変数指定
# ============================================================
echo "--- Test 8: MODEL_DIR 環境変数指定 ---"
mock8=$(create_mock_all_pass)
custom_model_dir=$(mktemp -d)
touch "$custom_model_dir/config.json"

exit_code=0
result=$( (MODEL_DIR="$custom_model_dir" PATH="$mock8:$PATH" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
# カスタムパスが出力に含まれているか確認
dir_basename=$(basename "$custom_model_dir")
rm -rf "$mock8" "$custom_model_dir"

case "$result" in
    *"$dir_basename"*) record 0 "境界値: MODEL_DIR 環境変数が反映されている" ;;
    *) record 1 "境界値: カスタム MODEL_DIR の出力なし (got: $result)" ;;
esac
[ "$exit_code" -eq 0 ] && record 0 "境界値: exit code 0" || record 1 "境界値: exit code ${exit_code}（期待: 0）"

# ============================================================
# Test 9: 境界値 — PATH から一部バイナリ除去（Git 不足）
# ============================================================
echo "--- Test 9: PATH から git 除去（Step 4 で停止） ---"
# git はモックしない → 不在扱い
mock9=$(create_mock_dir brew python3.12 uv node claude)

exit_code=0
result=$( (PATH="$mock9" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock9"

case "$result" in
    *"Git がインストールされていません"*) record 0 "境界値: git 不足で Step 4 でエラー終了" ;;
    *) record 1 "境界値: git 不足時のメッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "境界値: exit code 1" || record 1 "境界値: exit code ${exit_code}（期待: 1）"

# Step 1-3 は通過していることを確認
case "$result" in
    *"Apple Silicon: OK"*"Homebrew: OK"*"Python 3.12: OK"*) record 0 "境界値: Step 1-3 が正しく通過" ;;
    *) record 1 "境界値: Step 1-3 の出力なし (got: $result)" ;;
esac

# ============================================================
# Test 10: 正常系 — 診断完了メッセージの順序確認
# ============================================================
echo "--- Test 10: 診断出力の順序確認 ---"
mock10=$(create_mock_all_pass)
model_dir10=$(mktemp -d)
touch "$model_dir10/config.json"

exit_code=0
output=$( (MODEL_DIR="$model_dir10" PATH="$mock10:$PATH" bash "$DOCTOR_SH") 2>&1) || exit_code=$?
rm -rf "$mock10" "$model_dir10"

# 期待される出力順序（RFC 処理フロー図通り）:
# 1. "=== mycc 環境診断 ==="
# 2. "Apple Silicon: OK"
# 3. "Homebrew: OK"
# 4. "Python 3.12: OK"
# 5. "Git: OK"
# 6. "uv: OK"
# 7. "Node.js: OK"
# 8. "Claude Code: OK"
# 9. "モデル: OK"
# 10. "=== 診断完了 ===" + "環境は整っています。"

order_ok=true
expected_seq="=== mycc 環境診断 ==="
expected_seq="${expected_seq}.*Apple Silicon: OK"
expected_seq="${expected_seq}.*Homebrew: OK"
expected_seq="${expected_seq}.*Python 3.12: OK"
expected_seq="${expected_seq}.*Git: OK"
expected_seq="${expected_seq}.*uv: OK"
expected_seq="${expected_seq}.*Node.js: OK"
expected_seq="${expected_seq}.*Claude Code: OK"
expected_seq="${expected_seq}.*モデル: OK"
expected_seq="${expected_seq}.*=== 診断完了 ==="
expected_seq="${expected_seq}.*環境は整っています"

# 改行をスペースに置き換えて連結し、順序確認
flat_output=$(echo "$output" | tr '\n' ' ')
case "$flat_output" in
    *"=== mycc 環境診断 ==="*"Apple Silicon: OK"*"Homebrew: OK"*"Python 3.12: OK"*"Git: OK"*"uv: OK"*"Node.js: OK"*"Claude Code: OK"*"モデル: OK"*"=== 診断完了 ==="*"環境は整っています"*) record 0 "順序確認: RFC 処理フロー通りの出力順序" ;;
    *) record 1 "順序確認: 出力順序が不正 (got: $flat_output)" ;;
esac
[ "$exit_code" -eq 0 ] && record 0 "順序確認: exit code 0" || record 1 "順序確認: exit code ${exit_code}（期待: 0）"

echo ""
echo "=== 結果: $PASS/$TOTAL passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
