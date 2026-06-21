#!/bin/sh
# test-common.sh — common.sh のユニットテスト
#
# 全テストはサブシェルで実行し、テスト間の相互影響を防ぐ。
# 使用方法: sh test-common.sh

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
COMMON_SH="$(cd "$TEST_DIR/.." && pwd)/common.sh"
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

echo "=== common.sh ユニットテスト ==="
echo ""

# Test 1: info() が [INFO] プレフィックスを出力する
echo "--- Test 1: info() 標準メッセージ ---"
result=$( (source "$COMMON_SH" && info "starting server") 2>&1)
case "$result" in
    *"[INFO]"*"starting server"*) record 0 "info: [INFO] + メッセージを出力" ;;
    *) record 1 "info: 出力が不正 (got: $result)" ;;
esac

# Test 2: warn() が [WARN] プレフィックスを出力する
echo "--- Test 2: warn() 標準メッセージ ---"
result=$( (source "$COMMON_SH" && warn "disk 80% full") 2>&1)
case "$result" in
    *"[WARN]"*"disk 80% full"*) record 0 "warn: [WARN] + メッセージを出力" ;;
    *) record 1 "warn: 出力が不正 (got: $result)" ;;
esac

# Test 3: error() が [ERROR] プレフィックスを出力する
echo "--- Test 3: error() 標準メッセージ ---"
result=$( (source "$COMMON_SH" && error "connection failed") 2>&1)
case "$result" in
    *"[ERROR]"*"connection failed"*) record 0 "error: [ERROR] + メッセージを出力" ;;
    *) record 1 "error: 出力が不正 (got: $result)" ;;
esac

# Test 4: die() が [ERROR] を出力し、終了コード 1 で終了する
echo "--- Test 4: die() エラー終了 ---"
exit_code=0
result=$( (source "$COMMON_SH" && die "fatal error") 2>&1) || exit_code=$?
case "$result" in
    *"[ERROR]"*"fatal error"*) record 0 "die: [ERROR] + メッセージを出力" ;;
    *) record 1 "die: 出力が不正 (got: $result)" ;;
esac
if [ "$exit_code" -eq 1 ]; then
    record 0 "die: 終了コード 1"
else
    record 1 "die: 終了コード ${exit_code}（期待: 1）"
fi

# Test 5: 空文字列メッセージ — プレフィックスのみ出力される
echo "--- Test 5: 空文字列 ---"
result=$( (source "$COMMON_SH" && info "") 2>&1)
case "$result" in
    *"[INFO]"*) record 0 "空文字列: プレフィックスを出力" ;;
    *) record 1 "空文字列: 出力なし" ;;
esac

# Test 6: 複数行メッセージ — クラッシュせずに出力される
echo "--- Test 6: 複数行メッセージ ---"
result=$( (source "$COMMON_SH" && info "line1\nline2") 2>&1)
if [ -n "$result" ]; then
    record 0 "複数行: 正常に出力"
else
    record 1 "複数行: 出力なし"
fi

# Test 7: 4関数すべてが定義済みであること
echo "--- Test 7: 関数定義確認 ---"
(source "$COMMON_SH" && command -v info && command -v warn && command -v error && command -v die) > /dev/null 2>&1
record $? "4関数がすべて定義済み"

# Test 8: die() の出力に [ERROR] プレフィックスが含まれる
# 注: 実際の出力は「\033[31m[ERROR]\033[0m msg」のように ANSI コードが [ERROR] を囲む
echo "--- Test 8: die() → error() 内部呼び出し確認 ---"
result=$( (source "$COMMON_SH" && die "msg") 2>&1) || true
case "$result" in
    *"[ERROR]"*"msg"*) record 0 "die: 出力に [ERROR] プレフィックスを含む" ;;
    *) record 1 "die: [ERROR] が含まれない (got: $result)" ;;
esac

# ============================================================
# M0-2: 環境チェック関数群テスト
# ============================================================
# 全テストはサブシェルで実行し、PATH 一時上書きによる
# 外部コマンドモックで検証する。

# Test 9: check_apple_silicon — 正常系（Apple Silicon）
echo "--- Test 9: check_apple_silicon 正常系 ---"
result=$( (source "$COMMON_SH" && check_apple_silicon) 2>&1)
case "$result" in
    *"Apple Silicon: OK"*) record 0 "check_apple_silicon: Apple Silicon 上で OK" ;;
    *) record 1 "check_apple_silicon: 非 Apple Silicon 環境（スキップ扱い: $result）" ;;
esac

# Test 10: check_apple_silicon — 異常系（uname が x86_64）
echo "--- Test 10: check_apple_silicon uname=x86_64 ---"
mock_dir=$(mktemp -d)
cat > "$mock_dir/uname" <<'EOF'
#!/bin/sh
echo "x86_64"
EOF
chmod +x "$mock_dir/uname"
exit_code=0
result=$( (PATH="$mock_dir:$PATH"; source "$COMMON_SH" && check_apple_silicon) 2>&1) || exit_code=$?
rm -rf "$mock_dir"
case "$result" in
    *"Apple Silicon ではありません"*) record 0 "check_apple_silicon: x86_64 モックで die" ;;
    *) record 1 "check_apple_silicon: 期待メッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_apple_silicon: exit code 1" || record 1 "check_apple_silicon: exit code ${exit_code}"

