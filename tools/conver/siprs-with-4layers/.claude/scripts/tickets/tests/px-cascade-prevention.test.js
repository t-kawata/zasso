#!/usr/bin/env node
/**
 * px-cascade-prevention.test.js — System-level integration tests
 *
 * Verifies that the PX-90/PX-91/PX-93 fixes permanently prevent
 * the self-referential cascade that caused Tickets.json and
 * Malfeasance.json to grow to 496MB / 4.5MB.
 *
 * These tests run the ACTUAL scripts (not mocks) and verify
 * end-to-end behavior. They must pass before any pipeline
 * execution can be trusted to not cause regression.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../'); // tools/conver/
const TICKETS_PATH = path.join(PROJECT_ROOT, 'Tickets.json');
const SCAN_SCRIPT = path.join(PROJECT_ROOT, '.claude/scripts/tickets/scan-incomplete-implementations.js');
const ENUMERATE_SCRIPT = path.join(PROJECT_ROOT, '.claude/scripts/tickets/enumerate-ticket-targets.js');

// Helper: get a ticket's stub/crime arrays safely (handle verified_empty sentinel)
function getStubs(ticket) {
  return ticket.targetStubs === 'verified_empty' ? [] : (ticket.targetStubs || []);
}
function getCrimes(ticket) {
  return ticket.targetCrimes === 'verified_empty' ? [] : (ticket.targetCrimes || []);
}
function findTicket(data, key) {
  const m = key.match(/^PX-(\d+)$/);
  if (!m) return null;
  const targetId = parseInt(m[1]);
  for (const p of data.phases || []) {
    for (const t of p.tickets || []) {
      if (t.id === targetId && t.phaseId === -1) return t;
    }
  }
  return null;
}
function runEnumerate(ticketKey) {
  return spawnSync('node', [ENUMERATE_SCRIPT, '--dir=.', '--ticket-key=' + ticketKey, '--tickets=' + TICKETS_PATH], {
    cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 30000
  });
}
function parseScanOutput(stdout) {
  try { return JSON.parse(stdout); } catch (e) { return null; }
}

let passed = 0;
let failed = 0;
function assert(cond, msg) { if (cond) { passed++; process.stdout.write('  ✓ ' + msg + '\n'); } else { failed++; process.stdout.write('  ✗ ' + msg + '\n'); } }
function assertEq(a, e, m) { if (a === e) { passed++; process.stdout.write('  ✓ ' + m + '\n'); } else { failed++; process.stdout.write('  ✗ ' + m + ' — expected ' + JSON.stringify(e) + ', got ' + JSON.stringify(a) + '\n'); } }

console.log('\n━━━ PX CASCADE PREVENTION — SYSTEM INTEGRATION TESTS ━━━\n');

// ======================================================================
// 1. scan-incomplete-implementations: no self-referential findings
// ======================================================================

console.log('## 1. scan — no self-referential findings\n');

(function () {
  const proc = spawnSync('node', [SCAN_SCRIPT, '--dir=.'], { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 30000 });
  assert(proc.status === 0 || proc.status === 1, 'scan exits');
  const result = parseScanOutput(proc.stdout);
  assert(result !== null, 'scan produces valid JSON');
  if (!result) return;
  const inDataFiles = result.findings.filter(f =>
    f.file.includes('Tickets.json') || f.file.includes('Malfeasance.json')
  );
  assertEq(inDataFiles.length, 0, 'zero findings in Tickets.json/Malfeasance.json');
  assert(result.total >= 0, 'source findings reported (' + result.total + ' total)');
})();

// ======================================================================
// 2. enumerate: no stubs from data files
// ======================================================================

console.log('\n## 2. enumerate — no stubs from data files\n');

(function () {
  const proc = runEnumerate('PX-93');
  const ticketsData = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  const ticket = findTicket(ticketsData, 'PX-93');
  assert(ticket !== null, 'PX-93 ticket found');
  if (!ticket) return;

  const stubs = getStubs(ticket);
  const crimes = getCrimes(ticket);
  const fromDataFiles = (arr) => arr.filter(s => s.file && (s.file.includes('Tickets.json') || s.file.includes('Malfeasance.json')));
  assertEq(fromDataFiles(stubs).length, 0, 'no targetStubs from data files (' + stubs.length + ' stubs total)');
  assertEq(fromDataFiles(crimes).length, 0, 'no targetCrimes from data files (' + crimes.length + ' crimes total)');
})();

// ======================================================================
// 3. Double-enumerate idempotency
// ======================================================================

console.log('\n## 3. Idempotency — 2 runs identical\n');

(function () {
  runEnumerate('PX-93');
  const data1 = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  const t1 = findTicket(data1, 'PX-93');
  assert(t1 !== null, 'ticket found run 1');

  runEnumerate('PX-93');
  const data2 = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  const t2 = findTicket(data2, 'PX-93');
  assert(t2 !== null, 'ticket found run 2');

  const s1 = JSON.stringify(getStubs(t1));
  const s2 = JSON.stringify(getStubs(t2));
  const c1 = JSON.stringify(getCrimes(t1));
  const c2 = JSON.stringify(getCrimes(t2));

  assertEq(s1, s2, 'targetStubs byte-identical across 2 runs');
  assertEq(c1, c2, 'targetCrimes byte-identical across 2 runs');
})();

// ======================================================================
// 4. Triple-run stability
// ======================================================================

console.log('\n## 4. Triple-run stability\n');

(function () {
  runEnumerate('PX-93');
  const data1 = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  const t1 = findTicket(data1, 'PX-93');

  // 3rd run
  runEnumerate('PX-93');
  const data3 = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  const t3 = findTicket(data3, 'PX-93');

  assert(t1 !== null && t3 !== null, 'ticket found in both runs');
  if (!t1 || !t3) return;

  assertEq(JSON.stringify(getStubs(t1)), JSON.stringify(getStubs(t3)), '3rd run targetStubs same as 1st');
  assertEq(JSON.stringify(getCrimes(t1)), JSON.stringify(getCrimes(t3)), '3rd run targetCrimes same as 1st');
})();

// ======================================================================
// 5. Accumulation bounds check
// ======================================================================

console.log('\n## 5. Accumulation bound\n');

(function () {
  const data = JSON.parse(fs.readFileSync(TICKETS_PATH, 'utf8'));
  const ticket = findTicket(data, 'PX-93');
  assert(ticket !== null, 'PX-93 exists after 3 enumerates');
  if (!ticket) return;

  const stubs = getStubs(ticket);
  const crimes = getCrimes(ticket);
  // After PX-93 fix, only own-ticket STUBs are included. With a clean source tree
  // that has no [::STUB::] PX-93 markers, both should be 0 or small.
  assertEq(stubs.length, 0, 'targetStubs must be ZERO (cascade indicator)');
  assertEq(crimes.length, 0, 'targetCrimes must be ZERO (cascade indicator)');
})();

// ======================================================================
// Summary
// ======================================================================

const total = passed + failed;
console.log('\n━━━ RESULTS ━━━');
console.log('  Passed: ' + passed + ' / ' + total);
console.log('  Failed: ' + failed + ' / ' + total);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✅ CASCADE PREVENTION: ALL SYSTEM-LEVEL TESTS PASSED.\n');
  process.exit(0);
}
