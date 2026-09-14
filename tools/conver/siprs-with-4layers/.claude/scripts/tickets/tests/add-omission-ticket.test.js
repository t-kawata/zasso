#!/usr/bin/env node
// [::TICKET::] PX-100: Create add-omission-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-100 --for-spec --no-implementation-order`.

/**
 * add-omission-ticket.test.js — Tests for add-omission-ticket.js
 *
 * Covers C001-C002 contracts with: precondition, postcondition, invariant tests.
 * PX-119 C005: max-phase append (never PX).
 *
 * @verifies C001
 * @verifies C002
 * @verifies C005
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let validateTicket;
let appendTicket;
let findOrCreateTmpOmissions;
let lookupTicket;
let validateFoundOmissions;
let findCloneByOriginalKey;
let appendFoundOmissions;
let findLatestTmpOmissions;
let extractCodes;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
// [::TICKET::] PX-105 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-105 --for-spec --no-implementation-order`.
// [::TICKET::] PX-103 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-103 --for-spec --no-implementation-order`.
// [::TICKET::] PX-104 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-104 --for-spec --no-implementation-order`.
// [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
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
  lookupTicket = mod.lookupTicket;
  validateFoundOmissions = mod.validateFoundOmissions;
  findCloneByOriginalKey = mod.findCloneByOriginalKey;
  appendFoundOmissions = mod.appendFoundOmissions;
  findLatestTmpOmissions = mod.findLatestTmpOmissions;
  extractCodes = mod.extractCodes;
  ABC_INSPECTION_PREFIX = mod.ABC_INSPECTION_PREFIX;
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
  // PX-119 C005: appendTicket targets the max real phase (never PX)
  const data = { phases: [{ id: 0, name: 'P0', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: 0 };
  const result = appendTicket(data, ticket);
  const appended = result.phases[0].tickets[0];
  assert(appended.fromStub === false, 'fromStub is false');
  assert(Array.isArray(appended.stubs), 'stubs is array');
  assert(appended.stubs.length === 0, 'stubs is empty');
})();

(function testC002InvariantPreserve() {
  console.log('  ── C002 Invariant preserve existing ──');
  const existing = { id: 99, title: 'Existing', phaseId: 0 };
  const data = { phases: [{ id: 0, name: 'P0', tickets: [existing] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: 0 };
  const result = appendTicket(data, ticket);
  assert(result.phases[0].tickets.length === 2, 'exactly 2 tickets after append');
  assertStrictEqual(result.phases[0].tickets[0].title, 'Existing', 'existing ticket preserved');
  assertStrictEqual(result.phases[0].tickets[1].title, 'Test omission', 'new ticket appended');
})();

(function testAppendPrependsAbcPrefix() {
  console.log('  ── C002 Invariant ABC_INSPECTION_PREFIX ──');
  const data = { phases: [{ id: 0, name: 'P0', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: 0 };
  const result = appendTicket(data, ticket);
  const appended = result.phases[0].tickets[0];
  assert(appended.background.startsWith(ABC_INSPECTION_PREFIX), 'background starts with ABC_INSPECTION_PREFIX');
  assert(appended.background.includes('Found during AI inspection'), 'original background preserved after prefix');
})();

(function testAbcInspectionPrefixContent() {
  console.log('  ── C002 Invariant ABC_INSPECTION_PREFIX content ──');
  // Pin the literal prefix text: the lifecycle sentence and all three
  // criteria must survive verbatim. A regression such as the + + unary-plus
  // bug that collapsed the lifecycle to "lifecycle NaN" fails here.
  assert(
    ABC_INSPECTION_PREFIX.includes('lifecycle (make → plan → start → review → resolve).'),
    'prefix names the full lifecycle'
  );
  assert(!ABC_INSPECTION_PREFIX.includes('NaN'), 'prefix does not contain NaN');
  assert(
    ABC_INSPECTION_PREFIX.includes('three criteria:\n\n  A — Contract Translation:'),
    'A criterion starts on its own line after the lifecycle sentence'
  );
  assert(
    ABC_INSPECTION_PREFIX.includes('  A — Contract Translation:   Are all Precondition/Postcondition/Invariant contracts accurately translated into test code?'),
    'A criterion text is intact'
  );
  assert(
    ABC_INSPECTION_PREFIX.includes('  B — Violation Detection:    Can every contract violation be detected by an existing test assertion?'),
    'B criterion text is intact'
  );
  assert(
    ABC_INSPECTION_PREFIX.includes('  C — Test Precision:         Are tests precise and unambiguous (no broad assertions, no missing edge cases)?'),
    'C criterion text is intact'
  );
  assert(
    ABC_INSPECTION_PREFIX.includes('in this final implementation round.'),
    'prefix names this final implementation round'
  );
  assert(
    ABC_INSPECTION_PREFIX.endsWith('Complete it this time.'),
    'prefix ends with the remand sentence'
  );
})();

// ======================================================================
// Edge cases
// ======================================================================

(function testAppendAutoIncrement() {
  console.log('  ── Edge: auto-increment ID ──');
  const data = { phases: [{ id: 0, name: 'P0', tickets: [{ id: 5, title: 'A' }, { id: 10, title: 'B' }] }] };
  const ticket = { ...VALID_TICKET, id: 0, phaseId: 0 };
  const result = appendTicket(data, ticket);
  const last = result.phases[0].tickets[result.phases[0].tickets.length - 1];
  assert(last.id === 11, 'auto-incremented to max+1 (11)');
})();

(function testAppendDoesNotCreatePxPhase() {
  console.log('  ── Edge: PX phase not created (PX-119 C005) ──');
  const data = { phases: [{ id: 0, name: 'P0', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: 0 };
  const result = appendTicket(data, ticket);
  const pxPhase = result.phases.find(p => p.id === -1);
  assert(pxPhase === undefined, 'PX phase not created');
  assert(result.phases[0].tickets.length === 1, 'ticket appended to max real phase');
})();

(function testExtraFieldsPreserved() {
  console.log('  ── Edge: extra fields preserved ──');
  const data = { phases: [{ id: 0, name: 'P0', tickets: [] }] };
  const ticket = { ...VALID_TICKET, id: 1, phaseId: 0, extraField: 'should survive', anotherExtra: 42 };
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
// PX-102: foundOmissions validation
// ======================================================================

(function testFoundOmissionsNull() {
  console.log('  ── PX-102 foundOmissions null ──');
  const err = validateFoundOmissions(null);
  assert(err !== null, 'null rejected');
  assert(err.includes('array'), 'mentions array');
})();

(function testFoundOmissionsValid() {
  console.log('  ── PX-103 foundOmissions schema v2 valid ──');
  const valid = [{ evaluations: [{ criterion: 'A', passed: false, reason: 'Test missing', evidence: [{ file: 'src/main.rs', line: 42 }] }] }];
  const err = validateFoundOmissions(valid);
  assert(err === null, 'valid evaluations passes');
})();

(function testFoundOmissionsMissingPassed() {
  console.log('  ── PX-103 foundOmissions missing passed ──');
  const bad = [{ evaluations: [{ criterion: 'A', reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] }];
  const err = validateFoundOmissions(bad);
  assert(err !== null, 'missing passed rejected');
  assert(err.includes('passed'), 'mentions passed');
})();

(function testFoundOmissionsMissingFile() {
  console.log('  ── PX-105 foundOmissions missing file ──');
  const bad = [{ evaluations: [{ criterion: 'A', passed: true, reason: 'R', evidence: [{ file: 'x.rs' }] }] }];
  const err = validateFoundOmissions(bad);
  assert(err !== null, 'missing file rejected');
  assert(err.includes('file'), 'mentions file');
})();

(function testFoundOmissionsLineAccepted() {
  console.log('  ── PX-105 foundOmissions line accepted ──');
  const valid = [{ evaluations: [{ criterion: 'A', passed: false, reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] }];
  const err = validateFoundOmissions(valid);
  assert(err === null, 'line accepted');
})();

(function testFoundOmissionsEmpty() {
  console.log('  ── PX-102 foundOmissions empty array ──');
  const err = validateFoundOmissions([]);
  assert(err !== null, 'empty array rejected');
})();

(function testFoundOmissionsInvariant() {
  console.log('  ── PX-105 foundOmissions invariant ──');
  const input = [{ evaluations: [{ criterion: 'A', passed: true, reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] }];
  const before = JSON.stringify(input);
  validateFoundOmissions(input);
  assert(JSON.stringify(input) === before, 'input not mutated');
})();

(function testExtractCodes() {
  console.log('  ── PX-105 extractCodes ──');
  const fs = require('fs');
  const tmpFile = '/tmp/_px105_test.txt';
  fs.writeFileSync(tmpFile, 'line1\nline2\nline3\nline4\nline5');
  const codes = extractCodes(tmpFile, 2);
  assert(codes === 'line2\nline3\nline4', 'returns 3 lines from line 2');
  fs.unlinkSync(tmpFile);
})();

(function testExtractCodesEof() {
  console.log('  ── PX-105 extractCodes near EOF ──');
  const fs = require('fs');
  const tmpFile = '/tmp/_px105_eof.txt';
  fs.writeFileSync(tmpFile, 'line1\nline2');
  const codes = extractCodes(tmpFile, 2);
  assert(codes === 'line2', 'returns 1 line at EOF');
  fs.unlinkSync(tmpFile);
})();

(function testExtractCodesMissingFile() {
  console.log('  ── PX-105 extractCodes missing file ──');
  const codes = extractCodes('/tmp/_nonexistent_file_xyz.txt', 1);
  assert(codes === '', 'returns empty string for missing file');
})();

// ======================================================================
// PX-102: lookupTicket by key
// ======================================================================

(function testLookupTicketFound() {
  console.log('  ── PX-102 lookupTicket found ──');
  const data = { phases: [{ id: -1, tickets: [{ id: 99, title: 'Test', status: 'reviewed' }] }] };
  const t = lookupTicket(data, 'PX-99');
  assert(t !== null, 'ticket found');
  assert(t.title === 'Test', 'correct title');
})();

(function testLookupTicketNotFound() {
  console.log('  ── PX-102 lookupTicket not found ──');
  const data = { phases: [{ id: 0, tickets: [] }] };
  const t = lookupTicket(data, 'P99-99');
  assert(t === null, 'null for missing ticket');
})();

(function testLookupTicketDeepClone() {
  console.log('  ── PX-102 lookupTicket deep clone ──');
  const data = { phases: [{ id: 0, tickets: [{ id: 1, title: 'Original' }] }] };
  const t = lookupTicket(data, 'P0-1');
  t.title = 'Mutated';
  assert(data.phases[0].tickets[0].title === 'Original', 'original unchanged');
})();

// ======================================================================
// PX-103: findCloneByOriginalKey + appendFoundOmissions
// ======================================================================

(function testFindCloneByOriginalKeyFound() {
  console.log('  ── PX-103 findClone found ──');
  const data = { phases: [{ id: -1, tickets: [{ id: 1, originalTicketKey: 'P0-4' }] }] };
  const clone = findCloneByOriginalKey(data, 'P0-4');
  assert(clone !== null, 'clone found');
  assert(clone.originalTicketKey === 'P0-4', 'correct key');
})();

(function testFindCloneByOriginalKeyNotFound() {
  console.log('  ── PX-103 findClone not found ──');
  const data = { phases: [{ id: -1, tickets: [] }] };
  const clone = findCloneByOriginalKey(data, 'P0-4');
  assert(clone === null, 'null when not found');
})();

(function testAppendFoundOmissionsToExisting() {
  console.log('  ── PX-103 append to existing clone ──');
  const clone = { id: 1, originalTicketKey: 'P0-4', foundOmissions: [] };
  const data = { phases: [{ id: -1, tickets: [clone] }] };
  const omission = { evaluations: [{ criterion: 'A', passed: false, reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] };
  const result = appendFoundOmissions(data, 'P0-4', [omission]);
  assert(result.phases[0].tickets[0].foundOmissions.length === 1, 'omission appended');
})();

(function testAppendFoundOmissionsPreservesExisting() {
  console.log('  ── PX-103 append preserves existing ──');
  const clone = { id: 1, originalTicketKey: 'P0-4', foundOmissions: [{ id: 'existing' }] };
  const data = { phases: [{ id: -1, tickets: [clone] }] };
  const omission = { evaluations: [{ criterion: 'A', passed: true, reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] };
  const result = appendFoundOmissions(data, 'P0-4', [omission]);
  assert(result.phases[0].tickets[0].foundOmissions.length === 2, 'existing + new = 2');
  assert(result.phases[0].tickets[0].foundOmissions[0].id === 'existing', 'existing preserved');
})();

(function testAppendFoundOmissionsCreatesNewClone() {
  console.log('  ── PX-103 append creates new clone ──');
  const data = { phases: [{ id: -1, tickets: [] }] };
  const omission = { evaluations: [{ criterion: 'A', passed: false, reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] };
  const result = appendFoundOmissions(data, 'P0-4', [omission]);
  const clone = result.phases[0].tickets.find(t => t.originalTicketKey === 'P0-4');
  assert(clone !== null, 'new clone created');
  assert(clone.originalTicketKey === 'P0-4', 'originalTicketKey set');
})();

(function testAppendFoundOmissionsSetsOriginalKey() {
  console.log('  ── PX-103 append sets originalTicketKey ──');
  const data = { phases: [{ id: -1, tickets: [] }] };
  const omission = { evaluations: [{ criterion: 'A', passed: true, reason: 'R', evidence: [{ file: 'x.rs', line: 42 }] }] };
  const result = appendFoundOmissions(data, 'PX-99', [omission]);
  assert(result.phases[0].tickets[0].originalTicketKey === 'PX-99', 'PX-99 tracked');
})();

(function testFindLatestTmpOmissions() {
  console.log('  ── PX-104 findLatestTmpOmissions ──');
  const result = findLatestTmpOmissions();
  // May be null if no tmp files exist — that's OK, just verify no crash
  assert(result === null || typeof result === 'string', 'returns null or string path');
})();

// ======================================================================
// PX-119 C005: max-phase append (never PX)
// ======================================================================

(function testC005AppendsToMaxPhase() {
  console.log('  ── C005 Postcondition: max-phase append ──');
  const data = { phases: [
    { id: 0, tickets: [{ id: 1, phaseId: 0, status: 'todo' }] },
    { id: 22, tickets: [{ id: 1, phaseId: 22, status: 'reviewed' }, { id: 2, phaseId: 22, status: 'reviewed' }] }
  ] };
  const ticket = { ...VALID_TICKET, status: 'todo' };
  const result = appendTicket(data, ticket);
  const maxPhase = result.phases.find(p => p.id === 22);
  const added = maxPhase.tickets.find(t => t.title === VALID_TICKET.title);
  assertStrictEqual(added.id, 3, 'id = max-in-phase+1');
  assertStrictEqual(added.phaseId, 22, 'phaseId = maxPhaseId');
  assertStrictEqual(added.status, 'todo', 'status is todo');
  const pxPhase = result.phases.find(p => p.id === -1);
  assert(pxPhase === undefined, 'no PX phase created');
})();

(function testC005NeverWritesToPx() {
  console.log('  ── C005 Invariant: never PX ──');
  const data = { phases: [
    { id: -1, tickets: [{ id: 1, phaseId: -1, status: 'todo', title: 'px existing' }] },
    { id: 0, tickets: [{ id: 1, phaseId: 0, status: 'todo' }] }
  ] };
  const ticket = { ...VALID_TICKET, status: 'todo' };
  const result = appendTicket(data, ticket);
  const pxPhase = result.phases.find(p => p.id === -1);
  assertStrictEqual(pxPhase.tickets.length, 1, 'PX phase unchanged (no new ticket)');
  assert(pxPhase.tickets.every(t => t.title !== VALID_TICKET.title), 'new ticket not placed in PX');
  const maxPhase = result.phases.find(p => p.id === 0);
  assert(maxPhase.tickets.some(t => t.title === VALID_TICKET.title), 'new ticket placed in max real phase');
})();

(function testC005ForNextRound() {
// [::TICKET::] PX-143 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-143 --for-spec --no-implementation-order`.
  console.log('  ── C005 Postcondition: forNextRound=true ──');
  const data = { phases: [
    { id: -1, tickets: [] },
    { id: 0, tickets: [] }
  ] };
  const ticket = { ...VALID_TICKET, status: 'todo' };
  const result = appendTicket(data, ticket);
  const maxPhase = result.phases.find(p => p.id === 0);
  const added = maxPhase.tickets.find(t => t.title === VALID_TICKET.title);
  assert(added, 'omission ticket appended to max real phase');
  assertStrictEqual(added.forNextRound, true, 'omission ticket carries forNextRound=true');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