# Test 11: check_apple_silicon — sysctl が 0
echo "--- Test 11: check_apple_silicon sysctl=0 ---"
mock_dir2=$(mktemp -d)
cat > "$mock_dir2/uname" <<'EOF'
#!/bin/sh
echo "arm64"
EOF
cat > "$mock_dir2/sysctl" <<'EOF'
#!/bin/sh
echo "0"
EOF
chmod +x "$mock_dir2/uname" "$mock_dir2/sysctl"
exit_code=0
result=$( (PATH="$mock_dir2:$PATH"; source "$COMMON_SH" && check_apple_silicon) 2>&1) || exit_code=$?
rm -rf "$mock_dir2"
case "$result" in
    *"Apple Silicon ではありません"*) record 0 "check_apple_silicon: sysctl=0 で die" ;;
    *) record 1 "check_apple_silicon: sysctl=0 で期待メッセージなし (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_apple_silicon: sysctl=0 exit code 1" || record 1 "check_apple_silicon: sysctl=0 exit code ${exit_code}"

# Test 12: check_brew — 正常系
echo "--- Test 12: check_brew 正常系 ---"
result=$( (source "$COMMON_SH" && check_brew) 2>&1)
case "$result" in
    *"Homebrew: OK"*) record 0 "check_brew: Homebrew 存在時 OK" ;;
    *) record 1 "check_brew: Homebrew 不在か出力不正 (got: $result)" ;;
esac

# Test 13: check_brew — 異常系（brew 不在）
echo "--- Test 13: check_brew brew 不在 ---"
mock_dir3=$(mktemp -d)
# PATH に brew が存在しない状態を作る
exit_code=0
result=$( (PATH="$mock_dir3"; source "$COMMON_SH" && check_brew) 2>&1) || exit_code=$?
rm -rf "$mock_dir3"
case "$result" in
    *"Homebrew がインストールされていません"*) record 0 "check_brew: 不在時 die + 手順表示" ;;
    *) record 1 "check_brew: 不在時のメッセージが不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_brew: exit code 1" || record 1 "check_brew: exit code ${exit_code}"

# Test 14: check_tool — 正常系（実在コマンド）
echo "--- Test 14: check_tool 正常系 ---"
result=$( (source "$COMMON_SH" && check_tool "echo" "echo" "--version") 2>&1)
case "$result" in
    *"echo: OK"*) record 0 "check_tool: 実在コマンド OK" ;;
    *) record 1 "check_tool: 実在コマンドで期待出力なし (got: $result)" ;;
esac

# Test 15: check_tool — 異常系（不在ツール）
echo "--- Test 15: check_tool 不在 ---"
mock_dir4=$(mktemp -d)
exit_code=0
result=$( (PATH="$mock_dir4"; source "$COMMON_SH" && check_tool "nonexistent" "nonexistent_cmd") 2>&1) || exit_code=$?
rm -rf "$mock_dir4"
case "$result" in
    *"nonexistent がインストールされていません"*) record 0 "check_tool: 不在時 die + brew install" ;;
    *) record 1 "check_tool: 不在時のメッセージが不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_tool: exit code 1" || record 1 "check_tool: exit code ${exit_code}"

# Test 16: check_tool — カスタムバージョンフラグ
echo "--- Test 16: check_tool カスタムフラグ ---"
result=$( (source "$COMMON_SH" && check_tool "echo" "echo" "--version") 2>&1)
case "$result" in
    *"echo: OK"*) record 0 "check_tool: カスタムフラグ正常" ;;
    *) record 1 "check_tool: カスタムフラグでエラー (got: $result)" ;;
esac

# Test 17: check_claude — 正常系
echo "--- Test 17: check_claude 正常系 ---"
result=$( (source "$COMMON_SH" && check_claude) 2>&1)
case "$result" in
    *"Claude Code: OK"*) record 0 "check_claude: Claude Code 存在時 OK" ;;
    *) record 1 "check_claude: Claude Code 不在 (got: $result)" ;;
esac

# Test 18: check_claude — 異常系（claude 不在）
echo "--- Test 18: check_claude claude 不在 ---"
mock_dir5=$(mktemp -d)
exit_code=0
result=$( (PATH="$mock_dir5"; source "$COMMON_SH" && check_claude) 2>&1) || exit_code=$?
rm -rf "$mock_dir5"
case "$result" in
    *"Claude Code がインストールされていません"*) record 0 "check_claude: 不在時 die + npm install" ;;
    *) record 1 "check_claude: 不在時のメッセージが不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_claude: exit code 1" || record 1 "check_claude: exit code ${exit_code}"

