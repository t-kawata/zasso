#!/bin/bash
# ============================================================
#  チケットキュー・specs・context をタイムスタンプ付きで
#  tickets/archive/ に退避（コピー）し、元の場所を空にする
# ============================================================
set -euo pipefail

# プロジェクトルートをスクリプト位置から解決する
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# アーカイブ先ディレクトリ（git 管理対象外とする）
ARCHIVE_DIR="$PROJECT_ROOT/tickets/archive/$TIMESTAMP"

echo "Archiving tickets to $ARCHIVE_DIR..."

# ----------------------------------------------------------
# 1. アーカイブディレクトリを作成する
# ----------------------------------------------------------
mkdir -p "$ARCHIVE_DIR/specs" "$ARCHIVE_DIR/context"

# ----------------------------------------------------------
# 2. queue.md をコピーする
# ----------------------------------------------------------
cp "$PROJECT_ROOT/tickets/queue.md" "$ARCHIVE_DIR/queue.md"

# ----------------------------------------------------------
# 3. specs/ 内の全ファイルを再帰コピーする
#    空ディレクトリの場合は ls の終了コードで判定しスキップ
# ----------------------------------------------------------
if ls "$PROJECT_ROOT/tickets/specs/"* >/dev/null 2>&1; then
    cp -r "$PROJECT_ROOT/tickets/specs/"* "$ARCHIVE_DIR/specs/"
fi

# ----------------------------------------------------------
# 4. context/ 内の全ディレクトリを再帰コピーする
# ----------------------------------------------------------
if ls "$PROJECT_ROOT/tickets/context/"* >/dev/null 2>&1; then
    cp -r "$PROJECT_ROOT/tickets/context/"* "$ARCHIVE_DIR/context/"
fi

# ----------------------------------------------------------
# 5. コピー元をクリアする
# ----------------------------------------------------------
# 5a. queue.md: ヘッダー行のみ残す
echo "# Ticket Queue" > "$PROJECT_ROOT/tickets/queue.md"

# 5b. specs/: 全ファイルを削除する
if ls "$PROJECT_ROOT/tickets/specs/"* >/dev/null 2>&1; then
    rm -f "$PROJECT_ROOT/tickets/specs/"*
fi

# 5c. context/: 全ディレクトリを削除する
if ls "$PROJECT_ROOT/tickets/context/"* >/dev/null 2>&1; then
    rm -rf "$PROJECT_ROOT/tickets/context/"*
fi

echo "Done. Archived to $ARCHIVE_DIR"
