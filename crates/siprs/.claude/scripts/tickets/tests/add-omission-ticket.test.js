#!/usr/bin/env node
// [::TICKET::] PX-100: Create add-omission-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-100 --for-spec --no-implementation-order`.

/**
 * add-omission-ticket.test.js — Tests for add-omission-ticket.js
 *
 * Covers C001-C002 contracts with: precondition, postcondition, invariant tests.
 *
 * @verifies C001
 * @verifies C002
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let validateTicket;
let appendTicket;
let findOrCreateTmpOmissions;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ add-omission-ticket.test.js ━━━\n');

try {
  const mod = require('../add-omission-ticket');
  validateTicket = mod.validateTicket;
  appendTicket = mod.appendTicket;
  findOrCreateTmpOmissions = mod.findOrCreateTmpOmissions;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load add-omission-ticket.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

const VALID_TICKET = {
  title: 'Test omission',
  background: 'Found during AI inspection',
  scope: ['Fix validation in module X'],
  testUnit: ['UT: Validate input returns error'],
  acceptanceCriteria: ['Happy: valid input passes'],
  invariants: '- [Normal] Input is validated before processing'
};

// ======================================================================
// C001: Input validation
// ======================================================================

(function testC001Precondition() {
  console.log('  ── C001 Precondition ──');
  const result = validateTicket(null);
  assert(result !== null, 'null ticket rejected');
  assert(typeof result === 'string', 'error is string');
})();

(function testC001PreconditionInvalid() {
  console.log('  ── C001 Precondition invalid ──');
  const result = validateTicket({});
  assert(result !== null, 'empty ticket rejected');
  assert(result.includes('title'), 'mentions missing title');
})();

(function testC001Postcondition() {
  console.log('  ── C001 Postcondition ──');
  const result = validateTicket(VALID_TICKET);
  assertStrictEqual(result, null, 'valid ticket returns null (no error)');
})();

(function testC001Invariant() {
  console.log('  ── C001 Invariant ──');
  const input = { ...VALID_TICKET };
  const beforeJson = JSON.stringify(input);
  validateTicket(input);
  const afterJson = JSON.stringify(input);
  assertStrictEqual(beforeJson, afterJson, 'validateTicket does not mutate input');
})();

// ======================================================================
// C002: Required fields
// ======================================================================

(function testC002MissingTitle() {
  console.log('  ── C002 Missing title ──');
  const t = { background: 'B', scope: ['s'], testUnit: ['u'], acceptanceCriteria: ['a'], invariants: 'i' };
  const result = validateTicket(t);
  assert(result !== null, 'missing title rejected');
  assert(result.includes('title'), 'error mentions title');
})();

(function testC002MissingBackground() {
  console.log('  ── C002 Missing background ──');
  const t = { title: 'T', scope: ['s'], testUnit: ['u'], acceptanceCriteria: ['a'], invariants: 'i' };
  const result = validateTicket(t);
  assert(result !== null, 'missing background rejected');
  assert(result.includes('background'), 'error mentions background');
})();

(function testC002EmptyScope() {
  console.log('  ── C002 Empty scope ──');
  const t = { title: 'T', background: 'B', scope: [], testUnit: ['u'], acceptanceCriteria: ['a'], invariants: 'i' };
  const result = validateTicket(t);
  assert(result !== null, 'empty scope rejected');
  assert(result.includes('scope'), 'error mentions scope');
})();

(function testC002EmptyTestUnit() {
  console.log('  ── C002 Empty testUnit ──');
  const t = { title: 'T', background: 'B', scope: ['s'], testUnit: [], acceptanceCriteria: ['a'], invariants: 'i' };
  const result = validateTicket(t);
  assert(result !== null, 'empty testUnit rejected');
  assert(result.includes('testUnit'), 'error mentions testUnit');
})();

(function testC002EmptyAcceptanceCriteria() {
  console.log('  ── C002 Empty acceptanceCriteria ──');
  const t = { title: 'T', background: 'B', scope: ['s'], testUnit: ['u'], acceptanceCriteria: [], invariants: 'i' };
  const result = validateTicket(t);
  assert(result !== null, 'empty acceptanceCriteria rejected');
  assert(result.includes('acceptanceCriteria'), 'error mentions acceptanceCriteria');
})();

(function testC002EmptyInvariants() {
  console.log('  ── C002 Empty invariants ──');
  const t = { title: 'T', background: 'B', scope: ['s'], testUnit: ['u'], acceptanceCriteria: ['a'], invariants: '' };
  const result = validateTicket(t);
  assert(result !== null, 'empty invariants rejected');
  assert(result.includes('invariants'), 'error mentions invariants');
})();

(function testC002NullBackground() {
  console.log('  ── C002 Null background ──');
  const t = { title: 'T', background: null, scope: ['s'], testUnit: ['u'], acceptanceCriteria: ['a'], invariants: 'i' };
  const result = validateTicket(t);
  assert(result !== null, 'null background rejected');
})();

(function testC002Postcondition() {
  console.log('  ── C002 Postcondition ──');
  const result = validateTicket(VALID_TICKET);
  assertStrictEqual(result, null, 'ticket with all required fields accepted');
})();

(function testC002InvariantFromStub() {
  console.log('  ── C002 Invariant fromStub ──');
  const data = { phases: [{ id: -1, name: 'PX', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: -1 };
  const result = appendTicket(data, ticket);
  const appended = result.phases[0].tickets[0];
  assert(appended.fromStub === false, 'fromStub is false');
  assert(Array.isArray(appended.stubs), 'stubs is array');
  assert(appended.stubs.length === 0, 'stubs is empty');
})();

(function testC002InvariantPreserve() {
  console.log('  ── C002 Invariant preserve existing ──');
  const existing = { id: 99, title: 'Existing', phaseId: -1 };
  const data = { phases: [{ id: -1, name: 'PX', tickets: [existing] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: -1 };
  const result = appendTicket(data, ticket);
  assert(result.phases[0].tickets.length === 2, 'exactly 2 tickets after append');
  assertStrictEqual(result.phases[0].tickets[0].title, 'Existing', 'existing ticket preserved');
  assertStrictEqual(result.phases[0].tickets[1].title, 'Test omission', 'new ticket appended');
})();

// ======================================================================
// Edge cases
// ======================================================================

(function testAppendAutoIncrement() {
  console.log('  ── Edge: auto-increment ID ──');
  const data = { phases: [{ id: -1, name: 'PX', tickets: [{ id: 5, title: 'A' }, { id: 10, title: 'B' }] }] };
  const ticket = { ...VALID_TICKET, id: 0, phaseId: -1 };
  const result = appendTicket(data, ticket);
  const last = result.phases[0].tickets[result.phases[0].tickets.length - 1];
  assert(last.id === 11, 'auto-incremented to max+1 (11)');
})();

(function testAppendCreatesPxPhase() {
  console.log('  ── Edge: create PX phase if missing ──');
  const data = { phases: [{ id: 0, name: 'P0', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: -1 };
  const result = appendTicket(data, ticket);
  const pxPhase = result.phases.find(p => p.id === -1);
  assert(pxPhase !== undefined, 'PX phase created');
  assert(pxPhase.tickets.length === 1, 'ticket in PX phase');
})();

(function testExtraFieldsPreserved() {
  console.log('  ── Edge: extra fields preserved ──');
  const data = { phases: [{ id: -1, name: 'PX', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: -1, extraField: 'should survive', anotherExtra: 42 };
  const result = appendTicket(data, ticket);
  const appended = result.phases[0].tickets[0];
  assert(appended.extraField === 'should survive', 'extraField preserved');
  assertStrictEqual(appended.anotherExtra, 42, 'anotherExtra preserved');
})();

// ======================================================================
// findOrCreateTmpOmissions
// ======================================================================

(function testFindOrCreateNoFile() {
  console.log('  ── findOrCreate: no file exists ──');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px100-noexist-'));
  const fakeTickets = {
    title: 'test',
    metadata: { source: 'test' },
    phases: [{ id: -1, name: '[X] Test', characteristics: '', tickets: [] }]
  };
  const ticketsPath = path.join(tmpDir, 'fake-tickets.json');
  fs.writeFileSync(ticketsPath, JSON.stringify(fakeTickets), 'utf8');
  const tmpOmissionsPath = path.join(tmpDir, '_tmp-nofile.json');
  const result = findOrCreateTmpOmissions(tmpOmissionsPath, ticketsPath);
  assert(result !== null, 'result is not null');
  assert(result.title === 'test', 'title from template');
  const created = JSON.parse(fs.readFileSync(tmpOmissionsPath, 'utf8'));
  assert(created.phases.some(p => p.id === -1), 'PX phase exists after creation');
  // Cleanup
  fs.unlinkSync(ticketsPath);
  fs.unlinkSync(tmpOmissionsPath);
  fs.rmdirSync(tmpDir);
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
