# shellcheck shell=sh
# common.sh — 色付き出力ヘルパー関数
#
# mycc プロジェクト全スクリプトから source される最小共通レイヤー。
# このファイルを直接実行せず、source 経由で読み込むこと。
#
# Usage:
#   source "$(dirname "$0")/common.sh"
#   info "Processing started"
#   warn "Disk usage is high"
#   error "Connection failed"
#   die "Fatal error"

set -euo pipefail

# ANSI カラーコード — 名前付き定数で管理し、マジックナンバーを排除する
COLOR_GREEN='\033[32m'
COLOR_YELLOW='\033[33m'
COLOR_RED='\033[31m'
COLOR_RESET='\033[0m'

# info — 情報メッセージを緑色で標準出力に表示する
# 引数: 表示するメッセージ（任意の個数、半角スペースで連結される）
info() {
    printf "${COLOR_GREEN}[INFO]${COLOR_RESET} %s\n" "$*"
}

# warn — 警告メッセージを黄色で標準出力に表示する
# 引数: 表示するメッセージ（任意の個数、半角スペースで連結される）
warn() {
    printf "${COLOR_YELLOW}[WARN]${COLOR_RESET} %s\n" "$*"
}

# error — エラーメッセージを赤色で標準出力に表示する
# 引数: 表示するメッセージ（任意の個数、半角スペースで連結される）
# 注: この関数自体は exit しない。終了が必要な場合は die() を使用する
error() {
    printf "${COLOR_RED}[ERROR]${COLOR_RESET} %s\n" "$*"
}

# die — エラーメッセージを表示し、終了コード 1 でプロセスを終了する
# error() を内部で呼び出すため、出力形式は error() と同一
# 引数: 表示するエラーメッセージ（任意の個数、半角スペースで連結される）
die() {
    error "$*"
    exit 1
}

# ============================================================
# 環境チェック関数群
# ============================================================
# 以下の6関数（check_apple_silicon / check_brew / check_tool /
# check_claude / check_model / check_all）は doctor.sh と
# setup.sh から source されて使用される。自動インストールは
# 一切行わず（Q12）、不足時は具体的な手順を表示する。

# check_apple_silicon — Apple Silicon ハードウェア確認
# uname -m は Rosetta でも arm64 を返すため、sysctl で
# ハードウェアレベルの arm64 対応を確認する（Q15）
check_apple_silicon() {
    local arch
    arch=$(uname -m)
    local hw_opt
    hw_opt=$(sysctl -n hw.optional.arm64 2>/dev/null) || hw_opt="0"
    if [ "$arch" != "arm64" ] || [ "$hw_opt" != "1" ]; then
        die "この環境は Apple Silicon ではありません（arch=${arch}, arm64_optional=${hw_opt}）。MTPLX は Apple Silicon (M シリーズ) でのみ動作します。"
    fi
    info "Apple Silicon: OK (${arch})"
}

# check_brew — Homebrew のインストール確認（Q4）
# 不在時はインストール手順を表示して die する
check_brew() {
    if ! command -v brew >/dev/null 2>&1; then
        die "Homebrew がインストールされていません。
  インストール手順:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
  インストール後、brew doctor で正常を確認してから再実行してください。"
    fi
    info "Homebrew: OK ($(brew --version | head -1))"
}

# check_tool — 汎用ツール確認（Q12）
# 第1引数: 表示名、第2引数: バイナリ名、第3引数（省略可）: バージョンフラグ
# 例: check_tool "Python 3.12" "python3.12" "--version"
check_tool() {
    local name="$1" binary="$2" flag="${3:---version}"
    if ! command -v "$binary" >/dev/null 2>&1; then
        die "$name がインストールされていません。
  インストール手順:
    brew install $name"
    fi
    local ver
    ver=$("$binary" $flag 2>&1 | head -1)
    info "$name: OK ($ver)"
}

# check_claude — Claude Code のインストール確認（Q14）
# 不在時は npm install -g の手順を表示して die する
check_claude() {
    if ! command -v claude >/dev/null 2>&1; then
        die "Claude Code がインストールされていません。
  インストール手順:
    npm install -g @anthropic-ai/claude-code"
    fi
    info "Claude Code: OK ($(claude --version 2>&1 | head -1))"
}

# check_model — モデルファイルの存在確認（非終了）
# モデルが存在しなくてもセットアップ自体は可能なため、
# die ではなく warn + return 1 で呼び出し元に復帰する（Q12 の例外）
check_model() {
    local model_dir="$1"
    if [ ! -d "$model_dir" ] || [ -z "$(ls -A "$model_dir" 2>/dev/null)" ]; then
        warn "モデルファイルが見つかりません: $model_dir
  setup.sh を実行してモデルをダウンロードしてください:
    ./setup.sh"
        return 1
    fi
    if [ ! -f "$model_dir/config.json" ]; then
        warn "モデルディレクトリは存在しますが config.json が見つかりません。ダウンロードが不完全な可能性があります。"
        return 1
    fi
    info "モデル: OK ($(basename "$model_dir"))"
}

# check_all — 全前提条件チェックを逐次実行
# 戻り値: 0=全通過, 1=一部不足
# failure 件数を集計し、全件実行後に結果を返す
check_all() {
    local failures=0

    # サブシェルで各チェックを実行し、die() による exit を捕捉する
    (check_apple_silicon) || { failures=$((failures + 1)); }
    (check_brew)          || { failures=$((failures + 1)); }
    (check_tool "Python 3.12" "python3.12" "--version") || { failures=$((failures + 1)); }
    (check_tool "Git" "git" "--version")                || { failures=$((failures + 1)); }
    (check_tool "uv" "uv" "--version")                  || { failures=$((failures + 1)); }
    (check_tool "Node.js" "node" "--version")           || { failures=$((failures + 1)); }
    (check_claude)                                       || { failures=$((failures + 1)); }

    if [ "$failures" -gt 0 ]; then
        error "前提条件を満たしていません（${failures} 件の不足）。上記の手順に従ってインストールしてから再実行してください。"
        return 1
    fi
    info "全前提条件を満たしています。"
}