# Test 19: check_model — 正常系
echo "--- Test 19: check_model 正常系 ---"
model_dir=$(mktemp -d)
touch "$model_dir/config.json"
result=$( (source "$COMMON_SH" && check_model "$model_dir") 2>&1)
rm -rf "$model_dir"
case "$result" in
    *"モデル: OK"*) record 0 "check_model: モデル存在時 OK" ;;
    *) record 1 "check_model: モデル存在時の出力不正 (got: $result)" ;;
esac

# Test 20: check_model — ディレクトリ不在
echo "--- Test 20: check_model ディレクトリ不在 ---"
exit_code=0
result=$( (source "$COMMON_SH" && check_model "/tmp/nonexistent_model_dir_$$") 2>&1) || exit_code=$?
case "$result" in
    *"モデルファイルが見つかりません"*) record 0 "check_model: ディレクトリ不在時 warn" ;;
    *) record 1 "check_model: ディレクトリ不在時の出力不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_model: return 1" || record 1 "check_model: return ${exit_code}（期待: 1）"

# Test 21: check_model — config.json 不在
echo "--- Test 21: check_model config.json 不在 ---"
empty_dir=$(mktemp -d)
exit_code=0
result=$( (source "$COMMON_SH" && check_model "$empty_dir") 2>&1) || exit_code=$?
rm -rf "$empty_dir"
case "$result" in
    *"モデルファイルが見つかりません"*) record 0 "check_model: 空ディレクトリ時 warn" ;;
    *) record 1 "check_model: 空ディレクトリ時の出力不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_model: 空ディレクトリ return 1" || record 1 "check_model: 空ディレクトリ return ${exit_code}（期待: 1）"

# Test 22: check_all — 全通過（全関数をモックで正常化）
echo "--- Test 22: check_all 全通過 ---"
mock_pass=$(mktemp -d)

# brew, python3.12, git, uv, node, claude をモック
for cmd in brew python3.12 git uv node claude; do
    cat > "$mock_pass/$cmd" <<'EOF'
#!/bin/sh
echo "mock version 1.0"
EOF
    chmod +x "$mock_pass/$cmd"
done

exit_code=0
result=$( (PATH="$mock_pass:$PATH"; source "$COMMON_SH" && check_all) 2>&1) || exit_code=$?
rm -rf "$mock_pass"
case "$result" in
    *"全前提条件を満たしています"*) record 0 "check_all: 全通過時 OK" ;;
    *) record 1 "check_all: 全通過時の出力不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 0 ] && record 0 "check_all: return 0" || record 1 "check_all: return ${exit_code}（期待: 0）"

# Test 23: check_all — 一部不足（brew を不在に）
echo "--- Test 23: check_all 一部不足 ---"
mock_fail=$(mktemp -d)

# check_all が使用する全コマンドをモック（brew のみ不在）
# uname + sysctl は check_apple_silicon 用
cat > "$mock_fail/uname" <<'EOF'
#!/bin/sh
echo "arm64"
EOF
cat > "$mock_fail/sysctl" <<'EOF'
#!/bin/sh
echo "1"
EOF
for cmd in python3.12 git uv node claude; do
    cat > "$mock_fail/$cmd" <<'EOF'
#!/bin/sh
echo "mock version 1.0"
EOF
    chmod +x "$mock_fail/$cmd"
done
chmod +x "$mock_fail/uname" "$mock_fail/sysctl"

# PATH を mock ディレクトリのみに設定（オリジナル PATH を含めない）
# これにより brew は不在扱いとなり、check_brew が die する
exit_code=0
result=$( (PATH="$mock_fail"; source "$COMMON_SH" && check_all) 2>&1) || exit_code=$?
rm -rf "$mock_fail"
case "$result" in
    *"前提条件を満たしていません"*) record 0 "check_all: 不足時 error" ;;
    *) record 1 "check_all: 不足時の出力不正 (got: $result)" ;;
esac
[ "$exit_code" -eq 1 ] && record 0 "check_all: 不足時 return 1" || record 1 "check_all: 不足時 return ${exit_code}（期待: 1）"

# Test 24: 6関数すべてが定義済みであること
echo "--- Test 24: 関数定義確認 ---"
(source "$COMMON_SH" && \
    command -v check_apple_silicon && \
    command -v check_brew && \
    command -v check_tool && \
    command -v check_claude && \
    command -v check_model && \
    command -v check_all) > /dev/null 2>&1
record $? "6関数がすべて定義済み"

# Test 25: check_tool 空文字列表示名（クラッシュしない）
echo "--- Test 25: check_tool 空文字列表示名 ---"
result=$( (source "$COMMON_SH" && check_tool "" "echo") 2>&1)
case "$result" in
    *": OK"*) record 0 "check_tool: 空表示名でもクラッシュしない" ;;
    *) record 1 "check_tool: 空表示名でエラー (got: $result)" ;;
esac

echo ""
echo "=== 結果: $PASS/$TOTAL passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
