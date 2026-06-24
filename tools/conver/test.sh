#!/usr/bin/env bash
set -o nounset; set -o errexit
cd "$(dirname "$0")"; TMPDIR=""; FAILED=0
pass() { echo "  ✅ $1"; }; fail() { echo "  ❌ $1"; FAILED=1; }
assert_json_field() { local j="$1" f="$2" e="$3"
  local a; a="$(echo "$j" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log($f);" 2>/dev/null)" || { fail "$f: extract fail"; return; }
  [ "$a" = "$e" ] && pass "$f = \"$e\"" || fail "$f: expected \"$e\", got \"$a\""
}
cleanup() { [ -n "$TMPDIR" ] && [ -d "$TMPDIR" ] && rm -rf "$TMPDIR" && echo "  🧹 cleanup"; }

echo ""; echo "======== CRUD テスト ========"; echo ""
TMPDIR="$(mktemp -d /tmp/tt-XXXXXX)"
TJ="$TMPDIR/T.json"
cat > "$TJ" <<EOF
{"title":"Test","metadata":{"source":"r.md","generatedAt":"2026-06-24","analyzedSections":"§1"},"phases":[]}
EOF
echo "  📄 $TJ"

S=".claude/scripts/tickets"; V=".claude/scripts/lib/validate-tickets.js"

echo "[1] validate (empty skeleton)"
R="$(node "$V" "$TJ" 2>&1)" || true; assert_json_field "$R" "d.success" "true"

echo "[2] add-phase x2"
R="$(echo '{"name":"Phase 0: Logic","externalDependencies":"なし"}' | node "$S/add-phase.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.phaseId" "0"
R="$(echo '{"name":"Phase 1: Async","externalDependencies":"tokio"}' | node "$S/add-phase.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.phaseId" "1"

echo "[3] add-ticket x2"
R="$(echo '{"title":"Type Defs","scope":["struct"],"testVerification":["t1"]}' | node "$S/add-ticket.js" "$TJ" "Phase 0" 2>&1)" || true
assert_json_field "$R" "d.ticketKey" "P0-1"
R="$(echo '{"title":"Error Types","scope":["enum"],"testVerification":["t2"]}' | node "$S/add-ticket.js" "$TJ" "Phase 0" 2>&1)" || true
assert_json_field "$R" "d.ticketKey" "P0-2"

echo "[4] bulk-add-tickets"
R="$(echo '[{"phaseName":"Phase 0: Logic","tickets":[{"title":"State","scope":["s"]},{"title":"DAG","scope":["d"]}]},{"phaseName":"Phase 1: Async","tickets":[{"title":"Runner","scope":["r"]}]}]' | node "$S/bulk-add-tickets.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.added" "3"

echo "[5] get-ticket"
R="$(node "$S/get-ticket.js" "$TJ" "P0-1" 2>&1)" || true
assert_json_field "$R" "d.ticket.title" "Type Defs"
assert_json_field "$R" "d.ticket.id" "1"
assert_json_field "$R" "d.ticket.phaseId" "0"
R="$(node "$S/get-ticket.js" "$TJ" "P999-1" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[6] search-tickets"
R="$(node "$S/search-tickets.js" "$TJ" "Error" 2>&1)" || true
assert_json_field "$R" "d.count" "1"
R="$(node "$S/search-tickets.js" "$TJ" "Nope" 2>&1)" || true
assert_json_field "$R" "d.count" "0"

echo "[7] all-tickets"
R="$(node "$S/all-tickets.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.count" "5"

echo "[8] update-ticket"
R="$(echo '{"status":"done"}' | node "$S/update-ticket.js" "$TJ" "P0-1" 2>&1)" || true
assert_json_field "$R" "d.updated.status" "done"
R="$(node "$S/get-ticket.js" "$TJ" "P0-1" 2>&1)" || true
assert_json_field "$R" "d.ticket.status" "done"

echo "[8b] update-ticket with startedAt/completedAt"
R="$(echo '{"startedAt":"2026-06-01","notes":"実装開始"}' | node "$S/update-ticket.js" "$TJ" "P0-2" 2>&1)" || true
assert_json_field "$R" "d.updated.startedAt" "2026-06-01"
R="$(node "$S/get-ticket.js" "$TJ" "P0-2" 2>&1)" || true
assert_json_field "$R" "d.ticket.startedAt" "2026-06-01"
R="$(echo '{"completedAt":"2026-06-10","status":"reviewed"}' | node "$S/update-ticket.js" "$TJ" "P0-2" 2>&1)" || true
assert_json_field "$R" "d.updated.completedAt" "2026-06-10"
R="$(node "$S/get-ticket.js" "$TJ" "P0-2" 2>&1)" || true
assert_json_field "$R" "d.ticket.completedAt" "2026-06-10"
assert_json_field "$R" "d.ticket.status" "reviewed"

