#!/usr/bin/env node
// [::TICKET::] PX-120: validate-no-external-excuses — tests for the no-excuse validator.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-120 --for-spec --no-implementation-order`.

/**
 * validate-no-external-excuses.test.js — RED tests for validate-no-external-excuses.js
 *
 * @verifies C001 (marker-content to verdict)
 * @verifies C002 (marker-key to Tickets.json)
 */

const path = require('path');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ ' + message);
  }
}

// RED: the module does not exist yet — requiring it must fail the suite.
let v;
try {
  v = require('../validate-no-external-excuses.js');
} catch (e) {
  console.error('[RED] validate-no-external-excuses.js not implemented:', e.code);
  process.exit(1);
}

const { classifyVerdict, checkKeyValidity, EXCUSE_PATTERNS, WORK_ITEM_VERB_RE } = v;

// Fixture: build a Tickets.json-like structure with the correct phase per key
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
// [::TICKET::] PX-132 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-132 --for-spec --no-implementation-order`.
function fixtureTickets(map) {
  const byPhase = {};
  for (const key of Object.keys(map)) {
    const m = key.match(/^P(-?\d+|X)-(\d+)$/);
    const phaseId = m[1] === 'X' ? -1 : parseInt(m[1], 10);
    if (!byPhase[phaseId]) byPhase[phaseId] = [];
    byPhase[phaseId].push({ id: parseInt(m[2], 10), phaseId, status: map[key].status });
  }
  return {
    phases: Object.keys(byPhase).map(pid => ({
      id: parseInt(pid, 10),
      name: 'P' + pid,
      tickets: byPhase[pid]
    }))
  };
}

console.log('\n━━━ validate-no-external-excuses.test.js — TESTS ━━━\n');

// ============================================================
// C001 — marker-content to verdict (Check A + Check B recovery)
// ============================================================
console.log('## C001 — lexicon → verdict\n');

(function testC001TerminalExcuseFails() {
  console.log('  ── terminal excuse without work item fails');
  const tickets = fixtureTickets({ 'P4-2': { status: 'todo' } });
  const verdict = classifyVerdict('// [::STUB::] P4-2: requires external PJSIP headers -- ', tickets);
  assert(verdict.fail === true, 'terminal excuse without work item must FAIL');
  assert(verdict.checks.some(c => c.check === 'A' && c.passed === false), 'Check A must fail');
  assert(verdict.checks.some(c => c.action && c.action.length > 0), 'FAIL must carry an Action directive');
})();

(function testC001ActionableRecovers() {
  console.log('  ── excuse + actionable work item passes via Check B');
  const tickets = fixtureTickets({ 'P4-2': { status: 'todo' } });
  const actionable = '// [::STUB::] P4-2: requires external PJSIP headers -- Vendor and build PJSIP in build.rs';
  const verdict = classifyVerdict(actionable, tickets);
  assert(verdict.passed === true, 'actionable plan recovers Check A');
})();

(function testC001ExcusePatternsPresent() {
  console.log('  ── EXCUSE_PATTERNS covers the banned lexicon');
  for (const phrase of ['requires external', 'awaiting approval', 'deferred until', 'once the headers become available', 'cannot be implemented', 'waiting for the team']) {
    assert(EXCUSE_PATTERNS.some(re => re.test(phrase)), 'lexicon must match: ' + phrase);
  }
  assert(WORK_ITEM_VERB_RE.test('Implement codec enumeration'), 'work-item verb matches Implement');
  assert(WORK_ITEM_VERB_RE.test('Vendor and build PJSIP in build.rs'), 'work-item verb matches Vendor');
})();

// ============================================================
// C002 — marker-key to Tickets.json (Check C)
// ============================================================
console.log('\n## C002 — key validity\n');

(function testC002ActiveKeyPasses() {
  console.log('  ── active status passes');
  for (const status of ['todo', 'in_progress', 'planned', 'remanded']) {
    const tickets = fixtureTickets({ 'P9-1': { status } });
    assert(checkKeyValidity('P9-1', tickets).passed === true, 'status ' + status + ' must pass Check C');
  }
})();

(function testC002PastKeyFails() {
  console.log('  ── completed status fails');
  for (const status of ['reviewed', 'done', 'R1', 'R2']) {
    const tickets = fixtureTickets({ 'P4-2': { status } });
    assert(checkKeyValidity('P4-2', tickets).passed === false, 'status ' + status + ' must fail Check C');
  }
})();

(function testC002NonexistentAndKeylessFail() {
  console.log('  ── nonexistent and keyless fail');
  assert(checkKeyValidity('P9-99', fixtureTickets({})).passed === false, 'nonexistent key fails');
  assert(checkKeyValidity(null, fixtureTickets({})).passed === false, 'keyless MUST RESOLVE fails');
  assert(checkKeyValidity(undefined, fixtureTickets({})).passed === false, 'undefined key fails');
})();

(function testC002ForConsolidateAcceptsCompleted() {
  console.log('  ── --for-consolidate accepts completed keys, still rejects non-existent/keyless');
  for (const status of ['reviewed', 'done', 'R1', 'R2']) {
    const tickets = fixtureTickets({ 'P4-2': { status } });
    assert(checkKeyValidity('P4-2', tickets, true).passed === true, 'status ' + status + ' must pass Check C in consolidation mode');
  }
  assert(checkKeyValidity('P9-99', fixtureTickets({}), true).passed === false, 'nonexistent key still fails in consolidation mode');
  assert(checkKeyValidity(null, fixtureTickets({}), true).passed === false, 'keyless still fails in consolidation mode');
})();

(function testC002ClassifyVerdictForConsolidate() {
  console.log('  ── classifyVerdict with forConsolidate passes a completed-key marker with an executable plan');
  const tickets = fixtureTickets({ 'P4-2': { status: 'reviewed' } });
  const marker = '// [::STUB::] P4-2: codec deferred -- Implement pjsua codec enumeration';
  assert(classifyVerdict(marker, tickets).passed === false, 'normal mode: Check C fails for a completed key');
  assert(classifyVerdict(marker, tickets, true).passed === true, 'consolidation mode: same marker passes');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
