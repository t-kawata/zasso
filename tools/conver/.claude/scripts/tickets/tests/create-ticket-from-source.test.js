#!/usr/bin/env node
// [::TICKET::] PX-143: forNextRound on create-ticket-from-source core. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-143 --for-spec --no-implementation-order`.

/**
 * create-ticket-from-source.test.js — Tests for the deep-clone ticket creation core.
 *
 * @verifies C002 (create-ticket-from-source.js)
 */

const assert = require('assert');

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

console.log('\n━━━ create-ticket-from-source.test.js ━━━\n');

const mod = require('../../lib/create-ticket-from-source.js');
const { createTicketFromSource, stripCompletedResidue, PRESERVE_FIELDS, STRIP_ON_CLONE } = mod;
const { validateTickets } = require('../../lib/validate-tickets.js');

const VALID_TICKETS = {
  title: 'Test RFC',
  round: 1,
  metadata: { source: 'RFC-test.md', generatedAt: '2026-08-07' },
  phases: [{
    id: 0,
    name: 'P0',
    tickets: [{
      id: 1, phaseId: 0, title: 'Source ticket', status: 'reviewed',
      completedAt: '2026-08-01', startedAt: '2026-07-01',
      nodeIds: ['N1'], relatedTicketIds: 'P1-2', referenceSection: 'Sec 3',
      referenceUrls: ['https://example.com'], sourcePaths: ['src/a.rs'], rfcDiscrepancies: ['diff'],
    }],
  }],
};

// ======================================================================
// C002 — stripCompletedResidue
// ======================================================================
(function testStripCompletedResidue() {
  const stripped = stripCompletedResidue({
    status: 'reviewed', completedAt: '2026-08-01', startedAt: '2026-07-01', title: 'x',
  });
  strictEqual(stripped.status, 'todo', 'stripCompletedResidue forces status todo');
  strictEqual(stripped.forNextRound, true, 'stripCompletedResidue sets forNextRound=true');
  strictEqual(stripped.completedAt, undefined, 'stripCompletedResidue removes completedAt');
  strictEqual(stripped.startedAt, undefined, 'stripCompletedResidue removes startedAt');
  ok(!('completedAt' in stripped), 'completedAt key deleted');
  ok(!('startedAt' in stripped), 'startedAt key deleted');
})();

// ======================================================================
// C002 — createTicketFromSource postconditions
// ======================================================================
(function testCreateTicketFromSource() {
  const res = createTicketFromSource({
    ticketsData: VALID_TICKETS,
    sourceKey: 'P0-1',
    seed: { title: 'New work item' },
  });
  ok(res.success, 'createTicketFromSource succeeds with valid inputs');
  if (!res.success) return;
  strictEqual(res.ticket.status, 'todo', 'new ticket status is todo');
  strictEqual(res.ticket.forNextRound, true, 'new ticket carries forNextRound=true');
  strictEqual(res.ticket.title, 'New work item', 'new ticket title from seed');
  // PRESERVE set retained with zero loss (deep compare to handle array fields)
  for (const field of PRESERVE_FIELDS) {
    const expected = VALID_TICKETS.phases[0].tickets[0][field];
    strictEqual(
      JSON.stringify(res.ticket[field]),
      JSON.stringify(expected),
      'PRESERVE field retained: ' + field
    );
  }
  // completed residue stripped
  strictEqual(res.ticket.completedAt, undefined, 'completedAt not copied to new ticket');
  // merged data validates
  const validation = validateTickets(res.data);
  ok(validation.valid, 'merged data passes validate-tickets.js');
})();

// ======================================================================
// C002 — error paths
// ======================================================================
(function testCreateTicketFromSourceErrors() {
  const noTitle = createTicketFromSource({ ticketsData: VALID_TICKETS, sourceKey: 'P0-1', seed: { title: '   ' } });
  ok(!noTitle.success, 'createTicketFromSource rejects blank title');
  ok((noTitle.error || '').includes('non-empty title'), 'error mentions non-empty title');

  const missingSource = createTicketFromSource({ ticketsData: VALID_TICKETS, sourceKey: 'P9-99', seed: { title: 'x' } });
  ok(!missingSource.success, 'createTicketFromSource rejects unknown sourceKey');
})();

// ======================================================================
// C002 — immutability of input
// ======================================================================
(function testInputImmutability() {
  const before = JSON.stringify(VALID_TICKETS);
  createTicketFromSource({ ticketsData: VALID_TICKETS, sourceKey: 'P0-1', seed: { title: 'Immut' } });
  strictEqual(JSON.stringify(VALID_TICKETS), before, 'input ticketsData not mutated');
})();

// ======================================================================
// C002 — new ticket lands in max real phase with auto-incremented id
// ======================================================================
(function testAppendToMaxPhase() {
  const res = createTicketFromSource({ ticketsData: VALID_TICKETS, sourceKey: 'P0-1', seed: { title: 'Phase test' } });
  const maxPhase = res.data.phases.find(p => p.id === 0);
  const added = maxPhase.tickets.find(t => t.title === 'Phase test');
  ok(added, 'new ticket appended to max real phase');
  if (added) strictEqual(added.id, 2, 'new ticket id auto-incremented to 2');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
