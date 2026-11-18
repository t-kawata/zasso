'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C003/C004/C006 — two-step workflow on a neutral legacy fixture.
 *
 * Report-only twice must be byte-identical and write nothing. Apply must create
 * at most one phase; a second apply creates zero tickets and zero phases.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { clauseKey } = require('../../.claude/scripts/tickets/lib/contract-clause.js');
const { evidenceDigestOf } = require('../../.claude/scripts/tickets/lib/dispositions.js');

const RUNNER = path.resolve(__dirname, '../../.claude/scripts/tickets/find-omissions-run.js');
const GATE = path.resolve(__dirname, '../../.claude/scripts/tickets/omission-detection-gate.js');

const CONTRACT = { id: 'C001', precondition: 'input is present', postcondition: 'output is stored', invariant: 'state is unchanged' };

/** A legacy package with a completed root ticket and one unproven clause. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-e2e-'));
  const key = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'precondition', text: CONTRACT.precondition });
  fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
    adapter: { id: 'fixture-adapter', version: 1, scope: 'pkg-alpha', contractIdScope: 'global', elements: ['precondition', 'postcondition', 'invariant'], applicability: 'TESTABLE' },
    sources: [{ kind: 'graph', artifact: 'RFC-GRAPH.json', edges: [{ id: 'E001', contracts: [CONTRACT] }] }],
  }));
  fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), JSON.stringify({ edges: [{ id: 'E001', contracts: [CONTRACT] }] }));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: {},
    phases: [{ id: 1, name: 'P1', tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts: [CONTRACT] }] }],
  }));
  fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({
    version: 1,
    tests: [{ id: 'save', file: 'save.js', name: 'save', kind: 'unit', ignored: false, annotations: ['verifies:' + key] }],
  }));
  return cwd;
}

/** Run the wrapper. */
// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
function run(cwd, args = []) {
  const result = spawnSync(process.execPath, [RUNNER, '--cwd=' + cwd, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
}

test('C006: report-only runs twice are byte-identical and write nothing', () => {
  const cwd = fixture();
  try {
    const first = run(cwd, ['--report-only']);
    const second = run(cwd, ['--report-only']);

    assert.equal(first.status, 10);
    assert.equal(first.stdout, second.stdout);
    assert.equal(fs.existsSync(path.join(cwd, 'CONTRACT-COVERAGE.json')), false);
    assert.equal(fs.existsSync(path.join(cwd, 'CONVER-FIND-REPORT.json')), false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C003/C004: apply creates one phase, then a second apply creates zero tickets and zero phases', () => {
  const cwd = fixture();
  try {
    const first = run(cwd);
    assert.equal(first.status, 10);
    assert.equal(first.json.createdTickets, 1);
    assert.equal(first.json.phasesCreated, 1);

    const afterFirst = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
    const realPhases = afterFirst.phases.filter((phase) => phase.id >= 0);
    assert.equal(realPhases.length, 2);
    assert.equal(realPhases[1].id, 2);

    const second = run(cwd);
    assert.equal(second.json.createdTickets, 0);
    assert.equal(second.json.phasesCreated, 0);
    assert.equal(second.json.reusedTickets, 1);

    const afterSecond = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
    assert.equal(afterSecond.phases.filter((phase) => phase.id >= 0).length, 2);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C005: a held package lock reports work and mutates nothing', () => {
  const cwd = fixture();
  try {
    fs.writeFileSync(path.join(cwd, '.conver-find.lock'), JSON.stringify({ pid: process.pid, at: Date.now() }) + '\n');
    const result = run(cwd);

    assert.equal(result.status, 10);
    assert.equal(result.json.code, 'LOCKED');
    assert.equal(fs.existsSync(path.join(cwd, 'CONVER-FIND-REPORT.json')), false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C004: an unprojectable contract becomes a named repair, not a refusal of the whole plan', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px443-e2e-unprojectable-'));
  try {
    fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
      adapter: { id: 'fixture-adapter', version: 1, scope: 'pkg-alpha', contractIdScope: 'global', elements: ['precondition', 'postcondition', 'invariant'], applicability: 'TESTABLE' },
      sources: [{ kind: 'manifest', artifact: 'CONTRACT-MANIFEST.json', clauses: [
        { contractId: 'C001', element: 'precondition', text: 'input is present' },
        { contractId: 'C001', element: 'postcondition', text: 'output is stored' },
        { contractId: 'C001', element: 'invariant', text: 'state is unchanged' },
        { contractId: 'C002', element: 'precondition', text: 'a partial contract' },
        { contractId: 'C002', element: 'postcondition', text: 'has no invariant' },
      ] }],
    }));
    fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', round: 1, metadata: {}, phases: [] }));
    fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({ version: 1, tests: [] }));

    const result = run(cwd);
    assert.equal(result.status, 10);
    assert.equal(result.json.createdTickets, 1);
    assert.equal(result.json.sinks.unprojectable, 1);
    assert.equal(result.json.unprojectable[0].code, 'OMISSION_CONTRACT_UNPROJECTABLE');
    assert.equal(result.json.unprojectable[0].contractId, 'C002');
    assert.equal(result.json.refused, undefined);

    const document = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
    const tickets = document.phases.flatMap((phase) => phase.tickets);
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].contracts[0].id, 'C001');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C006: a package with no normative source creates one repair ticket and continues', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-e2e-repair-'));
  try {
    fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', round: 1, metadata: {}, phases: [] }));
    const first = run(cwd);
    assert.equal(first.status, 10);
    assert.equal(first.json.coverageComplete, false);
    assert.equal(first.json.blockers.length > 0, true);
    assert.equal(first.json.repairs.length > 0, true);

    const afterFirst = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
    const repairTickets = afterFirst.phases.flatMap((phase) => phase.tickets).filter((ticket) => ticket.repairKey);
    assert.equal(repairTickets.length, 1);

    const second = run(cwd);
    assert.equal(second.json.repairs.length, 1);
    const afterSecond = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
    assert.equal(afterSecond.phases.flatMap((phase) => phase.tickets).filter((ticket) => ticket.repairKey).length, 1);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('C006: the same two-step semantics hold for a non-C### explicit-manifest fixture', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px437-e2e-generic-'));
  try {
    const contract = { id: 'OBL-alpha', precondition: 'the obligation is declared', postcondition: 'the obligation is proved', invariant: 'no other obligation changes' };
    const key = clauseKey({ scope: 'pkg-generic', contractId: 'OBL-alpha', element: 'precondition', text: contract.precondition });
    fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
      adapter: { id: 'generic-manifest', version: 1, scope: 'pkg-generic', contractIdScope: 'local', elements: ['precondition', 'postcondition', 'invariant'], applicability: 'TESTABLE' },
      sources: [{ kind: 'manifest', artifact: 'CONTRACT-MANIFEST.json', clauses: [
        { contractId: 'OBL-alpha', element: 'precondition', text: contract.precondition },
        { contractId: 'OBL-alpha', element: 'postcondition', text: contract.postcondition },
        { contractId: 'OBL-alpha', element: 'invariant', text: contract.invariant },
      ] }],
    }));
    fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', round: 1, metadata: {}, phases: [] }));
    fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({
      version: 1,
      tests: [{ id: 'obligation', file: 'obligation.fixture', name: 'obligation', kind: 'unit', ignored: false, annotations: ['verifies:' + key] }],
    }));

    const reportOnly = run(cwd, ['--report-only']);
    assert.equal(reportOnly.status, 10);
    assert.equal(reportOnly.json.plannedCreated, 1);

    const first = run(cwd);
    assert.equal(first.json.createdTickets, 1);
    const second = run(cwd);
    assert.equal(second.json.createdTickets, 0);
    assert.equal(second.json.phasesCreated, 0);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

