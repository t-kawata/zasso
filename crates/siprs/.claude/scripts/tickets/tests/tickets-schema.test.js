#!/usr/bin/env node
// [::TICKET::] PX-143: forNextRound in tickets-schema.json. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-143 --for-spec --no-implementation-order`.

/**
 * tickets-schema.test.js — Tests for the Tickets.json JSON Schema.
 *
 * @verifies C001 (tickets-schema.json)
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

console.log('\n━━━ tickets-schema.test.js ━━━\n');

const schema = require('../tickets-schema.json');

// ======================================================================
// C001 — schema declares forNextRound as an optional boolean
// ======================================================================
(function testForNextRoundProperty() {
  const ticket = schema.definitions.ticket;
  ok(ticket && ticket.properties, 'schema has a ticket definition with properties');
  if (!ticket || !ticket.properties) return;
  const prop = ticket.properties.forNextRound;
  ok(prop, 'ticket definition declares forNextRound');
  if (prop) strictEqual(prop.type, 'boolean', 'forNextRound type is boolean');
})();

// ======================================================================
// C001 — required fields are unchanged (id, phaseId, title, status)
// ======================================================================
(function testRequiredFieldsUnchanged() {
  const required = schema.definitions.ticket.required || [];
  strictEqual(required.includes('id'), true, 'id still required');
  strictEqual(required.includes('phaseId'), true, 'phaseId still required');
  strictEqual(required.includes('title'), true, 'title still required');
  strictEqual(required.includes('status'), true, 'status still required');
  strictEqual(required.includes('forNextRound'), false, 'forNextRound stays optional (absent = processable)');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
