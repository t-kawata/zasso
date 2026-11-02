// PX-342 @verifies C001 @verifies C002 @verifies C003 @verifies C004
// The workload model decides how much implementation work one ticket carries. These
// tests pin the five components, the minimum-count formula and the four findings the
// split gate acts on.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKLOAD_COMPONENTS,
  SPLIT_REASONS,
  workloadOfNodes,
  workloadOfTicket,
  workloadOfPhase,
  minimumTicketCount,
  parseWorkBudget,
  validateTicketWorkload,
} from '../../.claude/scripts/tickets/lib/ticket-workload.js';

// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function fixtureContext() {
  const graph = {
    nodes: [
      { id: 'N0001', kind: 'requirement', unitIds: ['op-A', 'ctr-boundary-001'] },
      { id: 'N0002', kind: 'api_contract', unitIds: ['op-B', 'seq-A-1'] },
      { id: 'N0003', kind: 'data_model', unitIds: ['op-C', 'seq-C-1'] },
      { id: 'N0004', kind: 'state_machine', unitIds: ['op-D', 'op-E'] },
    ],
  };
  const view = {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer' },
      { unitId: 'op-B', operationId: 'B', roleCandidate: 'implementer' },
      { unitId: 'op-C', operationId: 'C', roleCandidate: 'consumer' },
      { unitId: 'op-D', operationId: 'D', roleCandidate: 'implementer' },
      { unitId: 'op-E', operationId: 'E', roleCandidate: 'implementer' },
    ],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      steps: [{ stepId: 's1', operationId: 'A', order: 0 }],
    }],
    crossBoundarySequenceUnits: [{
      unitId: 'seq-C-1',
      sequenceId: 'C-1',
      steps: [{ stepId: 'sC', operationId: 'C', order: 0 }],
    }],
    obligationUnits: [
      { unitId: 'ctr-boundary-001', kind: 'contract', subject: 'boundary-001' },
    ],
  };
  const dirsTree = {
    distribution: {
      units: {
        'op-A': { nodeIds: ['N0001'], paths: ['src/a.rs'] },
        'op-B': { nodeIds: ['N0002'], paths: ['src/b.rs'] },
        'op-C': { nodeIds: ['N0003'], paths: ['src/c.rs'] },
        'op-D': { nodeIds: ['N0004'], paths: ['src/d.rs'] },
        'op-E': { nodeIds: ['N0004'], paths: ['src/e.rs'] },
        'seq-A-1': { nodeIds: ['N0002'], paths: ['src/b.rs'] },
        'ctr-boundary-001': { nodeIds: ['N0001'], paths: ['src/b.rs'] },
      },
    },
  };
  return { graph, dirsTree, view, nodeToFileMap: {} };
}

// [::TICKET::] PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-342 --for-spec --no-implementation-order`.
function fixtureBudget() {
  return { operations: 2, sequenceSteps: 2, contracts: 1, files: 2, kinds: 1 };
}

test('C001 a ticket counts implement operations, steps, contracts, files and kinds', () => {
  const context = fixtureContext();
  const workload = workloadOfTicket({ nodeIds: ['N0001', 'N0002'] }, context);
  assert.deepEqual(workload, {
    operations: 2,
    sequenceSteps: 1,
    contracts: 1,
    files: 2,
    kinds: 2,
  });
  assert.equal(WORKLOAD_COMPONENTS.length, 5);
  assert.equal(Object.values(workload).every((value) => Number.isInteger(value) && value >= 0), true);
});

test('C001 consumer operations and their steps are not implementation work', () => {
  const context = fixtureContext();
  const workload = workloadOfNodes(['N0003'], context);
  assert.equal(workload.operations, 0);
  assert.equal(workload.sequenceSteps, 0);
});

test('C001 default_files is the exact leaf-file set when present', () => {
  const context = fixtureContext();
  const workload = workloadOfTicket({
    nodeIds: ['N0001', 'N0002'],
    default_files: ['src/only.rs'],
  }, context);
  assert.equal(workload.files, 1);
});

test('C001 a phase with no tickets is measured from its nodes', () => {
  const context = fixtureContext();
  assert.deepEqual(
    workloadOfPhase({ id: 0, nodeIds: ['N0001', 'N0002'], tickets: [] }, context),
    workloadOfNodes(['N0001', 'N0002'], context),
  );
});

test('C001 a phase with tickets is the sum of its ticket workloads', () => {
  const context = fixtureContext();
  const phase = {
    id: 0,
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { id: 1, nodeIds: ['N0001'] },
      { id: 2, nodeIds: ['N0002'] },
    ],
  };
  const sum = { operations: 0, sequenceSteps: 0, contracts: 0, files: 0, kinds: 0 };
  for (const ticket of phase.tickets) {
    const workload = workloadOfTicket(ticket, context);
    for (const component of WORKLOAD_COMPONENTS) sum[component] += workload[component];
  }
  assert.deepEqual(workloadOfPhase(phase, context), sum);
});

