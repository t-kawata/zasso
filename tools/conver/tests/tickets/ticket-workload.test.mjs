// PX-347 @verifies C001 @verifies C002 @verifies C003 @verifies C004
// PX-347 @verifies C005 @verifies C006 @verifies C007 @verifies C008
// The v2 workload sizes implementation work only. Provider boundary units, node
// kinds and graph nodes are metadata. The legacy v1 helpers keep the old five
// components for backward-compatible budget files.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKLOAD_COMPONENTS,
  LEGACY_WORKLOAD_COMPONENTS,
  SPLIT_REASONS,
  workloadOfNodes,
  workloadOfTicket,
  workloadOfPhase,
  legacyWorkloadOfNodes,
  legacyWorkloadOfTicket,
  legacyWorkloadOfPhase,
  minimumTicketCount,
  maximumTicketCount,
  parseWorkBudget,
  validateTicketWorkload,
  analyzeTicketWorkload,
  collectMergeFindings,
  partitionFindings,
  collectPartitionFindings,
} from '../../.claude/scripts/tickets/lib/ticket-workload.js';

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
// [::TICKET::] PX-394 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-394 --for-spec --no-implementation-order`.
function fixtureContext() {
  const graph = {
    nodes: [
      { id: 'N0001', kind: 'requirement', unitIds: ['op-A', 'ctr-boundary-001'] },
      { id: 'N0002', kind: 'api_contract', unitIds: ['op-B', 'seq-A-1', 'ctr-op-001'] },
      { id: 'N0003', kind: 'data_model', unitIds: ['op-C', 'seq-C-1'] },
      { id: 'N0004', kind: 'state_machine', unitIds: ['op-D', 'op-E'] },
      { id: 'N0005', kind: 'architecture', unitIds: [] },
    ],
    edges: [],
  };
  const view = {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', ownerPackageIds: ['pkg-1'] },
      { unitId: 'op-B', operationId: 'B', roleCandidate: 'implementer', ownerPackageIds: ['pkg-1'] },
      { unitId: 'op-C', operationId: 'C', roleCandidate: 'consumer', ownerPackageIds: ['pkg-1'] },
      { unitId: 'op-D', operationId: 'D', roleCandidate: 'implementer', ownerPackageIds: ['pkg-1'] },
      { unitId: 'op-E', operationId: 'E', roleCandidate: 'implementer', ownerPackageIds: ['pkg-1'] },
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
      { unitId: 'ctr-boundary-001', kind: 'contract', subject: 'boundary-001', ownerPackageIds: ['pkg-1'] },
      { unitId: 'ctr-op-001', kind: 'contract', subject: 'operation-001', ownerPackageIds: ['pkg-1'] },
    ],
  };
  const dirsTree = {
    distribution: {
      units: {
        'op-A': { nodeIds: ['N0001'], paths: ['src/a.js'] },
        'op-B': { nodeIds: ['N0002'], paths: ['src/api/b.js'] },
        'op-C': { nodeIds: ['N0003'], paths: ['src/c.js'] },
        'op-D': { nodeIds: ['N0004'], paths: ['src/d.js'] },
        'op-E': { nodeIds: ['N0004'], paths: ['src/e.js'] },
        'seq-A-1': { nodeIds: ['N0002'], paths: ['src/api/b.js'] },
        'ctr-boundary-001': { nodeIds: ['N0001'], paths: ['src/api', 'src/api/b.js', 'src/api/c.js'] },
        'ctr-op-001': { nodeIds: ['N0002'], paths: ['src/api/b.js'] },
      },
    },
  };
  return { graph, dirsTree, view, nodeToFileMap: {} };
}

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function looseBudget(overrides = {}) {
  return {
    operations: 100,
    sequenceSteps: 100,
    ownedContracts: 100,
    files: 100,
    testUnit: 100,
    testIntegration: 100,
    modules: 100,
    ...overrides,
  };
}

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function tightOperationsBudget() {
  return looseBudget({ operations: 1 });
}

// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
function phaseWithTickets({ nodeIds, tickets, edges = [] }) {
  return {
    phase: {
      id: 0,
      name: 'P0',
      nodeIds,
      tickets: tickets.map((ticket, index) => ({
        id: index + 1,
        phaseId: 0,
        ...ticket,
      })),
    },
    context: { ...fixtureContext(), graph: { ...fixtureContext().graph, edges } },
  };
}

test('C001 v2 workload counts implementation work only', () => {
  const workload = workloadOfTicket({
    nodeIds: ['N0001', 'N0002'],
    default_files: ['src/a.js', 'src/api/b.js'],
    testUnit: ['UT: a', 'UT: b'],
    testIntegration: ['IT: c'],
  }, fixtureContext());

  assert.deepEqual(workload, {
    operations: 2,
    sequenceSteps: 1,
    ownedContracts: 1,
    files: 2,
    testUnit: 2,
    testIntegration: 1,
    modules: 2,
  });
  assert.equal('contracts' in workload, false);
  assert.equal('kinds' in workload, false);
  assert.equal(WORKLOAD_COMPONENTS.length, 7);
});

test('C001 provider boundary units and kinds do not contribute to v2 workload', () => {
  const context = fixtureContext();
  const workload = workloadOfNodes(['N0001'], context);
  assert.equal(workload.operations, 1);
  assert.equal(workload.ownedContracts, 0);
  assert.equal(workload.files, 1);
  assert.equal(workload.modules, 1);
  assert.equal(workload.testUnit, 0);
  assert.equal(workload.testIntegration, 0);
});

test('C001 default_files is the exact leaf-file set and boundary paths do not inflate it', () => {
  const context = fixtureContext();
  const workload = workloadOfTicket({
    nodeIds: ['N0001', 'N0002'],
    default_files: ['src/only.js'],
  }, context);
  assert.equal(workload.files, 1);
  assert.equal(workload.modules, 1);
});

test('C001 modules are the distinct top-level directories of implementation files', () => {
  const context = fixtureContext();
  const workload = workloadOfTicket({
    nodeIds: ['N0001', 'N0002'],
    default_files: ['src/a.js', 'src/api/b.js', 'src/api/c.js', 'src/model/d.js'],
  }, context);
  assert.equal(workload.modules, 3);
});

test('C001 the legacy v1 workload keeps the five legacy components', () => {
  const legacy = legacyWorkloadOfTicket({
    nodeIds: ['N0001', 'N0002'],
    default_files: ['src/a.js', 'src/api/b.js'],
  }, fixtureContext());
  assert.deepEqual(legacy, {
    operations: 2,
    sequenceSteps: 1,
    contracts: 2,
    files: 2,
    kinds: 2,
  });
  assert.equal(LEGACY_WORKLOAD_COMPONENTS.length, 5);
});

