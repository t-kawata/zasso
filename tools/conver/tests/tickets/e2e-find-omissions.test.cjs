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

const RUNNER = path.resolve(__dirname, '../../.claude/scripts/tickets/find-omissions-run.js');

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
