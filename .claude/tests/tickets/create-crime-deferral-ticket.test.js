#!/usr/bin/env node
// [::TICKET::] PX-128: Create create-crime-deferral-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.

/**
 * create-crime-deferral-ticket.test.js — Tests for create-crime-deferral-ticket.js
 *
 * Covers C001-C005 contracts: non-PX max-phase todo creation, deferredTo set on
 * the matching targetCrime, non-matching crimes untouched, unmatched crimeId
 * fails loudly, and start-ticket.md no-external-excuse wiring.
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 * @verifies C004
 * @verifies C005
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

process.stdout.write('\n━━━ create-crime-deferral-ticket.test.js ━━━\n\n');

let createCrimeDeferralTicket;
let parseArgs;
try {
  const mod = require('../../scripts/tickets/create-crime-deferral-ticket');
  createCrimeDeferralTicket = mod.createCrimeDeferralTicket;
  parseArgs = mod.parseArgs;
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load create-crime-deferral-ticket.js: ' + e.message + '\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

// Fixture: source ticket (P0-1) with two targetCrimes; max non-PX phase 2.
// [::TICKET::] PX-128 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-128 --for-spec --no-implementation-order`.
function makeData() {
  return {
    title: 'T',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-08-04' },
    phases: [
      {
        id: 0,
        name: 'P0',
        tickets: [{
          id: 1,
          phaseId: 0,
          title: 'Old',
          status: 'todo',
          targetCrimes: [{ id: 'TC-1', deferredTo: null }, { id: 'TC-2', deferredTo: 'P9-9' }]
        }]
      },
      { id: 2, name: 'P2', tickets: [{ id: 1, phaseId: 2, title: 'x', status: 'todo' }] }
    ]
  };
}

// ======================================================================
// C001: Non-PX max-phase todo

(function testC001PostconditionNonPxMaxPhaseTodo() {
  const data = makeData();
  const res = createCrimeDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  assert(res.success === true, 'C001: deferral ticket created');
  assertStrictEqual(res.ticket.phaseId, 2, 'C001: appended to non-PX max phase (2)');
  assertStrictEqual(res.ticket.status, 'todo', 'C001: status todo');
  assert(res.ticket.phaseId >= 0, 'C001: never PX');
})();

// ======================================================================
// C002: deferredTo set on matching crime

(function testC002DeferredToSetOnMatchingCrime() {
  const data = makeData();
  const res = createCrimeDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, crimeId: 'TC-1' });
  assert(res.success === true, 'C002: deferral created');
  assertStrictEqual(res.data.phases[0].tickets[0].targetCrimes[0].deferredTo, res.key, 'C002: matching crime deferredTo = new key');
})();

// ======================================================================
// C003: non-matching crimes untouched

(function testC003NonMatchingCrimeUntouched() {
  const data = makeData();
  const res = createCrimeDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, crimeId: 'TC-1' });
  assertStrictEqual(res.data.phases[0].tickets[0].targetCrimes[1].deferredTo, 'P9-9', 'C003: non-matching crime keeps its deferredTo');
})();

// ======================================================================
// C004: unmatched crimeId fails loudly, no partial write

(function testC004UnmatchedCrimeIdFailsLoudly() {
  const data = makeData();
  const before = JSON.stringify(data);
  const res = createCrimeDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, crimeId: 'TC-NOPE' });
  assert(res.success === false, 'C004: unmatched crimeId fails loudly');
  assert(typeof res.error === 'string' && res.error.includes('TC-NOPE'), 'C004: actionable error names the crime');
  assertStrictEqual(JSON.stringify(data), before, 'C004: input unchanged (no partial write)');
})();

// ======================================================================
// C005: start-ticket.md no-external-excuse wiring

(function testC005StartTicketWiring() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const md = fs.readFileSync(path.resolve(__dirname, '../../commands/start-ticket.md'), 'utf8');
  assert(md.includes('create-crime-deferral-ticket.js'), 'C005: start-ticket.md references create-crime-deferral-ticket.js');
  assert(!md.includes('create a new ticket via `/make-ticket`'), 'C005: /make-ticket removed from the escape hatch');
  assert(md.includes('FORBIDDEN'), 'C005: external-excuse language forbidden');
})();

// ======================================================================
// parseArgs

(function testParseArgs() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const args = ['--source-key=P0-1', '--crime-id=TC-1'];
  const parsed = parseArgs(args);
  assertStrictEqual(parsed.sourceKey, 'P0-1', 'parseArgs: sourceKey parsed');
  assertStrictEqual(parsed.crimeId, 'TC-1', 'parseArgs: crimeId parsed');
  // PX-142: --tickets was intentionally removed (Tickets.json is always
  // ./Tickets.json from the CWD), so parseArgs no longer carries a tickets field.
  assertStrictEqual(parsed.tickets, undefined, 'parseArgs: tickets field removed');
})();

// ======================================================================
// Summary

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n');
if (failed > 0) process.exit(1);
