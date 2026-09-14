#!/usr/bin/env node
// [::TICKET::] PX-143: forNextRound on generic-ticket-creation core. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-143 --for-spec --no-implementation-order`.

/**
 * generic-ticket-creation.test.js — Tests for the unified ticket-creation core.
 *
 * @verifies C003 (generic-ticket-creation.js)
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-143, PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-143|PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function ok(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-143, PX-144, PX-145, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-143|PX-144|PX-145|PX-146) --for-spec --no-implementation-order`.
function strictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ generic-ticket-creation.test.js ━━━\n');

const { createTickets } = require('../../lib/generic-ticket-creation.js');

const VALID_TICKETS = {
  title: 'Test RFC',
  round: 1,
  metadata: { source: 'RFC-test.md', generatedAt: '2026-08-07' },
  phases: [{
    id: 0,
    name: 'P0',
    tickets: [{ id: 1, phaseId: 0, title: 'Source ticket', status: 'reviewed' }],
  }],
};

// ======================================================================
// C003 — deferral seed sets forNextRound=true
// ======================================================================
(function testDeferralSeed() {
  const res = createTickets({
    ticketsData: VALID_TICKETS,
    seeds: [{ type: 'deferral', sourceKey: 'P0-1', seed: { title: 'Deferred work' } }],
  });
  ok(res.success, 'deferral seed succeeds');
  if (!res.success) return;
  strictEqual(res.created.length, 1, 'one ticket created');
  strictEqual(res.created[0].ticket.forNextRound, true, 'deferral-created ticket forNextRound=true');
})();

// ======================================================================
// C003 — crimeDeferral seed sets forNextRound=true
// ======================================================================
(function testCrimeDeferralSeed() {
  const res = createTickets({
    ticketsData: VALID_TICKETS,
    seeds: [{ type: 'crimeDeferral', sourceKey: 'P0-1', seed: { title: 'Crime deferred' } }],
  });
  ok(res.success, 'crimeDeferral seed succeeds');
  if (!res.success) return;
  strictEqual(res.created[0].ticket.forNextRound, true, 'crimeDeferral-created ticket forNextRound=true');
})();

// ======================================================================
// C003 — bulk seed sets forNextRound=true (bulkAddTickets itself untouched)
// ======================================================================
(function testBulkSeed() {
  const res = createTickets({
    ticketsData: VALID_TICKETS,
    seeds: [{ type: 'bulk', phaseId: 0, tickets: [{ title: 'Bulk item' }] }],
  });
  ok(res.success, 'bulk seed succeeds');
  if (!res.success) return;
  const maxPhase = res.data.phases.find(p => p.id === 0);
  const bulkTicket = maxPhase.tickets.find(t => t.title === 'Bulk item');
  ok(bulkTicket, 'bulk ticket present in Tickets.json data');
  if (bulkTicket) strictEqual(bulkTicket.forNextRound, true, 'bulk-created ticket forNextRound=true');
})();

// ======================================================================
// C003 — atomicity: any failing seed aborts with zero committed state
// ======================================================================
(function testAtomicity() {
  const res = createTickets({
    ticketsData: VALID_TICKETS,
    seeds: [
      { type: 'deferral', sourceKey: 'P0-1', seed: { title: 'Good' } },
      { type: 'deferral', sourceKey: 'P9-99', seed: { title: 'Bad' } },
    ],
  });
  strictEqual(res.success, false, 'createTickets fails when a seed fails');
  strictEqual(res.errors.length, 1, 'exactly one error recorded');
  ok(JSON.stringify(res.errors[0]).includes('P9-99'), 'error names the failing sourceKey');
})();

// ======================================================================
// C003 — duplicate file:line across resolving seeds rejected before creation
// ======================================================================
(function testDuplicateFileLine() {
  const res = createTickets({
    ticketsData: VALID_TICKETS,
    seeds: [
      { type: 'resolving', sourceKey: 'P0-1', stubs: [{ file: 'a.rs', line: 1 }] },
      { type: 'resolving', sourceKey: 'P0-1', stubs: [{ file: 'a.rs', line: 1 }] },
    ],
  });
  strictEqual(res.success, false, 'duplicate file:line rejected');
  ok((res.errors[0].error || '').includes('duplicate file:line'), 'error mentions duplicate file:line');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