test('C002 minimumTicketCount is the component-wise ceiling and never below one', () => {
  const budget = fixtureBudget();
  const empty = { operations: 0, sequenceSteps: 0, contracts: 0, files: 0, kinds: 0 };
  assert.equal(minimumTicketCount(empty, budget), 1);
  assert.equal(minimumTicketCount({ ...empty, operations: 5 }, budget), 3);
  assert.equal(minimumTicketCount({ ...empty, operations: 4, files: 4 }, budget), 2);
  assert.equal(
    minimumTicketCount({ ...empty, operations: 9 }, budget)
      >= minimumTicketCount({ ...empty, operations: 5 }, budget),
    true,
  );
  assert.equal(minimumTicketCount({ ...empty, operations: 5 }, { ...budget, operations: 10 }), 1);
});

test('C002 a non-positive budget component is rejected', () => {
  const budget = { ...fixtureBudget(), files: 0 };
  assert.throws(() => minimumTicketCount({ ...budget, files: 2 }, budget), /budget component/);
});

test('C003 every ticket in a multi-ticket phase names a valid reason', () => {
  const context = fixtureContext();
  const phase = {
    id: 0,
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { id: 1, phaseId: 0, nodeIds: ['N0001'] },
      { id: 2, phaseId: 0, nodeIds: ['N0002'] },
    ],
  };
  assert.ok(validateTicketWorkload(phase, fixtureBudget(), context)
    .some((finding) => finding.code === 'SPLIT_REASON_MISSING'));

  phase.tickets.forEach((ticket) => { ticket.splitReason = 'cohesion'; });
  assert.equal(validateTicketWorkload(phase, fixtureBudget(), context)
    .some((finding) => finding.code === 'SPLIT_REASON_MISSING'), false);

  const invalid = {
    ...phase,
    tickets: phase.tickets.map((ticket) => ({ ...ticket, splitReason: 'because' })),
  };
  assert.ok(validateTicketWorkload(invalid, fixtureBudget(), context)
    .some((finding) => finding.code === 'SPLIT_REASON_INVALID'));
  assert.deepEqual(SPLIT_REASONS, [
    'tdd-order', 'disjoint-io', 'release-boundary', 'ownership-boundary', 'cohesion',
  ]);
});

test('C003 a single-ticket phase needs no splitReason', () => {
  const context = fixtureContext();
  const phase = {
    id: 0,
    nodeIds: ['N0001'],
    tickets: [{ id: 1, phaseId: 0, nodeIds: ['N0001'] }],
  };
  assert.equal(validateTicketWorkload(phase, fixtureBudget(), context)
    .some((finding) => finding.code === 'SPLIT_REASON_MISSING'), false);
});

test('C004 an over-budget ticket names the component, actual value and budget', () => {
  const context = fixtureContext();
  const phase = {
    id: 0,
    nodeIds: ['N0001', 'N0002'],
    tickets: [{ id: 1, phaseId: 0, nodeIds: ['N0001', 'N0002'], splitReason: 'cohesion' }],
  };
  const findings = validateTicketWorkload(phase, { ...fixtureBudget(), files: 1 }, context);
  assert.ok(findings.some((finding) =>
    finding.code === 'TICKET_WORK_OVER_BUDGET'
    && finding.component === 'files'
    && finding.actual === 2
    && finding.budget === 1));
});

test('C004 a single node above budget is irreducible and names the node', () => {
  const context = fixtureContext();
  const phase = {
    id: 0,
    nodeIds: ['N0004'],
    tickets: [{ id: 1, phaseId: 0, nodeIds: ['N0004'], splitReason: 'cohesion' }],
  };
  const findings = validateTicketWorkload(phase, { ...fixtureBudget(), files: 1 }, context);
  assert.ok(findings.some((finding) =>
    finding.code === 'TICKET_WORK_IRREDUCIBLE'
    && finding.nodeId === 'N0004'
    && finding.component === 'files'));
});

test('C004 too few tickets for the phase workload is below the work minimum', () => {
  const context = fixtureContext();
  const phase = {
    id: 0,
    nodeIds: ['N0001', 'N0002', 'N0003', 'N0004'],
    tickets: [
      { id: 1, phaseId: 0, nodeIds: ['N0001', 'N0002'], splitReason: 'cohesion' },
      { id: 2, phaseId: 0, nodeIds: ['N0003', 'N0004'], splitReason: 'cohesion' },
    ],
  };
  const findings = validateTicketWorkload(
    phase,
    { operations: 1, sequenceSteps: 1, contracts: 1, files: 1, kinds: 1 },
    context,
  );
  assert.ok(findings.some((finding) =>
    finding.code === 'TICKET_COUNT_BELOW_WORK_MINIMUM'
    && finding.actual === 2
    && finding.minimum >= 3));
});

test('parseWorkBudget accepts a versioned five-component budget with provenance', () => {
  const parsed = parseWorkBudget({
    version: 1,
    components: [...WORKLOAD_COMPONENTS],
    budget: fixtureBudget(),
    provenance: 'measured from reviewed tickets',
  });
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.budget, fixtureBudget());
});

test('parseWorkBudget rejects a wrong version, missing component, or non-positive ceiling', () => {
  const base = {
    version: 1,
    components: [...WORKLOAD_COMPONENTS],
    budget: fixtureBudget(),
    provenance: 'measured',
  };
  assert.equal(parseWorkBudget({ ...base, version: 2 }).valid, false);
  assert.equal(parseWorkBudget({ ...base, components: ['operations'] }).valid, false);
  assert.equal(parseWorkBudget({ ...base, budget: { ...base.budget, files: 0 } }).valid, false);
  assert.equal(parseWorkBudget({ ...base, provenance: '' }).valid, false);
});
