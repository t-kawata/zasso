#!/usr/bin/env node
// [::TICKET::] PX-120: preflight-stub-cleanup — tests for the 4-class classification.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-120 --for-spec --no-implementation-order`.

/**
 * preflight-stub-cleanup.test.js — RED tests for preflight-stub-cleanup.js
 *
 * @verifies C003 (stub plus Tickets.json to class)
 * @verifies C001 (resolvedCandidates [ACTION] both branches)
 * @verifies C002 (NOT-resolved branch names create-resolving-ticket.js)
 * @verifies C004 (test asserts the message)
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
// [::TICKET::] PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-126|PX-127) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ ' + message);
  }
}

// RED: the module does not exist yet — requiring it must fail the suite.
let p;
try {
  p = require('../preflight-stub-cleanup.js');
} catch (e) {
  console.error('[RED] preflight-stub-cleanup.js not implemented:', e.code);
  process.exit(1);
}

const { classifyStubs, CLASS_NAMES } = p;

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function stub(key, content) {
  const c = content || '// [::STUB::] ' + (key || 'MUST RESOLVE') + ': placeholder -- Implement real logic';
  return { file: 'src/sample.js', line: 1, content: c, key };
}

const CLASSES = ['resolvedCandidates', 'pendingObligations', 'orphans', 'excuses'];

console.log('\n━━━ preflight-stub-cleanup.test.js — TESTS ━━━\n');

// ============================================================
// C003 — 4-class classification
// ============================================================
console.log('## C003 — exactly-one classification\n');

(function testC003ExactlyOneClass() {
  console.log('  ── each stub lands in exactly one class');
  const tickets = fixtureTickets({
    'P4-2': { status: 'reviewed' }, // completed key
    'P9-1': { status: 'todo' },     // active key
    'P9-2': { status: 'in_progress' }
  });
  const stubs = [
    stub('P4-2'),
    stub('P9-1'),
    stub('P9-99'),                                    // nonexistent key -> orphans
    stub('MUST RESOLVE', '// [::STUB::] MUST RESOLVE: needs cpal -- Add cpal dep'), // keyless -> orphans
    stub('P9-2', '// [::STUB::] P9-2: requires external headers -- ')              // excuse
  ];
  const classified = classifyStubs(stubs, tickets);
  for (const stub of stubs) {
    const hit = CLASSES.filter(c => (classified[c] || []).includes(stub));
    assert(hit.length === 1, 'each stub in exactly one class, got ' + hit.length + ' for ' + (stub.key || 'MUST RESOLVE'));
  }
  assert(CLASS_NAMES.length === 4, 'CLASS_NAMES exposes exactly 4 classes');
})();

(function testC003ClassContents() {
  console.log('  ── resolvedCandidates only completed keys; pendingObligations only active keys');
  const tickets = fixtureTickets({
    'P4-2': { status: 'reviewed' },
    'P9-1': { status: 'todo' }
  });
  const stubs = [stub('P4-2'), stub('P9-1')];
  const classified = classifyStubs(stubs, tickets);
  assert(classified.resolvedCandidates.length === 1, 'P4-2 (reviewed) is a resolvedCandidate');
  assert(classified.resolvedCandidates[0].key === 'P4-2', 'resolvedCandidate key is P4-2');
  assert(classified.pendingObligations.length === 1, 'P9-1 (todo) is a pendingObligation');
  assert(classified.pendingObligations[0].key === 'P9-1', 'pendingObligation key is P9-1');
})();

(function testC003ExcusePriority() {
  console.log('  ── an excuse-languaged stub is classified excuse regardless of key status');
  const tickets = fixtureTickets({ 'P9-2': { status: 'todo' } });
  const s = stub('P9-2', '// [::STUB::] P9-2: requires external headers -- ');
  const classified = classifyStubs([s], tickets);
  assert(classified.excuses.length === 1, 'excuse stub is in excuses');
  assert(classified.pendingObligations.length === 0, 'excuse stub is NOT in pendingObligations');
})();

(function testC003Orphans() {
  console.log('  ── nonexistent or keyless stubs are orphans');
  const tickets = fixtureTickets({});
  const stubs = [stub('P9-99'), stub('MUST RESOLVE', '// [::STUB::] MUST RESOLVE: need plan')];
  const classified = classifyStubs(stubs, tickets);
  assert(classified.orphans.length === 2, 'both are orphans');
})();

(function testC003Determinism() {
  console.log('  ── classification is deterministic');
  const tickets = fixtureTickets({ 'P4-2': { status: 'reviewed' }, 'P9-1': { status: 'todo' } });
  const stubs = [stub('P4-2'), stub('P9-1')];
  const a = classifyStubs(stubs, tickets);
  const b = classifyStubs(stubs, tickets);
  assert(JSON.stringify(a) === JSON.stringify(b), 'same input yields identical classification');
})();

// ============================================================
// PX-126: resolvedCandidates [ACTION] NOT-resolved branch
// ============================================================

(function testResolvedCandidatesActionMessage() {
  let msg;
  try {
    ({ RESOLVED_CANDIDATES_ACTION_MESSAGE: msg } = require('../preflight-stub-cleanup.js'));
  } catch (e) {
    assert(false, 'PX-126: RESOLVED_CANDIDATES_ACTION_MESSAGE export — ' + e.message);
    return;
  }
  assert(typeof msg === 'string', 'PX-126: message is exported as a string');
  assert(msg.includes('remove-stub.js'), 'PX-126: resolved branch names remove-stub.js');
  assert(msg.includes('create-resolving-ticket.js'), 'PX-126: NOT-resolved branch names create-resolving-ticket.js');
  assert(msg.includes('rewrite the marker key'), 'PX-126: NOT-resolved branch directs the marker-key rewrite');
  assert(!msg.includes('\n'), 'PX-126: message is a single self-contained line (Output message convention)');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
