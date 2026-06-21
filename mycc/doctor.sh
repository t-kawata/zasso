#!/usr/bin/env bash
# doctor.sh — 環境診断スクリプト
#
# mycc 環境の全前提条件を一項目ずつチェックし、不足があれば
# 具体的なインストール手順を表示する。一切の自動インストールは
# 行わない（Q12）。
#
# Usage:
#   ./doctor.sh
#
# 戻り値: 0=全前提条件充足, 1=不足あり（モデル不在は非終了）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

echo "=== mycc 環境診断 ==="
echo ""

# Step 1: Apple Silicon 確認（最優先、非対応アーキテクチャは即座に終了）
check_apple_silicon || exit 1
echo ""

# Step 2: Homebrew 確認（Homebrew は全ツールインストールの基盤）
check_brew || exit 1
echo ""

# Step 3: Python 3.12 確認（MTPLX の実行環境）
check_tool "Python 3.12" "python3.12" "--version" || exit 1
echo ""

# Step 4: Git 確認（Claude Code Proxy のクローンに必要）
check_tool "Git" "git" "--version" || exit 1
echo ""

# Step 5: uv 確認（Python 依存管理ツール）
check_tool "uv" "uv" "--version" || exit 1
echo ""

# Step 6: Node.js 確認（Claude Code の実行に必要）
check_tool "Node.js" "node" "--version" || exit 1
echo ""

# Step 7: Claude Code 確認（CLI エージェント）
check_claude || exit 1
echo ""

# Step 8: モデルファイル確認（任意：ダウンロードは setup.sh の責務）
MODEL_DIR="${MODEL_DIR:-$PROJECT_ROOT/models/Qwen3.6-27B-MTPLX-Optimized-Quality}"
check_model "$MODEL_DIR" || echo "  → setup.sh を実行してモデルをダウンロードしてください"
echo ""

echo "=== 診断完了 ==="
echo "環境は整っています。"