/** A package whose only clause has no applicability declaration. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function dispositionFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px440-e2e-dispositions-'));
  const text = 'the obligation is declared';
  const key = clauseKey({ scope: 'pkg-alpha', contractId: 'OBL-alpha', element: 'precondition', text });
  fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
    adapter: { id: 'fixture-adapter', version: 1, scope: 'pkg-alpha', contractIdScope: 'global', elements: ['precondition'] },
    sources: [{ kind: 'manifest', artifact: 'CONTRACT-MANIFEST.json', clauses: [{ contractId: 'OBL-alpha', element: 'precondition', text }] }],
  }));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({ title: 'fixture', round: 1, metadata: {}, phases: [] }));
  fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({ version: 1, tests: [] }));
  return { cwd, key };
}

/** Write one verified NOT_APPLICABLE disposition. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function writeDisposition(cwd, key) {
  const evidence = [{ file: 'norm.md', line: 1 }];
  fs.writeFileSync(path.join(cwd, 'OMISSION-DISPOSITIONS.json'), JSON.stringify({
    version: 1,
    rules: [{ id: 'R-NA-1', kind: 'not-applicable', normativeSource: 'HANDOVER003 5.5' }],
    dispositions: [{
      key,
      status: 'NOT_APPLICABLE_VERIFIED',
      ruleId: 'R-NA-1',
      normativeSource: 'HANDOVER003 5.5',
      evidence,
      evidenceDigest: evidenceDigestOf(evidence),
    }],
  }));
}

test('C006: an unclassified clause becomes a worklist, then a verified disposition completes', () => {
  const { cwd, key } = dispositionFixture();
  try {
    const reportOnly = run(cwd, ['--report-only']);
    assert.equal(reportOnly.status, 10);
    assert.equal(reportOnly.json.remainder, 1);
    assert.equal(reportOnly.json.worklist.unclassified, 1);
    assert.equal(fs.existsSync(path.join(cwd, 'CONTRACT-INVENTORY.json')), false);
    assert.equal(fs.existsSync(path.join(cwd, 'OMISSION-CLASSIFICATION-WORKLIST.json')), false);

    writeDisposition(cwd, key);
    const applied = run(cwd);
    assert.equal(applied.status, 0);
    const coverage = JSON.parse(fs.readFileSync(path.join(cwd, 'CONTRACT-COVERAGE.json'), 'utf8'));
    assert.equal(coverage.remainder.remainder, 0);
    assert.equal(fs.existsSync(path.join(cwd, 'OMISSION-CONVERGENCE-V3.json')), true);

    const gate = spawnSync(process.execPath, [GATE, '--cwd=' + cwd, '--tickets=Tickets.json', '--require-converged'], { cwd, encoding: 'utf8' });
    assert.equal(gate.status, 0);
    assert.equal(JSON.parse(gate.stdout).predicateVersion, 3);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C004
// [::TICKET::] PX-444: the v3 runner writes provenance and the package note to Tickets.json.
test('PX-444: the runner writes splitReason, created_at, generic notes and the package note', () => {
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px444-e2e-'));
  try {
    writeMeasuredFixture(cwd, { version: 1, notes: 'Project laboratory clause' });

    const result = run(cwd);
    assert.equal(result.status, 10);
    assert.ok(result.json.createdTickets > 1, 'the measured work needs more than one ticket');

    const document = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'));
    const omissionTickets = document.phases
      .flatMap((phase) => (phase.tickets ?? []))
      .filter((ticket) => ticket.origin?.kind === 'omission');
    assert.ok(omissionTickets.length > 1, 'the plan created omission tickets');

    for (const ticket of omissionTickets) {
      assert.equal(ticket.splitReason, 'budget');
      assert.match(ticket.created_at, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(ticket.notes.includes('Affected contracts:'));
      assert.ok(ticket.notes.includes('re-running the coverage flow. Project laboratory clause'));
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

/** The contract count that exceeds the v4 measured-work ceilings. */
const MEASURED_CONTRACT_COUNT = 9;

