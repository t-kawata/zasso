// PX-342 @verifies C001 @verifies C002 @verifies C003 @verifies C004
// The split gate is only useful if it refuses to write an overloaded or unreasoned
// ticket set. These tests drive the real CLI over a temporary package.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/tickets/add-tickets-for-phase.js');
const BUDGET = {
  version: 1,
  components: ['operations', 'sequenceSteps', 'contracts', 'files', 'kinds'],
  budget: { operations: 2, sequenceSteps: 2, contracts: 1, files: 2, kinds: 2 },
  provenance: 'fixture budget',
};

// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function fixturePackage({ withView = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px342-budget-'));
  const ticketsPath = path.join(root, 'Tickets.json');
  writeJson(ticketsPath, {
    title: 'PX-342 fixture',
    round: 1,
    metadata: { source: 'RFC.md', generatedAt: '2026-11-02' },
    phases: [{
      id: 0,
      name: 'P0',
      summary: 'fixture phase',
      nodeIds: ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006'],
      tickets: [],
    }],
  });
  writeJson(path.join(root, 'RFC-GRAPH.json'), {
    sourceFile: 'RFC.md',
    nodes: ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006'].map((id, index) => ({
      id,
      kind: `kind-${index + 1}`,
      unitIds: [`op-${String.fromCharCode(65 + index)}`],
    })),
    edges: [],
  });
  writeJson(path.join(root, 'RFC-Dirs-Tree.json'), {
    distribution: {
      units: Object.fromEntries(
        ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006'].map((id, index) => {
          const unitId = `op-${String.fromCharCode(65 + index)}`;
          return [unitId, { nodeIds: [id], paths: [`src/${String.fromCharCode(97 + index)}.rs`] }];
        }),
      ),
    },
  });
  if (withView) {
    writeJson(path.join(root, 'SEQUENCES.json'), {
      packageId: 'pkg-1',
      ownedOperationUnits: ['A', 'B', 'C', 'D', 'E', 'F'].map((letter) => ({
        unitId: `op-${letter}`,
        operationId: letter,
        roleCandidate: 'implementer',
      })),
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    });
  }
  const budgetPath = path.join(root, 'ticket-work-budget.json');
  writeJson(budgetPath, BUDGET);
  return { root, ticketsPath, budgetPath };
}

// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function runGate(pkg, tickets, { enforce = true, withView = true } = {}) {
  const args = [SCRIPT, `--tickets=${pkg.ticketsPath}`, 'P0'];
  if (enforce) args.push('--enforce-work-budget', `--work-budget=${pkg.budgetPath}`);
  return spawnSync(process.execPath, args, {
    cwd: pkg.root,
    encoding: 'utf8',
    input: JSON.stringify(tickets),
  });
}

// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function ticket(title, nodeIds, splitReason = 'cohesion') {
  return { title, nodeIds, splitReason };
}

test('C004 two tickets for six operations fail the work minimum and write nothing', () => {
  const pkg = fixturePackage();
  try {
    const before = fs.readFileSync(pkg.ticketsPath, 'utf8');
    const result = runGate(pkg, [
      ticket('first', ['N0001', 'N0002', 'N0003']),
      ticket('second', ['N0004', 'N0005', 'N0006']),
    ]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /TICKET_COUNT_BELOW_WORK_MINIMUM|TICKET_WORK_OVER_BUDGET/);
    assert.equal(fs.readFileSync(pkg.ticketsPath, 'utf8'), before);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C001 three balanced tickets pass and report workload, budget and minimum count', () => {
  const pkg = fixturePackage();
  try {
    const result = runGate(pkg, [
      ticket('first', ['N0001', 'N0002']),
      ticket('second', ['N0003', 'N0004']),
      ticket('third', ['N0005', 'N0006']),
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.workBudget.minimumWorkTickets, 3);
    assert.deepEqual(output.workBudget.budget, BUDGET.budget);
    assert.equal(output.workBudget.phaseWorkload.operations, 6);
    assert.equal(output.workBudget.tickets.length, 3);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C001 the canonical P0 form with the flag after the phase passes', () => {
  const pkg = fixturePackage();
  try {
    const result = spawnSync(process.execPath, [
      SCRIPT, 'P0', '--enforce-work-budget', `--work-budget=${pkg.budgetPath}`,
    ], {
      cwd: pkg.root,
      encoding: 'utf8',
      input: JSON.stringify([
        ticket('first', ['N0001', 'N0002']),
        ticket('second', ['N0003', 'N0004']),
        ticket('third', ['N0005', 'N0006']),
      ]),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.phaseKey, 'P0');
    assert.equal(output.workBudget.minimumWorkTickets, 3);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C003 a multi-ticket phase without splitReason is refused', () => {
  const pkg = fixturePackage();
  try {
    const result = runGate(pkg, [
      ticket('first', ['N0001', 'N0002']),
      { title: 'second', nodeIds: ['N0003', 'N0004'] },
      ticket('third', ['N0005', 'N0006']),
    ]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /SPLIT_REASON_MISSING/);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C004 a package without a view reports skipped:no-distribution', () => {
  const pkg = fixturePackage({ withView: false });
  try {
    const result = runGate(pkg, [
      ticket('first', ['N0001', 'N0002']),
      ticket('second', ['N0003', 'N0004']),
      ticket('third', ['N0005', 'N0006']),
    ], { withView: false });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.workBudget, { skipped: 'no-distribution' });
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('backward compatibility: without the flag the old two-ticket partition still passes', () => {
  const pkg = fixturePackage();
  try {
    const result = runGate(pkg, [
      ticket('first', ['N0001', 'N0002', 'N0003']),
      ticket('second', ['N0004', 'N0005', 'N0006']),
    ], { enforce: false });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal('workBudget' in output, false);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});
