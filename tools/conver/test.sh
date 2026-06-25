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

echo ""; echo "======== OMISSIONS スクリプトテスト ========"; echo ""

OMD="$TMPDIR/om"
mkdir -p "$OMD"
OS=".claude/scripts/tickets"; OVL=".claude/scripts/lib/validate-omissions.js"

echo "[O1] next-omissions-number (empty dir)"
R="$(node "$OS/next-omissions-number.js" "$OMD" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.nextNumber" "1"

echo "[O2] next-omissions-number (with existing)"
echo '{}' > "$OMD/OMISSIONS-001.json"
echo '{}' > "$OMD/OMISSIONS-003.json"
R="$(node "$OS/next-omissions-number.js" "$OMD" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.nextNumber" "4"

echo "[O3] next-omissions-number (nonexistent dir)"
R="$(node "$OS/next-omissions-number.js" "$OMD/nope" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[O4] validate-omissions (valid file)"
echo '{"parentRfcPath":"rfc.md","generatedAt":"2026-06-25","omissions":[{"id":"O-001","type":"bug","description":"test"}]}' > "$OMD/valid.json"
R="$(node "$OVL" "$OMD/valid.json" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[O5] validate-omissions (stdin valid)"
R="$(echo '{"parentRfcPath":"rfc.md","generatedAt":"2026-06-25","omissions":[{"id":"O-001","type":"bug","description":"test"}]}' | node "$OVL" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[O6] validate-omissions (missing parentRfcPath)"
R="$(echo '{"generatedAt":"2026-06-25","omissions":[]}' | node "$OVL" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[O7] validate-omissions (invalid type)"
R="$(echo '{"parentRfcPath":"rfc.md","generatedAt":"2026-06-25","omissions":[{"id":"O-001","type":"invalid","description":"test"}]}' | node "$OVL" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[O8] validate-omissions (invalid ID format)"
R="$(echo '{"parentRfcPath":"rfc.md","generatedAt":"2026-06-25","omissions":[{"id":"O-01","type":"bug","description":"test"}]}' | node "$OVL" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[O9] list-omissions (display)"
R="$(node "$OS/list-omissions.js" "$OMD/valid.json" 2>&1)" || true
echo "$R" | grep -q "O-001" && pass "O-001 displayed" || fail "O-001 not displayed"
echo "$R" | grep -q "bug" && pass "type 'bug' displayed" || fail "type 'bug' not displayed"

echo ""; echo "======== PX-2 新スクリプトテスト ========"; echo ""

NMD="$TMPDIR/om2"
mkdir -p "$NMD"
echo "# Test RFC Title" > "$NMD/rfc.md"

echo "[N1] create-omissions (skeleton)"
R="$(node "$OS/create-omissions.js" "$NMD/rfc.md" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.nextNumber" "1"
OMPATH=$(echo "$R" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).omissionsFilePath))")

echo "[N2] validate-omissions with rfcUnderstanding+steps"
R="$(node "$OVL" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[N3] add-omissions-meta"
R="$(echo '{"summary":"Test summary"}' | node "$OS/add-omissions-meta.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.written.length" "1"

echo "[N4] add-omissions-rfc-goal"
R="$(echo '{"purpose":"Test purpose","goals":"Test goals","successCriteria":"done","nonScope":"none"}' | node "$OS/add-omissions-rfc-goal.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.written.length" "4"

echo "[N5] add-omissions-rfc-architecture"
R="$(echo '{"architecture":"test arch","componentRelations":"rel","designDecisions":"dec"}' | node "$OS/add-omissions-rfc-architecture.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[N6] add-omissions-rfc-detail-1"
R="$(echo '{"typeDefinitions":"types","apiSignatures":"apis","dependencyGraph":"deps","externalDependencies":"ext"}' | node "$OS/add-omissions-rfc-detail-1.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[N7] add-omissions-rfc-detail-2"
R="$(echo '{"testRequirements":"tests","errorHandling":"errors","configuration":"config"}' | node "$OS/add-omissions-rfc-detail-2.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[N8] show-omissions-rfc-understanding"
R="$(node "$OS/show-omissions-rfc-understanding.js" "$OMPATH" 2>&1)" || true
echo "$R" | grep -q "目的" && pass "purpose label shown" || fail "purpose label missing"
echo "$R" | grep -q "Test purpose" && pass "purpose content shown" || fail "purpose content missing"

