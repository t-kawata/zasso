// PX-342 @verifies C001 @verifies C002 @verifies C003 @verifies C004
// PX-343 @verifies C004
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
    assert.deepEqual(output.workBudget.tickets[0].workload, {
      operations: 2,
      sequenceSteps: 0,
      contracts: 0,
      files: 2,
      kinds: 2,
    });
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
    assert.equal(output.workBudget.skipped, 'no-budget-gate');
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-343 --for-spec --no-implementation-order`.
test('C004 an irreducible node reports WORK_BUDGET_INFEASIBLE, not a repeated overage', () => {
  const pkg = fixturePackage();
  try {
    const graphPath = path.join(pkg.root, 'RFC-GRAPH.json');
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    graph.nodes.find((node) => node.id === 'N0001').unitIds.push('op-G', 'op-H');
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
    const viewPath = path.join(pkg.root, 'SEQUENCES.json');
    const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
    view.ownedOperationUnits.push(
      { unitId: 'op-G', operationId: 'G', roleCandidate: 'implementer' },
      { unitId: 'op-H', operationId: 'H', roleCandidate: 'implementer' },
    );
    fs.writeFileSync(viewPath, JSON.stringify(view, null, 2));
    const budgetPath = path.join(pkg.root, 'ticket-work-budget.json');
    fs.writeFileSync(budgetPath, JSON.stringify({
      ...BUDGET,
      budget: { ...BUDGET.budget, operations: 1 },
    }, null, 2));
    const result = runGate(pkg, [
      ticket('first', ['N0001', 'N0002']),
      ticket('second', ['N0003', 'N0004']),
      ticket('third', ['N0005', 'N0006']),
    ]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /WORK_BUDGET_INFEASIBLE/);
    assert.doesNotMatch(result.stderr, /TICKET_WORK_OVER_BUDGET: P0-1 /);
    assert.doesNotMatch(result.stderr, /TICKET_COUNT_BELOW_WORK_MINIMUM/);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

// PX-347 @verifies C001 @verifies C003 @verifies C005 @verifies C006 @verifies C007
const V2_BUDGET = {
  version: 2,
  components: [
    'operations', 'sequenceSteps', 'ownedContracts', 'files',
    'testUnit', 'testIntegration', 'modules',
  ],
  budget: {
    operations: 2,
    sequenceSteps: 2,
    ownedContracts: 1,
    files: 2,
    testUnit: 2,
    testIntegration: 1,
    modules: 1,
  },
  excluded: ['providerBoundaryContracts', 'kinds', 'graphNodes'],
  provenance: 'fixture v2 budget',
};

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function fixtureV2Package({ withView = true, withFileForN0001 = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px347-budget-'));
  const ticketsPath = path.join(root, 'Tickets.json');
  writeJson(ticketsPath, {
    title: 'PX-347 fixture',
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
      title: `§1 ${id}`,
      kind: 'requirement',
      unitIds: [`op-${String.fromCharCode(65 + index)}`],
    })),
    edges: [],
  });
  const units = {};
  const fileNodes = [];
  ['N0001', 'N0002', 'N0003', 'N0004', 'N0005', 'N0006'].forEach((id, index) => {
    const letter = String.fromCharCode(65 + index);
    if (id === 'N0001' && !withFileForN0001) return;
    const fileName = `${String.fromCharCode(97 + index)}.js`;
    units[`op-${letter}`] = { nodeIds: [id], paths: [`src/${fileName}`] };
    fileNodes.push({ name: fileName, type: 'file', mappedNodeIds: [{ nodeId: id }] });
  });
  writeJson(path.join(root, 'RFC-Dirs-Tree.json'), {
    trees: {
      js: { name: 'src', type: 'directory', children: fileNodes },
    },
    distribution: { units },
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
  writeJson(budgetPath, V2_BUDGET);
  return { root, ticketsPath, budgetPath };
}

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function fixtureV2SingleNodePackage() {
  const pkg = fixtureV2Package();
  const graphPath = path.join(pkg.root, 'RFC-GRAPH.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  graph.nodes = graph.nodes.filter((node) => node.id === 'N0001');
  graph.nodes[0].unitIds.push('op-G', 'op-H');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
  const dirsPath = path.join(pkg.root, 'RFC-Dirs-Tree.json');
  const dirs = JSON.parse(fs.readFileSync(dirsPath, 'utf8'));
  dirs.distribution.units['op-G'] = { nodeIds: ['N0001'], paths: ['src/g.js'] };
  dirs.distribution.units['op-H'] = { nodeIds: ['N0001'], paths: ['src/h.js'] };
  fs.writeFileSync(dirsPath, JSON.stringify(dirs, null, 2));
  const viewPath = path.join(pkg.root, 'SEQUENCES.json');
  const view = JSON.parse(fs.readFileSync(viewPath, 'utf8'));
  view.ownedOperationUnits.push(
    { unitId: 'op-G', operationId: 'G', roleCandidate: 'implementer' },
    { unitId: 'op-H', operationId: 'H', roleCandidate: 'implementer' },
  );
  fs.writeFileSync(viewPath, JSON.stringify(view, null, 2));
  const budgetPath = path.join(pkg.root, 'ticket-work-budget.json');
  fs.writeFileSync(budgetPath, JSON.stringify({
    ...V2_BUDGET,
    budget: { ...V2_BUDGET.budget, operations: 1 },
  }, null, 2));
  const ticketsPath = path.join(pkg.root, 'Tickets.json');
  const tickets = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  tickets.phases[0].nodeIds = ['N0001'];
  fs.writeFileSync(ticketsPath, JSON.stringify(tickets, null, 2));
  return pkg;
}

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function v2Ticket(title, nodeIds, extra = {}) {
  return { title, nodeIds, splitReason: 'cohesion', ...extra };
}

test('C001 three balanced tickets pass the v2 gate and report the upper bound', () => {
  const pkg = fixtureV2Package();
  try {
    const result = runGate(pkg, [
      v2Ticket('first', ['N0001', 'N0002']),
      v2Ticket('second', ['N0003', 'N0004']),
      v2Ticket('third', ['N0005', 'N0006']),
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.workBudget.mode, 'v2');
    assert.equal(output.workBudget.minimumWorkTickets, 3);
    assert.equal(output.workBudget.upperBoundTickets, 3);
    assert.deepEqual(output.workBudget.acceptedRefusals, []);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C003 a discretionary over-split without merge evidence is refused', () => {
  const pkg = fixtureV2Package();
  try {
    const result = runGate(pkg, [
      v2Ticket('first', ['N0001', 'N0002']),
      v2Ticket('second', ['N0003', 'N0004']),
      v2Ticket('third', ['N0005']),
      v2Ticket('fourth', ['N0006']),
    ]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /MERGE_ATTEMPT_MISSING|TICKET_COUNT_ABOVE_MERGE_EVIDENCE/);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C003 a valid discretionary refusal passes', () => {
  const pkg = fixtureV2Package();
  try {
    const attempt = {
      left: ['N0005'],
      right: ['N0006'],
      decision: 'refused',
      trigger: 'cohesion',
      evidence: 'The two singleton behaviours change independently.',
      behaviours: ['identity derivation', 'signature verification'],
    };
    const result = runGate(pkg, [
      v2Ticket('first', ['N0001', 'N0002']),
      v2Ticket('second', ['N0003', 'N0004']),
      v2Ticket('third', ['N0005']),
      v2Ticket('fourth', ['N0006'], { mergeAttempts: [attempt] }),
    ]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.workBudget.acceptedRefusals.length, 1);
    assert.equal(output.workBudget.upperBoundTickets, 4);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C003 a cohesion refusal with fewer than two behaviours is refused', () => {
  const pkg = fixtureV2Package();
  try {
    const attempt = {
      left: ['N0005'],
      right: ['N0006'],
      decision: 'refused',
      trigger: 'cohesion',
      evidence: 'They differ.',
      behaviours: ['only one'],
    };
    const result = runGate(pkg, [
      v2Ticket('first', ['N0001', 'N0002']),
      v2Ticket('second', ['N0003', 'N0004']),
      v2Ticket('third', ['N0005']),
      v2Ticket('fourth', ['N0006'], { mergeAttempts: [attempt] }),
    ]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /MERGE_TRIGGER_INVALID/);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C005 an irreducible node is accepted in v2', () => {
  const pkg = fixtureV2SingleNodePackage();
  try {
    const result = runGate(pkg, [v2Ticket('only', ['N0001'])]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.workBudget.acceptedIrreducible.length > 0, true);
    assert.equal(output.workBudget.acceptedIrreducible[0].nodeId, 'N0001');
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C007 a non-record file-less ticket fails unless it names the missing file', () => {
  const pkg = fixtureV2Package({ withFileForN0001: false });
  try {
    const missing = runGate(pkg, [
      v2Ticket('first', ['N0001']),
      v2Ticket('second', ['N0002']),
      v2Ticket('third', ['N0003', 'N0004']),
      v2Ticket('fourth', ['N0005', 'N0006']),
    ]);
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.match(missing.stderr, /EMPTY_DEFAULT_FILES/);

    const refusal = {
      left: ['N0001'],
      right: ['N0002'],
      decision: 'refused',
      trigger: 'cohesion',
      evidence: 'The record artifact and the implementation file are unrelated behaviours.',
      behaviours: ['record artifact', 'implementation file'],
    };
    const explained = runGate(pkg, [
      v2Ticket('first', ['N0001'], { unlistedFileReason: 'crate root absent from Dirs-Tree' }),
      v2Ticket('second', ['N0002'], { mergeAttempts: [refusal] }),
      v2Ticket('third', ['N0003', 'N0004']),
      v2Ticket('fourth', ['N0005', 'N0006']),
    ]);
    assert.equal(explained.status, 0, explained.stdout + explained.stderr);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C006 no flag reports skipped:no-budget-gate in v2', () => {
  const pkg = fixtureV2Package();
  try {
    const result = runGate(pkg, [
      v2Ticket('first', ['N0001', 'N0002']),
      v2Ticket('second', ['N0003', 'N0004']),
      v2Ticket('third', ['N0005', 'N0006']),
    ], { enforce: false });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.workBudget, { skipped: 'no-budget-gate' });
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C006 a v2 package without a view reports skipped:no-distribution', () => {
  const pkg = fixtureV2Package({ withView: false });
  try {
    const result = runGate(pkg, [
      v2Ticket('first', ['N0001', 'N0002']),
      v2Ticket('second', ['N0003', 'N0004']),
      v2Ticket('third', ['N0005', 'N0006']),
    ], { withView: false });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(output.workBudget, { skipped: 'no-distribution' });
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});

test('C006 an unreadable budget is WORK_BUDGET_INVALID, not missing', () => {
  const pkg = fixtureV2SingleNodePackage();
  try {
    fs.writeFileSync(pkg.budgetPath, '{invalid json');
    const result = runGate(pkg, [v2Ticket('only', ['N0001'])]);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /WORK_BUDGET_INVALID/);
    assert.doesNotMatch(result.stderr, /WORK_BUDGET_MISSING/);
  } finally {
    fs.rmSync(pkg.root, { recursive: true, force: true });
  }
});
