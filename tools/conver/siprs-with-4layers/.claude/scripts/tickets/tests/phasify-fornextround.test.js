#!/usr/bin/env node
// [::TICKET::] PX-144: phasify merge clears forNextRound. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-144 --for-spec --no-implementation-order`.

/**
 * phasify-fornextround.test.js — Tests for the round-transition clearing.
 *
 * @verifies C001 (phasify-omissions.js merge + incrementRound)
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function ok(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function strictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ phasify-fornextround.test.js ━━━\n');

const { mergePhasifyToTickets, incrementRound } = require('../../rfc-graph/phasify-omissions.js');

const TICKETS_WITH_FLAG = {
  title: 'T',
  round: 1,
  metadata: { source: 'RFC-x.md', generatedAt: '2026-08-07' },
  phases: [
    { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'existing', status: 'todo', forNextRound: true }] },
  ],
};

const PHASIFIED_WITH_FLAG = {
  title: 'T',
  metadata: {},
  phases: [
    { id: 1, name: 'P1', tickets: [{ id: 1, phaseId: 1, title: 'omission clone', status: 'todo', forNextRound: true }] },
  ],
};

// ======================================================================
// C001 — mergePhasifyToTickets clears forNextRound on ALL tickets
// ======================================================================
(function testMergeClearsAllTickets() {
  const res = mergePhasifyToTickets(TICKETS_WITH_FLAG, PHASIFIED_WITH_FLAG);
  ok(res.success, 'mergePhasifyToTickets succeeds');
  let flagged = 0;
  for (const phase of res.data.phases) {
    for (const t of phase.tickets || []) {
      if (t.forNextRound === true) flagged++;
    }
  }
  strictEqual(flagged, 0, 'no ticket has forNextRound===true after merge (existing + merged)');
})();

// ======================================================================
// C001 — merge appends phasified phases (existing behavior preserved)
// ======================================================================
(function testMergeAppendsPhases() {
  const res = mergePhasifyToTickets(TICKETS_WITH_FLAG, PHASIFIED_WITH_FLAG);
  strictEqual(res.data.phases.length, 2, 'phasified phase appended');
  ok(res.data.phases.some(p => p.id === 1), 'new phase present');
  ok(res.data.phases.find(p => p.id === 0).tickets.length === 1, 'existing phase untouched');
})();

// ======================================================================
// C001 — incrementRound advances round by 1 (default 1 -> 2)
// ======================================================================
(function testIncrementRound() {
  const withRound = incrementRound(TICKETS_WITH_FLAG);
  strictEqual(withRound.round, 2, 'round incremented from 1 to 2');

  const missingRound = incrementRound({ title: 'T', metadata: { source: 'x.md', generatedAt: '2026-08-07' }, phases: [] });
  strictEqual(missingRound.round, 2, 'missing round defaults to 1 then increments to 2');
})();

// ======================================================================
// C001 — clearing is idempotent
// ======================================================================
(function testClearingIdempotent() {
  const first = mergePhasifyToTickets(TICKETS_WITH_FLAG, PHASIFIED_WITH_FLAG);
  const second = mergePhasifyToTickets(first.data, { title: 'T', metadata: {}, phases: [] });
  ok(second.success, 'second merge on already-cleared data succeeds');
  let flagged = 0;
  for (const phase of second.data.phases) {
    for (const t of phase.tickets || []) {
      if (t.forNextRound === true) flagged++;
    }
  }
  strictEqual(flagged, 0, 'idempotent: no flags re-appear');
})();

// ======================================================================
// C001 — input immutability
// ======================================================================
(function testInputImmutability() {
  const before = JSON.stringify(TICKETS_WITH_FLAG);
  mergePhasifyToTickets(TICKETS_WITH_FLAG, PHASIFIED_WITH_FLAG);
  strictEqual(JSON.stringify(TICKETS_WITH_FLAG), before, 'input ticketsData not mutated');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