test('C001 a phase with no tickets is measured from its nodes', () => {
  const context = fixtureContext();
  assert.deepEqual(
    workloadOfPhase({ id: 0, nodeIds: ['N0001', 'N0002'], tickets: [] }, context),
    workloadOfNodes(['N0001', 'N0002'], context),
  );
  assert.deepEqual(
    legacyWorkloadOfPhase({ id: 0, nodeIds: ['N0001', 'N0002'], tickets: [] }, context),
    legacyWorkloadOfNodes(['N0001', 'N0002'], context),
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
  const sum = {
    operations: 0,
    sequenceSteps: 0,
    ownedContracts: 0,
    files: 0,
    testUnit: 0,
    testIntegration: 0,
    modules: 0,
  };
  for (const ticket of phase.tickets) {
    const workload = workloadOfTicket(ticket, context);
    for (const component of WORKLOAD_COMPONENTS) sum[component] += workload[component];
  }
  assert.deepEqual(workloadOfPhase(phase, context), sum);
});

test('C002 minimumTicketCount is the component-wise ceiling and never below one', () => {
  const empty = {
    operations: 0,
    sequenceSteps: 0,
    ownedContracts: 0,
    files: 0,
    testUnit: 0,
    testIntegration: 0,
    modules: 0,
  };
  const budget = {
    operations: 2, sequenceSteps: 2, ownedContracts: 1,
    files: 2, testUnit: 2, testIntegration: 1, modules: 1,
  };
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

test('C002 maximumTicketCount is the budget floor plus accepted discretionary refusals', () => {
  assert.equal(maximumTicketCount(1, []), 1);
  assert.equal(maximumTicketCount(2, [{ decision: 'refused' }]), 3);
  assert.equal(maximumTicketCount(2, []), 2);
});

test('C002 a non-positive budget component is rejected', () => {
  const budget = {
    operations: 2, sequenceSteps: 2, ownedContracts: 1,
    files: 2, testUnit: 2, testIntegration: 1, modules: 1,
  };
  assert.throws(() => minimumTicketCount({ ...budget, files: 2 }, { ...budget, files: 0 }), /budget component/);
});

test('C003 a discretionary split without merge evidence is refused', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'cohesion' },
      { nodeIds: ['N0002'], splitReason: 'cohesion' },
    ],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(findings.some((finding) => finding.code === 'MERGE_ATTEMPT_MISSING'));
  assert.ok(findings.some((finding) => finding.code === 'TICKET_COUNT_ABOVE_MERGE_EVIDENCE'));
});

test('C003 a valid cohesion refusal names two behaviours and passes the upper bound', () => {
  const attempt = {
    left: ['N0001'],
    right: ['N0002'],
    decision: 'refused',
    trigger: 'cohesion',
    evidence: 'The encoding boundary and the hash boundary change independently.',
    behaviours: ['canonical encoding', 'content addressing'],
  };
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'cohesion', mergeAttempts: [attempt] },
      { nodeIds: ['N0002'], splitReason: 'cohesion', mergeAttempts: [attempt] },
    ],
  });
  const analysis = analyzeTicketWorkload(phase, looseBudget(), context);
  assert.equal(analysis.acceptedRefusals.length, 1);
  assert.equal(analysis.findings.some((finding) => finding.code === 'MERGE_ATTEMPT_MISSING'), false);
  assert.equal(analysis.findings.some((finding) => finding.code === 'TICKET_COUNT_ABOVE_MERGE_EVIDENCE'), false);
});

test('C003 cohesion without two behaviours is refused', () => {
  const attempt = {
    left: ['N0001'],
    right: ['N0002'],
    decision: 'refused',
    trigger: 'cohesion',
    evidence: 'They differ.',
    behaviours: ['only one'],
  };
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'cohesion', mergeAttempts: [attempt] },
      { nodeIds: ['N0002'], splitReason: 'cohesion', mergeAttempts: [attempt] },
    ],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(findings.some((finding) => finding.code === 'MERGE_TRIGGER_INVALID'));
});

test('C003 a budget-forced split needs no refusal', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'tdd-order' },
      { nodeIds: ['N0002'], splitReason: 'tdd-order' },
    ],
  });
  const analysis = analyzeTicketWorkload(phase, tightOperationsBudget(), context);
  assert.deepEqual(analysis.acceptedRefusals, []);
  assert.equal(analysis.findings.some((finding) => finding.code === 'MERGE_ATTEMPT_MISSING'), false);
});

test('C003 a single-ticket phase needs no splitReason or mergeAttempts', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001'],
    tickets: [{ nodeIds: ['N0001'] }],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.equal(findings.some((finding) => finding.code === 'SPLIT_REASON_MISSING'), false);
  assert.equal(findings.some((finding) => finding.code === 'MERGE_ATTEMPT_MISSING'), false);
});

test('C004 a hard intra-phase edge accepts tdd-order', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'tdd-order' },
      { nodeIds: ['N0002'], splitReason: 'tdd-order' },
    ],
    edges: [{ from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard' } }],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.equal(findings.some((finding) => finding.code === 'SPLIT_REASON_GRAPH_MISMATCH'), false);
});