echo "[N9] show-omissions-steps"
R="$(node "$OS/show-omissions-steps.js" "$OMPATH" 2>&1)" || true
echo "$R" | grep -q "2a-1" && pass "step 2a-1 shown" || fail "step 2a-1 missing"
echo "$R" | grep -q '\[x\]' && pass "done step shown" || fail "done step missing"

echo "[N10] update-omissions-step"
R="$(node "$OS/update-omissions-step.js" "$OMPATH" "2a-1" "done" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.status" "done"
R="$(node "$OS/update-omissions-step.js" "$OMPATH" "nonexistent" "done" 2>&1 || true)"
assert_json_field "$R" "d.success" "false"

echo "[N11] add-omission"
R="$(echo '{"type":"bug","description":"found a bug","severity":"high","rfcSection":"§3","affectedFiles":["src/lib.rs"]}' | node "$OS/add-omission.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.omissionId" "O-001"
R="$(echo '{"type":"missing_implementation","description":"missing trait","affectedFiles":["src/main.rs"]}' | node "$OS/add-omission.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.omissionId" "O-002"

echo "[N12] validate-omissions (after all updates)"
R="$(node "$OVL" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"

echo "[N13] convert-omissions-to-markdown"
R="$(node "$OS/convert-omissions-to-markdown.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
MDPATH=$(echo "$R" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).mdFilePath))")
[ -f "$MDPATH" ] && pass ".md file created" || fail ".md file not created"
head -1 "$MDPATH" | grep -q "OMISSIONS" && pass "md header OK" || fail "md header missing"

BMD="$TMPDIR/om3"
mkdir -p "$BMD"

echo "[N14] get-before-rfc-understanding (empty dir)"
R="$(node "$OS/get-before-rfc-understanding.js" "$BMD" "purpose" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.hasPrevious" "false"

echo "[N15] get-before-rfc-understanding (only one file → no prev)"
echo '{"parentRfcPath":"r.md","generatedAt":"2026-06-25","rfcUnderstanding":{"purpose":"test","goals":"g"},"omissions":[]}' > "$BMD/OMISSIONS-001.json"
R="$(node "$OS/get-before-rfc-understanding.js" "$BMD" "purpose" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.hasPrevious" "false"

echo "[N16] get-before-rfc-understanding (two files → has prev)"
# OMISSIONS-002 が最新（空スケルトン相当）。prev = OMISSIONS-001（purpose="test"）を返すべき
echo '{}' > "$BMD/OMISSIONS-002.json"
R="$(node "$OS/get-before-rfc-understanding.js" "$BMD" "purpose" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
assert_json_field "$R" "d.hasPrevious" "true"
echo "$R" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);if(r.fields.purpose==='test')process.exit(0);process.exit(1)})" && pass "got prev purpose='test'" || fail "wrong prev value"
R="$(node "$OS/convert-omissions-to-markdown.js" "$OMPATH" 2>&1)" || true
assert_json_field "$R" "d.success" "true"
MDPATH=$(echo "$R" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).mdFilePath))")
[ -f "$MDPATH" ] && pass ".md file created" || fail ".md file not created"
head -1 "$MDPATH" | grep -q "OMISSIONS" && pass "md header OK" || fail "md header missing"

echo ""; echo "=========="
[ "$FAILED" = "1" ] && echo "❌ FAILED" || echo "✅ ALL PASS"
echo "=========="; echo ""
cleanup; exit "$FAILED"