echo "[9] bulk-update-tickets"
R="$(echo '[{"id":"P0-2","updates":{"status":"done"}},{"id":"P0-3","updates":{"status":"reviewed"}}]' | node "$S/bulk-update-tickets.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.updated" "2"
R="$(node "$S/get-ticket.js" "$TJ" "P0-3" 2>&1)" || true
assert_json_field "$R" "d.ticket.status" "reviewed"

echo "[10] delete-ticket"
R="$(node "$S/delete-ticket.js" "$TJ" "P0-4" 2>&1)" || true
assert_json_field "$R" "d.deleted" "true"
R="$(node "$S/delete-ticket.js" "$TJ" "P0-4" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[11] bulk-delete-tickets"
R="$(echo '["P0-1","P0-2","P1-1"]' | node "$S/bulk-delete-tickets.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.deleted" "3"

echo "[12] list-phases-and-tickets"
R="$(node "$S/list-phases-and-tickets.js" "$TJ" 2>&1)" || true
echo "$R" | grep -q "P0:" && pass "P0: shown" || fail "P0 missing"
echo "$R" | grep -q "P0-3" && pass "P0-3 shown" || fail "P0-3 missing"
echo "$R" | grep -q '\[x\]' && pass "[x] shown" || fail "[x] missing"

echo "[14] write-tickets-json-template"
TMP2="$TMPDIR/out"
R="$(node "$S/write-tickets-json-template.js" "$TMP2" '{"title":"NewProj","source":"doc.md","generatedAt":"2026-06-24","analyzedSections":"§1"}' 2>&1)" || true
assert_json_field "$R" "d.success" "true"
R="$(node "$V" "$TMP2" 2>&1 || true)"
assert_json_field "$R" "d.valid" "true"

echo "[15] add-px-phase (create)"
R="$(node "$S/add-px-phase.js" "$TJ" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.phaseId" "-1"

echo "[16] add-px-phase (duplicate prevention)"
R="$(node "$S/add-px-phase.js" "$TJ" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[17] add-ticket to PX phase"
R="$(echo '{"title":"PX Ticket","scope":["adhoc"]}' | node "$S/add-ticket.js" "$TJ" "PX" 2>&1)" || true
assert_json_field "$R" "d.ticketKey" "PX-1"

echo "[18] get-ticket with PX-1"
R="$(node "$S/get-ticket.js" "$TJ" "PX-1" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.ticket.phaseId" "-1"

echo "[19] get-ticket-as-markdown (P0-3)"
R="$(node "$S/get-ticket-as-markdown.js" "$TJ" "P0-3" 2>&1)" || true
echo "$R" | grep -q "Ticket: P0-3" && pass "header: Ticket: P0-3" || fail "missing header"
echo "$R" | grep -q "\*\*Phase:\*\*" && pass "Phase field shown" || fail "missing Phase field"
echo "$R" | grep -q "\*\*Status:\*\*.*reviewed" && pass "status: reviewed" || fail "missing status"
echo "$R" | grep -q "### title" && pass "title section shown" || fail "missing title section"

echo "[19b] get-ticket-as-markdown (PX-1)"
R="$(node "$S/get-ticket-as-markdown.js" "$TJ" "PX-1" 2>&1)" || true
echo "$R" | grep -q "Ticket: PX-1" && pass "header: Ticket: PX-1" || fail "missing header"
echo "$R" | grep -q "PX Ticket" && pass "title: PX Ticket" || fail "missing title"

echo "[19c] get-ticket-as-markdown (not found)"
R="$(node "$S/get-ticket-as-markdown.js" "$TJ" "P999-1" 2>&1 || true)"
echo "$R" | grep -q "Error" && pass "error on not found" || fail "missing error on not found"

echo "[19d] get-ticket-as-markdown (invalid key)"
R="$(node "$S/get-ticket-as-markdown.js" "$TJ" "abc" 2>&1 || true)"
echo "$R" | grep -q "Error" && pass "error on invalid key" || fail "missing error on invalid key"

echo "[20] all-tickets shows PX-1"
R="$(node "$S/all-tickets.js" "$TJ" 2>&1)" || true
echo "$R" | grep -q '"PX-1"' && pass "PX-1 in all-tickets" || fail "PX-1 missing from all-tickets"

echo "[20] list-phases-and-tickets shows PX"
R="$(node "$S/list-phases-and-tickets.js" "$TJ" 2>&1)" || true
echo "$R" | grep -q "PX:" && pass "PX: in list" || fail "PX: missing from list"

echo "[13] validate (invalid: bad phaseId)"
echo '{"title":"T","metadata":{"source":"r","generatedAt":"2026-01-01"},"phases":[{"id":0,"name":"P0","tickets":[{"id":1,"phaseId":1,"title":"X","status":"todo"}]}]}' > "$TMPDIR/bad.json"
R="$(node "$V" "$TMPDIR/bad.json" 2>&1 || true)"
echo "$R" | grep -q "phaseId.*does not match" && pass "phaseId mismatch detected" || fail "phaseId mismatch not detected"

echo ""; echo "=========="
[ "$FAILED" = "1" ] && echo "❌ FAILED" || echo "✅ ALL PASS"
echo "=========="; echo ""
cleanup; exit "$FAILED"