test('C004 a cohesion reason without two behaviours is a graph mismatch', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'cohesion' },
      { nodeIds: ['N0002'], splitReason: 'cohesion' },
    ],
    edges: [{ from: 'N0001', to: 'N0002', type: 'references', attributes: { strength: 'soft' } }],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(findings.some((finding) => finding.code === 'SPLIT_REASON_GRAPH_MISMATCH'));
});

test('C004 ownership-boundary without foreign ownership is a graph mismatch', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'ownership-boundary' },
      { nodeIds: ['N0002'], splitReason: 'ownership-boundary' },
    ],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(findings.some((finding) => finding.code === 'SPLIT_REASON_GRAPH_MISMATCH'));
});

test('C004 disjoint-io without an external I/O surface is a graph mismatch', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'disjoint-io' },
      { nodeIds: ['N0002'], splitReason: 'disjoint-io' },
    ],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(findings.some((finding) => finding.code === 'SPLIT_REASON_GRAPH_MISMATCH'));
});

test('C004 an unknown split reason is invalid', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'because' },
      { nodeIds: ['N0002'], splitReason: 'because' },
    ],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(findings.some((finding) => finding.code === 'SPLIT_REASON_INVALID'));
  assert.deepEqual(SPLIT_REASONS, [
    'budget', 'tdd-order', 'disjoint-io', 'release-boundary', 'ownership-boundary', 'cohesion',
  ]);
});

test('C005 an irreducible node is recorded and does not abort', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0004'],
    tickets: [{ nodeIds: ['N0004'], splitReason: 'cohesion' }],
  });
  const analysis = analyzeTicketWorkload(phase, tightOperationsBudget(), context);
  assert.equal(analysis.acceptedIrreducible.length > 0, true);
  const accepted = analysis.acceptedIrreducible.find((finding) => finding.nodeId === 'N0004');
  assert.equal(accepted.code, 'ACCEPTED_IRREDUCIBLE_OVERAGE');
  assert.equal(accepted.component, 'operations');
  assert.equal(accepted.actual, 2);
  assert.equal(accepted.budget, 1);
  assert.equal(analysis.fatalFindings.some((finding) => finding.code === 'TICKET_WORK_OVER_BUDGET'), false);
});

test('C005 a reducible ticket over budget is fatal', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [{ nodeIds: ['N0001', 'N0002'], splitReason: 'cohesion' }],
  });
  const analysis = analyzeTicketWorkload(phase, tightOperationsBudget(), context);
  assert.ok(analysis.fatalFindings.some((finding) =>
    finding.code === 'TICKET_WORK_OVER_BUDGET'
    && finding.component === 'operations'
    && finding.actual === 2
    && finding.budget === 1));
});

test('C007 a non-record file-less ticket fails unless it names the missing file', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001'],
    tickets: [{ nodeIds: ['N0001'], default_files: [] }],
  });
  const missing = validateTicketWorkload(phase, looseBudget(), context);
  assert.ok(missing.some((finding) => finding.code === 'EMPTY_DEFAULT_FILES'));

  const explained = analyzeTicketWorkload({
    ...phase,
    tickets: phase.tickets.map((ticket) => ({
      ...ticket,
      unlistedFileReason: 'crate root absent from Dirs-Tree',
    })),
  }, looseBudget(), context).findings;
  assert.equal(explained.some((finding) => finding.code === 'EMPTY_DEFAULT_FILES'), false);
});

test('C007 a record ticket may have no default_files', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0005'],
    tickets: [{ nodeIds: ['N0005'], default_files: [] }],
  });
  const findings = validateTicketWorkload(phase, looseBudget(), context);
  assert.equal(findings.some((finding) => finding.code === 'EMPTY_DEFAULT_FILES'), false);
});

