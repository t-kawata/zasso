#!/usr/bin/env node
// [::TICKET::] PX-144: list-phases-and-tickets forNextRound display. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-144 --for-spec --no-implementation-order`.

/**
 * list-phases-and-tickets.test.js — Tests for the progress-rendering script.
 *
 * @verifies C003 (list-phases-and-tickets.js renderTicketLines)
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

console.log('\n━━━ list-phases-and-tickets.test.js ━━━\n');

const { renderTicketLines, resolveCheckbox } = require('../list-phases-and-tickets.js');

// ======================================================================
// C003 — forNextRound ticket renders with a distinct marker
// ======================================================================
(function testForNextRoundMarker() {
  const data = { phases: [
    { id: 0, name: 'P0', tickets: [
      { id: 1, phaseId: 0, title: 'normal', status: 'todo' },
      { id: 2, phaseId: 0, title: 'deferred', status: 'todo', forNextRound: true },
    ] },
  ] };
  const lines = renderTicketLines(data);
  const deferredLine = lines.find(l => l.includes('P0-2'));
  ok(deferredLine, 'deferred ticket has a rendered line');
  ok(deferredLine.includes('[→]'), 'deferred ticket uses the distinct [→] marker');
  const normalLine = lines.find(l => l.includes('P0-1'));
  ok(normalLine.includes('[ ]'), 'normal todo ticket keeps its standard checkbox');
})();

// ======================================================================
// C003 — forNextRound tickets are not counted as pending (allReviewed)
// ======================================================================
(function testForNextRoundNotPending() {
  const data = { phases: [
    { id: 0, name: 'P0', tickets: [
      { id: 1, phaseId: 0, title: 'reviewed', status: 'reviewed' },
      { id: 2, phaseId: 0, title: 'deferred', status: 'todo', forNextRound: true },
    ] },
  ] };
  const lines = renderTicketLines(data);
  ok(lines[0].includes('[x]'), 'phase header shows all-reviewed despite the forNextRound ticket');
})();

// ======================================================================
// C003 — resolveCheckbox stays backward compatible
// ======================================================================
(function testResolveCheckboxBackwardCompatible() {
  strictEqual(resolveCheckbox('reviewed'), '[x]', 'reviewed renders [x]');
  strictEqual(resolveCheckbox('todo'), '[ ]', 'todo renders [ ]');
  strictEqual(resolveCheckbox('R2'), '[R2]', 'round status renders [R2]');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
