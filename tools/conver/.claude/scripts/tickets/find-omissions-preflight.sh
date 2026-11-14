#!/usr/bin/env bash
# find-omissions-preflight.sh — one-shot gate for /find-omissions.
#
# The command file calls this once with the raw $ARGUMENTS. The script owns the
# gate order, the resume decision and the reset timing, so the AI never
# re-derives that control flow from prose.
#
# Ordering is a safety property, not a preference: every read-only gate runs
# before the reset. A package blocked by a malformed graph or by an
# unconsolidated stub tree keeps the omissions its interrupted run recorded.
#
# Exit codes:
#   0 — continue. MODE: CLEAN or MODE: RESUME says which procedure follows.
#   2 — stop. Every gate that failed has already printed its reason.
#
# The exit code is 0 for both continue modes on purpose: a caller that copies
# `... || exit 2` must never turn a resume into a block.
#
# [::TICKET::] P27-3 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-3 --for-spec --no-implementation-order`.
set -uo pipefail

# Resolve the gates from this script's own location so the wrapper works from
# any package directory and never trusts an externally supplied CLAUDE_DIR.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAPH_ARGUMENT="${1-}"

print_gate() {
  local position="$1"
  local name="$2"
  local verdict="$3"
  printf '[%s] %-26s %s\n' "$position" "$name" "$verdict"
}

print_detail() {
  printf '%s\n' "$1" | sed 's/^/    /'
}

stop() {
  printf 'VERDICT: STOP — fix the named problem above.\n'
  exit 2
}

printf '== find-omissions pre-flight ==\n'

# Gate 1 — graph argument. Read-only. The validator reads the first non-empty
# line, so a resume directive after a blank line is harmless.
GRAPH_OUTPUT="$(node "$SCRIPT_DIR/validate-graph-arg.js" "$GRAPH_ARGUMENT" 2>&1)"
GRAPH_STATUS=$?
if [ "$GRAPH_STATUS" -ne 0 ]; then
  print_gate "1/3" "graph argument" "FAIL"
  print_detail "$GRAPH_OUTPUT"
  stop
fi
print_gate "1/3" "graph argument" "OK"

# Gate 2 — consolidated manifest. Read-only. Its zero-stub pass carries the
# "SKIP Step 1" instruction, which the summary must preserve.
MANIFEST_OUTPUT="$(node "$SCRIPT_DIR/require-consolidated-manifest.js" 2>&1)"
MANIFEST_STATUS=$?
if [ "$MANIFEST_STATUS" -ne 0 ]; then
  print_gate "2/3" "consolidated manifest" "FAIL"
  print_detail "$MANIFEST_OUTPUT"
  stop
fi
if printf '%s' "$MANIFEST_OUTPUT" | grep -q 'SKIP Step 1'; then
  print_gate "2/3" "consolidated manifest" "PASS (0 stubs; SKIP Step 1)"
else
  print_gate "2/3" "consolidated manifest" "PASS (manifest present)"
fi

# Gate 3 — unfinished find. The first run is read-only and decides the mode.
DETECT_OUTPUT="$(node "$SCRIPT_DIR/detect-unfinished-find.js" --cwd=. --format=markdown 2>&1)"
DETECT_STATUS=$?
if [ "$DETECT_STATUS" -eq 20 ]; then
  print_gate "3/3" "unfinished find" "FAIL"
  print_detail "$DETECT_OUTPUT"
  stop
fi
if [ "$DETECT_STATUS" -eq 10 ]; then
  print_gate "3/3" "unfinished find" "UNFINISHED"
  print_detail "$DETECT_OUTPUT"
  RESET_OUTPUT="$(node "$SCRIPT_DIR/detect-unfinished-find.js" --cwd=. --format=markdown --reset 2>&1)"
  RESET_STATUS=$?
  if [ "$RESET_STATUS" -ne 10 ] && [ "$RESET_STATUS" -ne 0 ]; then
    print_detail "$RESET_OUTPUT"
    stop
  fi
  # The reset run repeats the evidence already printed above; keep only its
  # RESET line so the summary stays one result per gate.
  RESET_LINE="$(printf '%s\n' "$RESET_OUTPUT" | grep '^RESET:' || true)"
  if [ -n "$RESET_LINE" ]; then
    print_detail "$RESET_LINE"
  fi
  printf 'MODE: RESUME — continue from Step 2; do not ask the human.\n'
  printf 'VERDICT: CONTINUE\n'
  exit 0
fi
print_gate "3/3" "unfinished find" "CLEAN"
printf 'MODE: CLEAN — continue from Step 1.\n'
printf 'VERDICT: CONTINUE\n'
