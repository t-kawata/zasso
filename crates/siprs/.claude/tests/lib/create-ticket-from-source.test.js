#!/usr/bin/env node
// [::TICKET::] PX-122: Create lib/create-ticket-from-source.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.

/**
 * create-ticket-from-source.test.js — Tests for lib/create-ticket-from-source.js
 *
 * Covers C001-C005 contracts with precondition, postcondition, invariant tests,
 * plus boundary cases (missing source, no non-PX phase, empty Tickets.json).
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 * @verifies C004
 * @verifies C005
 */

let passed = 0;
let failed = 0;

// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assertDeepStrictEqual(actual, expected, message) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

process.stdout.write('\n━━━ create-ticket-from-source.test.js ━━━\n');

let createTicketFromSource;
try {
  ({ createTicketFromSource } = require('../../scripts/lib/create-ticket-from-source'));
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load create-ticket-from-source.js: ' + e.message + '\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// C001: Deep-clone preservation — PRESERVE fields never lost

(function testC001PreconditionSourceExists() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo', nodeIds: ['N0001'], relatedTicketIds: 'P0-2', referenceSection: 'RFC §3', referenceUrls: ['https://x'], sourcePaths: ['src/a.rs'], rfcDiscrepancies: [] };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assert(res.success === true, 'C001: source ticket found → success true');
})();

(function testC001PostconditionPreservesRelationalFields() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo', nodeIds: ['N0001','N0002'], relatedTicketIds: 'P0-2', referenceSection: 'RFC §3', referenceUrls: ['https://x'], sourcePaths: ['src/a.rs'], rfcDiscrepancies: ['drift-1'] };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assertDeepStrictEqual(res.ticket.nodeIds, source.nodeIds, 'C001: nodeIds identical');
  assertStrictEqual(res.ticket.relatedTicketIds, source.relatedTicketIds, 'C001: relatedTicketIds identical');
  assertStrictEqual(res.ticket.referenceSection, source.referenceSection, 'C001: referenceSection identical');
  assertDeepStrictEqual(res.ticket.referenceUrls, source.referenceUrls, 'C001: referenceUrls identical');
  assertDeepStrictEqual(res.ticket.sourcePaths, source.sourcePaths, 'C001: sourcePaths identical');
  assertDeepStrictEqual(res.ticket.rfcDiscrepancies, source.rfcDiscrepancies, 'C001: rfcDiscrepancies identical');
})();

(function testC001InvariantNoFieldDropped() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo', nodeIds: [], relatedTicketIds: '', referenceSection: '', referenceUrls: [], sourcePaths: [], rfcDiscrepancies: [] };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assertStrictEqual(res.ticket.nodeIds !== undefined, true, 'C001: empty nodeIds array retained (not dropped)');
  assertStrictEqual(res.ticket.relatedTicketIds !== undefined, true, 'C001: empty relatedTicketIds retained');
  assertStrictEqual(res.ticket.referenceSection !== undefined, true, 'C001: empty referenceSection retained');
})();

// ======================================================================
// C002: Residue stripping — completed ticket becomes active todo

(function testC002PreconditionSourceCompleted() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'reviewed', completedAt: '2026-08-01', startedAt: '2026-07-01' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assert(res.success === true, 'C002: completed source accepted');
})();

(function testC002PostconditionStatusTodo() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'reviewed', completedAt: '2026-08-01', startedAt: '2026-07-01' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assertStrictEqual(res.ticket.status, 'todo', 'C002: status stripped to todo');
  assertStrictEqual(res.ticket.completedAt, undefined, 'C002: completedAt removed');
  assertStrictEqual(res.ticket.startedAt, undefined, 'C002: startedAt removed');
})();

(function testC002InvariantNotRoundStatus() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'R3', completedAt: '2026-08-01' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assertStrictEqual(res.ticket.status, 'todo', 'C002: round-aware R3 stripped to todo');
  assert(!/^R[1-9]\d*$/.test(res.ticket.status || ''), 'C002: no round-aware status remains');
})();