/**
 * Write a measured package whose 27 clauses need more than one omission ticket.
 *
 * @param {string} cwd — temporary package directory
 * @param {object|null} noteDocument — OMISSION-TICKET-NOTES.json content, or null
 */
// [::TICKET::] PX-444: the measured fixture shared by the provenance cases.
// [::TICKET::] PX-444 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-444 --for-spec --no-implementation-order`.
function writeMeasuredFixture(cwd, noteDocument) {
  const contracts = Array.from({ length: MEASURED_CONTRACT_COUNT }, (_, index) => {
    const id = 'C' + String(index + 1).padStart(3, '0');
    return { id, precondition: id + ' precondition', postcondition: id + ' postcondition', invariant: id + ' invariant' };
  });
  fs.writeFileSync(path.join(cwd, 'CONTRACT-INVENTORY-CONFIG.json'), JSON.stringify({
    adapter: { id: 'fixture-adapter', version: 1, scope: 'pkg-alpha', contractIdScope: 'global', elements: ['precondition', 'postcondition', 'invariant'], applicability: 'TESTABLE' },
    sources: [{ kind: 'graph', artifact: 'RFC-GRAPH.json', edges: [{ id: 'E001', contracts }] }],
  }));
  fs.writeFileSync(path.join(cwd, 'RFC-GRAPH.json'), JSON.stringify({ edges: [{ id: 'E001', contracts }] }));
  fs.writeFileSync(path.join(cwd, 'Tickets.json'), JSON.stringify({
    title: 'fixture',
    round: 1,
    metadata: {},
    phases: [{ id: 1, name: 'P1', tickets: [{ id: 1, phaseId: 1, status: 'reviewed', contracts }] }],
  }));
  fs.writeFileSync(path.join(cwd, 'TEST-MANIFEST.json'), JSON.stringify({ version: 1, tests: [] }));
  if (noteDocument !== null) {
    fs.writeFileSync(path.join(cwd, 'OMISSION-TICKET-NOTES.json'), JSON.stringify(noteDocument));
  }
}

