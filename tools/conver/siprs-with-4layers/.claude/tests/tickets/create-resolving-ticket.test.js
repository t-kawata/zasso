#!/usr/bin/env node
// [::TICKET::] PX-123: Create create-resolving-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.

/**
 * create-resolving-ticket.test.js — Tests for create-resolving-ticket.js
 *
 * Covers C001-C005 contracts (auto-creation, stubs[] embedding, Markdown
 * Action-directive, real key for Check C, find-omissions.md wiring).
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

// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
// [::TICKET::] PX-123 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

process.stdout.write('\n━━━ create-resolving-ticket.test.js ━━━\n\n');

let createResolvingTicket;
let buildMarkdownGuidance;
let parseArgs;
try {
  const mod = require('../../scripts/tickets/create-resolving-ticket');
  createResolvingTicket = mod.createResolvingTicket;
  buildMarkdownGuidance = mod.buildMarkdownGuidance;
  parseArgs = mod.parseArgs;
} catch (e) {
  failed++;
  process.stdout.write('  ✗ Failed to load create-resolving-ticket.js: ' + e.message + '\n\n');
  process.stdout.write('Passed: ' + passed + '\nFailed: ' + failed + '\n\n');
  process.exit(1);
}

// Valid Tickets.json fixture (schema-valid)
// [::TICKET::] PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function makeData() {
  return {
    title: 'T',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-08-04' },
    phases: [{ id: 0, name: 'P0', tickets: [{ id: 1, phaseId: 0, title: 'Old', status: 'reviewed', nodeIds: ['N0001'], relatedTicketIds: 'P0-2' }] }]
  };
}

// ======================================================================
// C001: Auto-creation — never pause to ask the human

(function testC001PreconditionCompletedSource() {
  const data = makeData();
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P0-1: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs });
  assert(res.success === true, 'C001: resolving ticket auto-created from completed-ticket stub');
})();

(function testC001PostconditionStatusTodoActive() {
  const data = makeData();
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P0-1: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs });
  assertStrictEqual(res.ticket.status, 'todo', 'C001: new ticket is an active obligation');
  assertStrictEqual(res.ticket.title, 'New', 'C001: new title applied (not a retry of the past ticket)');
})();

// ======================================================================
// C002: stubs[] embedding for phasify re-rewrite

(function testC002PostconditionStubsEmbedded() {
  const data = makeData();
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P0-1: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs });
  assert(Array.isArray(res.ticket.stubs), 'C002: stubs[] is an array');
  assertStrictEqual(res.ticket.stubs.length, stubs.length, 'C002: all stubs embedded');
  assertStrictEqual(res.ticket.stubs[0].file, 'src/a.rs', 'C002: stub file preserved');
})();

(function testC002PostconditionStubContentKeyIsNewTicketKey() {
  // MAJOR-7: the embedded stubs[] content must reference the NEW ticket key so
  // phasify's rewriteSourceMarkerLines can match the source after Step 1 rewrites
  // the marker to the returned key (source key === stubs[] key).
  const data = makeData();
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P0-1: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs });
  assert(res.success === true, 'C002: resolving ticket created');
  assert(res.ticket.stubs[0].content.includes('[::STUB::] ' + res.key), 'C002: stubs content references the new ticket key ' + res.key);
})();

(function testC002InvariantEmptyStubsAllowed() {
  const data = makeData();
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs: [] });
  assert(res.success === true, 'C002: empty stubs still creates the ticket');
  assert(Array.isArray(res.ticket.stubs), 'C002: stubs[] present even when empty');
})();

// ======================================================================
// C003: Markdown Action-directive

(function testC003PostconditionMarkdownSections() {
  const md = buildMarkdownGuidance({ key: 'P2-1', sourceKey: 'P0-1' });
  assert(md.includes('show-ticket-context.js'), 'C003: old-content warning command present');
  assert(md.includes('update-ticket.js'), 'C003: field-by-field rewrite instructions present');
  assert(/one field at a time/i.test(md), 'C003: one-at-a-time guidance present');
  assert(md.includes('nodeIds'), 'C003: preserve list present');
  assert(md.includes('P2-1'), 'C003: new key present in guidance');
  assert(md.includes('P0-1'), 'C003: source key present in guidance');
})();

// ======================================================================
// C004: Real key for Check C (active key)

(function testC004InvariantKeyMatchesCreatedTicket() {
  const data = makeData();
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P0-1: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs });
  const expected = 'P' + res.ticket.phaseId + '-' + res.ticket.id;
  assertStrictEqual(res.key, expected, 'C004: returned key matches the actually-created ticket');
})();

(function testC004ErrorNoPartialTicket() {
  const data = makeData();
  const before = JSON.stringify(data);
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P9-9', seed: { title: 'New' }, stubs: [] });
  assert(res.success === false, 'C004: missing source → success false');
  assert(JSON.stringify(data) === before, 'C004: input not mutated on failure');
})();

// ======================================================================
// C005: find-omissions.md wiring

(function testC005PostconditionCommandFileReferencesScript() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  const commandPath = path.resolve(__dirname, '../../commands/find-omissions.md');
  const md = fs.readFileSync(commandPath, 'utf8');
  assert(md.includes('create-resolving-ticket.js'), 'C005: find-omissions.md Step 1 references create-resolving-ticket.js');
  // PX-142: the directive in find-omissions.md Step 1 reads "never ask the human";
  // the assertion must track the current wording instead of the stale "never pause".
  assert(md.includes('never ask the human'), 'C005: Step 1 has a never-ask directive');
})();

// ======================================================================
// PX-142 Defect 1: a resolving ticket must not inherit inspection residue

(function testPX142Defect1StripsInspectionResidue() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  // The source carries ABC-inspection residue from a prior omission round:
  // foundOmissions, originalTicketKey and a [::INSPECTION_FLAGGED::] prefix.
  const data = {
    title: 'T',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-08-04' },
    phases: [{
      id: 8,
      name: 'P8',
      tickets: [{
        id: 4,
        phaseId: 8,
        title: 'cpal implementation',
        status: 'reviewed',
        nodeIds: ['N0001'],
        relatedTicketIds: 'P0-2',
        foundOmissions: [{ criterion: 'A', evaluations: [] }],
        originalTicketKey: 'P5-2',
        background: '[::INSPECTION_FLAGGED::]\nThis ticket failed ABC inspection.\n\nReal original content'
      }]
    }]
  };
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P8-4: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P8-4', seed: { title: 'New' }, stubs });
  assert(res.success === true, 'PX142/D1: resolving ticket created from residue-carrying source');
  assert(res.ticket.foundOmissions === undefined, 'PX142/D1: foundOmissions stripped');
  assert(res.ticket.originalTicketKey === undefined, 'PX142/D1: originalTicketKey stripped');
  assert(!res.ticket.background.includes('[::INSPECTION_FLAGGED::]'), 'PX142/D1: sentinel block stripped from background');
  assertStrictEqual(res.ticket.status, 'todo', 'PX142/D1: status forced to todo');
  assert(Array.isArray(res.ticket.nodeIds) && res.ticket.nodeIds[0] === 'N0001', 'PX142/D1: PRESERVE nodeIds survive');
})();

(function testPX142Defect1SentinelFreeBackgroundUnchanged() {
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
  // A background without a sentinel must pass through untouched (regex no-op).
  const data = {
    title: 'T',
    round: 1,
    metadata: { source: 'test', generatedAt: '2026-08-04' },
    phases: [{
      id: 0,
      name: 'P0',
      tickets: [{
        id: 1,
        phaseId: 0,
        title: 'Old',
        status: 'reviewed',
        background: 'Plain background, no sentinel'
      }]
    }]
  };
  const stubs = [{ file: 'src/a.rs', line: 5, content: '[::STUB::] P0-1: -- Vendor lib' }];
  const res = createResolvingTicket({ ticketsData: data, sourceKey: 'P0-1', seed: { title: 'New' }, stubs });
  assert(res.success === true, 'PX142/D1: created from sentinel-free source');
  assertStrictEqual(res.ticket.background, 'Plain background, no sentinel', 'PX142/D1: sentinel-free background unchanged');
})();

// ======================================================================
// parseArgs

(function testParseArgs() {
  const args = ['--source-key=P0-1', '--stubs=[{"file":"a.rs","line":1,"content":"x"}]', '--tickets=Tickets.json'];
  const parsed = parseArgs(args);
  assertStrictEqual(parsed.sourceKey, 'P0-1', 'parseArgs: sourceKey parsed');
  assert(Array.isArray(parsed.stubs), 'parseArgs: stubs parsed as array');
  assertStrictEqual(parsed.stubs.length, 1, 'parseArgs: one stub parsed');
  assertStrictEqual(parsed.tickets, 'Tickets.json', 'parseArgs: tickets path parsed');
})();

// ======================================================================
// Summary

process.stdout.write('\nPassed: ' + passed + '\nFailed: ' + failed + '\n\n');
if (failed > 0) process.exit(1);