// ======================================================================
// C003: Max real phase append — never PX

(function testC003PreconditionMaxPhaseExists() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }, { id: 2, name: 'P2', tickets: [{ id: 1, phaseId: 2, title: 'x', status: 'todo' }, { id: 2, phaseId: 2, title: 'y', status: 'todo' }] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assert(res.success === true, 'C003: max phase 2 present → success');
})();

(function testC003PostconditionAppendsToMaxRealPhase() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }, { id: 2, name: 'P2', tickets: [{ id: 1, phaseId: 2, title: 'x', status: 'todo' }, { id: 2, phaseId: 2, title: 'y', status: 'todo' }] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assertStrictEqual(res.ticket.phaseId, 2, 'C003: phaseId = max real phase (2)');
  assertStrictEqual(res.ticket.id, 3, 'C003: id = maxId+1 (3)');
  assertStrictEqual(res.key, 'P2-3', 'C003: returned key = P2-3');
  assertStrictEqual(res.data.phases[1].tickets.length, 3, 'C003: ticket appended into phase 2');
})();

(function testC003BoundaryOnlyPxPhase() {
  const source = { id: 1, phaseId: -1, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: -1, name: '[X] Independent Phase', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'PX-1', seed: { title: 'New' } });
  assert(res.success === true, 'C003: only PX phase → success');
  assertStrictEqual(res.ticket.phaseId, 0, 'C003: phase 0 created when only PX exists');
  assertStrictEqual(res.key, 'P0-1', 'C003: key = P0-1');
})();

(function testC003BoundaryEmptyPhases() {
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'PX-1', seed: { title: 'New' } });
  assert(res.success === false, 'C003: empty Tickets.json with no source → success false');
})();

// ======================================================================
// C004: Schema validation — validate before write

(function testC004PreconditionValidAssembly() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assert(res.success === true, 'C004: valid assembly succeeds');
})();

(function testC004PostconditionValidatesMergedData() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  assert(res.success === true, 'C004: success flag true');
  assert(typeof res.data === 'object', 'C004: merged data returned');
  assert(res.key.startsWith('P'), 'C004: key uses P{phase}-{id} format');
})();

(function testC004InvariantNoPartialWriteOnInvalidSeed() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const before = JSON.stringify(data);
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: {} });
  assert(res.success === false, 'C004: seed without title rejected');
  assert(JSON.stringify(data) === before, 'C004: input data not mutated on failure');
})();

// ======================================================================
// C005: Seed edits applied; returned key matches the created ticket

(function testC005PreconditionSeedSupplied() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New', background: 'new-bg', scope: ['new1'] } });
  assert(res.success === true, 'C005: seed with title accepted');
})();

(function testC005PostconditionSeedApplied() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo', background: 'old', scope: ['old1'] };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New', background: 'new-bg', scope: ['new1'] } });
  assertStrictEqual(res.ticket.title, 'New', 'C005: title seed applied');
  assertStrictEqual(res.ticket.background, 'new-bg', 'C005: background seed applied');
  assertDeepStrictEqual(res.ticket.scope, ['new1'], 'C005: scope seed applied');
})();

(function testC005InvariantKeyMatchesCreatedTicket() {
  const source = { id: 1, phaseId: 0, title: 'S', status: 'todo' };
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [source] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' } });
  const expectedKey = 'P' + res.ticket.phaseId + '-' + res.ticket.id;
  assertStrictEqual(res.key, expectedKey, 'C005: returned key matches actual phaseId-id');
})();

// ======================================================================
// Boundary: source not found

(function testBoundarySourceNotFound() {
  const data = { title: 'T', round: 1, metadata: { source: 'test', generatedAt: '2026-08-04' }, phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, title: 'S', status: 'todo' }] }] };
  const res = createTicketFromSource({ ticketsData: data, sourceKey: 'P9-9', seed: { title: 'New' } });
  assert(res.success === false, 'boundary: missing source key → success false');
  assert(typeof res.error === 'string', 'boundary: error message present');
})();

// ======================================================================
// Summary

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