// @verifies C004
// [::TICKET::] PX-444: a malformed package note is a named refusal and writes no ticket.
test('PX-444: a malformed package note is a named refusal and leaves Tickets.json unchanged', () => {
  for (const [noteDocument, expectedCode] of [
    [{ version: 2, notes: 'x' }, 'UNSUPPORTED_VERSION'],
    [{ version: 1, notes: '   ' }, 'OMISSION_TICKET_NOTES_INVALID'],
  ]) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px444-e2e-bad-note-'));
    try {
      writeMeasuredFixture(cwd, noteDocument);
      const before = fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8');

      const result = run(cwd);
      assert.equal(result.status, 10);
      assert.equal(result.json.code, expectedCode);
      assert.equal(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'), before);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }
});

// @verifies C005
// [::TICKET::] PX-444: without a package note the generic provenance is unchanged.
test('PX-444: without a package note the generic provenance is unchanged', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'px444-e2e-no-note-'));
  try {
    writeMeasuredFixture(cwd, null);

    const result = run(cwd);
    assert.equal(result.status, 10);
    const omissionTickets = JSON.parse(fs.readFileSync(path.join(cwd, 'Tickets.json'), 'utf8'))
      .phases
      .flatMap((phase) => (phase.tickets ?? []))
      .filter((ticket) => ticket.origin?.kind === 'omission');
    assert.ok(omissionTickets.length > 1);

    for (const ticket of omissionTickets) {
      assert.equal(ticket.notes.includes('Project laboratory clause'), false);
      assert.ok(ticket.notes.startsWith('Omission ticket created by the /find-omissions v3 measured-coverage flow.'));
      assert.ok(ticket.notes.endsWith('re-running the coverage flow.'));
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