test('parseWorkBudget accepts v1 and v2 and rejects an unknown version', () => {
  const v1 = {
    version: 1,
    components: [...LEGACY_WORKLOAD_COMPONENTS],
    budget: { operations: 2, sequenceSteps: 2, contracts: 1, files: 2, kinds: 2 },
    provenance: 'measured from reviewed tickets',
  };
  const parsedV1 = parseWorkBudget(v1);
  assert.equal(parsedV1.valid, true);
  assert.equal(parsedV1.mode, 'v1');
  assert.deepEqual(parsedV1.components, [...LEGACY_WORKLOAD_COMPONENTS]);

  const v2 = {
    version: 2,
    components: [...WORKLOAD_COMPONENTS],
    budget: looseBudget(),
    excluded: ['providerBoundaryContracts', 'kinds', 'graphNodes'],
    provenance: 'measured from reviewed tickets',
  };
  const parsedV2 = parseWorkBudget(v2);
  assert.equal(parsedV2.valid, true);
  assert.equal(parsedV2.mode, 'v2');
  assert.deepEqual(parsedV2.components, [...WORKLOAD_COMPONENTS]);

  const v3 = { ...v2, version: 3, partitionPolicy: 'contiguous-minimum', splitReasons: ['budget', 'ownership-boundary'] };
  assert.equal(parseWorkBudget(v3).valid, true);
  assert.equal(parseWorkBudget(v3).policy, 'contiguous-minimum');
  assert.equal(parseWorkBudget({ ...v2, components: ['operations'] }).valid, false);
  assert.equal(parseWorkBudget({ ...v2, budget: { ...v2.budget, files: 0 } }).valid, false);
  assert.equal(parseWorkBudget({ ...v2, provenance: '' }).valid, false);
});

test('partitionFindings separates fatal findings from accepted irreducible overage', () => {
  const findings = [
    { code: 'ACCEPTED_IRREDUCIBLE_OVERAGE', accepted: true },
    { code: 'TICKET_WORK_OVER_BUDGET' },
  ];
  const partitioned = partitionFindings(findings);
  assert.equal(partitioned.fatal.length, 1);
  assert.equal(partitioned.acceptedIrreducible.length, 1);
});

test('collectMergeFindings reports a forced pair without an attempt', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'tdd-order' },
      { nodeIds: ['N0002'], splitReason: 'tdd-order' },
    ],
  });
  const merge = collectMergeFindings(phase, tightOperationsBudget(), context);
  assert.equal(merge.forcedPairs.length, 1);
  assert.equal(merge.acceptedRefusals.length, 0);
});

test('collectPartitionFindings requires the partition minimum under v3', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], default_files: ['src/a.js'], splitReason: 'cohesion' },
      { nodeIds: ['N0002'], default_files: ['src/b.js'], splitReason: 'cohesion' },
    ],
  });
  const findings = collectPartitionFindings(phase, looseBudget(), context, { preserveCompleted: false });
  assert.ok(findings.some((finding) => finding.code === 'TICKET_COUNT_ABOVE_PARTITION_MINIMUM'));
});

test('collectPartitionFindings accepts a budget-forced boundary at the minimum', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'budget' },
      { nodeIds: ['N0002'], splitReason: 'budget' },
    ],
  });
  const findings = collectPartitionFindings(phase, tightOperationsBudget(), context, { preserveCompleted: false });
  assert.equal(findings.some((finding) => finding.code === 'TICKET_COUNT_ABOVE_PARTITION_MINIMUM'), false);
  assert.equal(findings.some((finding) => finding.code === 'SPLIT_REASON_NOT_PROVEN'), false);
});

test('collectPartitionFindings rejects a legacy reason at a budget-forced boundary', () => {
  const { phase, context } = phaseWithTickets({
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { nodeIds: ['N0001'], splitReason: 'cohesion' },
      { nodeIds: ['N0002'], splitReason: 'cohesion' },
    ],
  });
  const findings = collectPartitionFindings(phase, tightOperationsBudget(), context, { preserveCompleted: false });
  assert.ok(findings.some((finding) => finding.code === 'SPLIT_REASON_NOT_PROVEN'));
});
