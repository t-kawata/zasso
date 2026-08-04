#!/usr/bin/env node
// [::TICKET::] PX-124: Create create-deferral-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-124 --for-spec --no-implementation-order`.

/**
 * create-deferral-ticket.test.js — Tests for create-deferral-ticket.js
 *
 * Covers C001-C005 contracts (dedicated-script deferral, non-PX max-phase todo,
 * deferredTo handling, Markdown Action-directive, Prohibition compliance).
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

// [::TICKET::] PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

process.stdout.write('\n━━━ create-deferral-ticket.test.js ━━━\n\n');

let createDeferralTicket;
let buildMarkdownGuidance;
let parseArgs;
try {
  const mod = require('../../scripts/tickets/create-deferral-ticket');
  createDeferralTicket = mod.createDeferralTicket;
  buildMarkdownGuidance = mod.buildMarkdownGuidance;
  parseArgs = mod.parseArgs;
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load create-deferral-ticket.js: ' + e.message + '\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

// Valid Tickets.json fixture (schema-valid) with a max non-PX phase 2.
// [::TICKET::] PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function makeData() {
  return {
    title: 'T',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-08-04' },
    phases: [
      { id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'Old', status: 'todo' }] },
      { id: 2, name: 'P2', tickets: [{ id: 1, phaseId: 2, title: 'x', status: 'todo' }] }
    ]
  };
}

// Fixture with targetStubs on the source ticket (for deferredTo tests).
// [::TICKET::] PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-127 --for-spec --no-implementation-order`.
function makeDataWithStubs() {
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
          targetStubs: [{ id: 'TS-1', deferredTo: null }, { id: 'TS-2', deferredTo: 'P9-9' }]
        }]
      }
    ]
  };
}

// ======================================================================
// C001: Deferral via dedicated script (not /make-ticket)

(function testC001PostconditionCommandFileReferencesScript() {
  const commandPath = path.resolve(__dirname, '../../commands/resolve-ticket.md');
  const md = fs.readFileSync(commandPath, 'utf8');
  assert(md.includes('create-deferral-ticket.js'), 'C001: resolve-ticket.md references create-deferral-ticket.js');
  const deferralStart = md.indexOf('Escape hatch');
  const deferralEnd = md.indexOf('Convergence loop');
  const deferralSection = md.slice(deferralStart, deferralEnd);
  assert(!deferralSection.includes('/make-ticket'), 'C001: deferral section no longer instructs /make-ticket');
})();

// ======================================================================
// C002: Non-PX max-phase todo

(function testC002PreconditionResolvedTicketSource() {
  const data = makeData();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  assert(res.success === true, 'C002: deferral created from resolved ticket');
})();

(function testC002PostconditionNonPxMaxPhaseTodo() {
  const data = makeData();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  assertStrictEqual(res.ticket.phaseId, 2, 'C002: appended to non-PX max phase (2)');
  assertStrictEqual(res.ticket.status, 'todo', 'C002: status todo');
  assert(res.ticket.phaseId >= 0, 'C002: never PX (phaseId >= 0)');
  assertStrictEqual(res.ticket.id, 2, 'C002: auto-incremented id within max phase');
})();

// ======================================================================
// C003: deferredTo handling

(function testC003PostconditionKeyUsableAsDeferredTo() {
  const data = makeData();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  const expected = 'P' + res.ticket.phaseId + '-' + res.ticket.id;
  assertStrictEqual(res.key, expected, 'C003: deferredTo target = actually-created ticket key');
})();

(function testC003InvariantGuidanceMentionsDeferredTo() {
  const data = makeData();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  const md = buildMarkdownGuidance({ key: res.key, sourceKey: 'P0-1' });
  assert(md.includes('deferredTo'), 'C003: guidance instructs deferredTo update to the new key');
})();

// ======================================================================
// C004: Markdown Action-directive

(function testC004PostconditionMarkdownSections() {
  const md = buildMarkdownGuidance({ key: 'P2-2', sourceKey: 'P0-1' });
  assert(md.includes('show-ticket-context.js'), 'C004: old-content warning present');
  assert(md.includes('update-ticket.js'), 'C004: rewrite instructions present');
  assert(/one field at a time/i.test(md), 'C004: one-at-a-time guidance present');
  assert(md.includes('nodeIds'), 'C004: preserve list present');
  assert(md.includes('P2-2'), 'C004: new key present');
  assert(md.includes('P0-1'), 'C004: source key present');
})();

// ======================================================================
// C005: Prohibition compliance — no existing ticket mutated

(function testC005InvariantInputNotMutated() {
  const data = makeData();
  const before = JSON.stringify(data);
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  assert(res.success === true, 'C005: deferral created');
  assertStrictEqual(JSON.stringify(data), before, 'C005: input Tickets.json not mutated (existing tickets untouched)');
  assertStrictEqual(data.phases[0].tickets[0].status, 'todo', 'C005: source ticket status unchanged');
})();

(function testC005ErrorSourceNotFound() {
  const data = makeData();
  const before = JSON.stringify(data);
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P9-9', seed: { title: 'Defer' } });
  assert(res.success === false, 'C005: missing source → success false');
  assertStrictEqual(JSON.stringify(data), before, 'C005: input unchanged on failure');
})();

// ======================================================================
// parseArgs

(function testParseArgs() {
  const args = ['--source-key=P0-1', '--deferred-to=P0-1', '--tickets=Tickets.json'];
  const parsed = parseArgs(args);
  assertStrictEqual(parsed.sourceKey, 'P0-1', 'parseArgs: sourceKey parsed');
  assertStrictEqual(parsed.deferredTo, 'P0-1', 'parseArgs: deferredTo parsed');
  assertStrictEqual(parsed.tickets, 'Tickets.json', 'parseArgs: tickets path parsed');
})();

// ======================================================================
// PX-127: deferredTo setter (Prohibition-compliant)

(function testC001DeferredToSetOnMatchingStub() {
  const data = makeDataWithStubs();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, stubId: 'TS-1' });
  assert(res.success === true, 'C001: deferral created');
  assertStrictEqual(res.data.phases[0].tickets[0].targetStubs[0].deferredTo, res.key, 'C001: matching stub deferredTo = new key');
})();

(function testC002NonMatchingStubUntouched() {
  const data = makeDataWithStubs();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, stubId: 'TS-1' });
  assertStrictEqual(res.data.phases[0].tickets[0].targetStubs[1].deferredTo, 'P9-9', 'C002: non-matching stub keeps its deferredTo');
})();

(function testC003ProhibitionInputNotMutated() {
  const data = makeDataWithStubs();
  const before = JSON.stringify(data);
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, stubId: 'TS-1' });
  assert(res.success === true, 'C003: deferral created');
  assertStrictEqual(JSON.stringify(data), before, 'C003: input Tickets.json not mutated (append-only)');
})();

(function testC004NoStubIdBackwardCompatible() {
  const data = makeDataWithStubs();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' } });
  assert(res.success === true, 'C004: ticket still created without stubId');
  assertStrictEqual(res.data.phases[0].tickets[0].targetStubs[0].deferredTo, null, 'C004: deferredTo untouched without stubId');
})();

(function testC005UnmatchedStubIdFailsLoudly() {
  const data = makeDataWithStubs();
  const res = createDeferralTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'Defer' }, stubId: 'TS-NOPE' });
  assert(res.success === false, 'C005: unmatched stubId fails loudly');
  assert(typeof res.error === 'string' && res.error.includes('TS-NOPE'), 'C005: actionable error names the stub');
})();

// ======================================================================
// Summary

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n');
if (failed > 0) process.exit(1);
