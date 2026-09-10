#!/bin/bash
# ============================================================
#  Archive ticket queue, specs, and context with timestamp to
#  tickets/archive/ and clear the originals
# ============================================================
set -euo pipefail

# Resolve project root from script location
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Archive destination directory (excluded from git tracking)
ARCHIVE_DIR="$PROJECT_ROOT/tickets/archive/$TIMESTAMP"

echo "Archiving tickets to $ARCHIVE_DIR..."

# ----------------------------------------------------------
# 1. Create archive directories
# ----------------------------------------------------------
mkdir -p "$ARCHIVE_DIR/specs" "$ARCHIVE_DIR/context"

# ----------------------------------------------------------
# 2. Copy queue.md
# ----------------------------------------------------------
cp "$PROJECT_ROOT/tickets/queue.md" "$ARCHIVE_DIR/queue.md"

# ----------------------------------------------------------
# 3. Recursively copy all files in specs/
#    Skip if directory is empty (checked via ls exit code)
# ----------------------------------------------------------
if ls "$PROJECT_ROOT/tickets/specs/"* >/dev/null 2>&1; then
    cp -r "$PROJECT_ROOT/tickets/specs/"* "$ARCHIVE_DIR/specs/"
fi

# ----------------------------------------------------------
# 4. Recursively copy all directories in context/
# ----------------------------------------------------------
if ls "$PROJECT_ROOT/tickets/context/"* >/dev/null 2>&1; then
    cp -r "$PROJECT_ROOT/tickets/context/"* "$ARCHIVE_DIR/context/"
fi

# ----------------------------------------------------------
# 5. Clear source locations
# ----------------------------------------------------------
# 5a. queue.md: keep only the header line
echo "# Ticket Queue" > "$PROJECT_ROOT/tickets/queue.md"

# 5b. specs/: delete all files
if ls "$PROJECT_ROOT/tickets/specs/"* >/dev/null 2>&1; then
    rm -f "$PROJECT_ROOT/tickets/specs/"*
fi

# 5c. context/: delete all directories
if ls "$PROJECT_ROOT/tickets/context/"* >/dev/null 2>&1; then
    rm -rf "$PROJECT_ROOT/tickets/context/"*
fi

echo "Done. Archived to $ARCHIVE_DIR"
