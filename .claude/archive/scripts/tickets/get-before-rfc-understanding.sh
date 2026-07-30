#!/usr/bin/env bash
# get-before-rfc-understanding.sh
# Retrieve the rfcUnderstanding field from the previous OMISSIONS-XXX.json.
# Output (stdout): field value (empty string means no previous data)
# Exit code: 0=success, 1=failure or no previous data
#
# Usage: PURPOSE=$(./get-before-rfc-understanding.sh "$RFC_DIR" "purpose")

set -o nounset; set -o errexit
cd "$(dirname "$0")"

RFC_DIR="${1:-}"; FIELD="${2:-}"
if [ -z "$RFC_DIR" ] || [ -z "$FIELD" ]; then echo ""; exit 1; fi

RESULT=$(node get-before-rfc-understanding.js "$RFC_DIR" "$FIELD" 2>/dev/null) || true
HAS=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).hasPrevious))" 2>/dev/null) || true

if [ "$HAS" != "true" ]; then echo ""; exit 1; fi

VALUE=$(echo "$RESULT" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).fields['$FIELD']))" 2>/dev/null) || true
echo "$VALUE"; exit 0
