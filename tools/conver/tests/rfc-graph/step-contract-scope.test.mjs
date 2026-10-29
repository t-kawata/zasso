// PX-322 @verifies C001 C003 C004
// The step-contract sidecar is package-scoped: a foreign step of a cross-boundary
// sequence is never projected here, every local step is bound through a bounded
// pointer note, and a boundary projection cannot erase a step note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { buildPackageView } from '../../.claude/scripts/sequences-slice/lib/view.mjs';
import {
  localOperationUnitIds,
  projectStepContracts,
  stepNotesByEdge,
  verifyStepContracts,
} from '../../.claude/scripts/rfc-graph/lib/step-contracts.mjs';

const require = createRequire(import.meta.url);
const { projectBoundaryContracts } = require('../../.claude/scripts/rfc-graph/project-boundary-contracts.js');

/** The two-package artifact: Op1 is pkg-1's, Op2 is pkg-2's. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function twoPackageArtifact() {
  return {
    spec: { lines: 10 },
    sequences: [{ id: 'S1', outcome: 'direct' }],
    steps: [
      { id: 's1', sequence: 'S1', operation: 'Op1', line: 1, quote: 'q1' },
      { id: 's2', sequence: 'S1', operation: 'Op2', line: 2, quote: 'q2' },
    ],
    operations: [
      { id: 'Op1', disposition: 'active', position: 'positioned', result_object_classes: ['Thing1'], grounding: { classification: 'authored' } },
      { id: 'Op2', disposition: 'active', position: 'positioned', result_object_classes: ['Thing2'], grounding: { classification: 'authored' } },
    ],
  };
}

/** The tree manifest that makes the two operations belong to different packages. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function twoPackageTreeManifest() {
  return {
    inventory: {
      objects: [
        { canonical_name: 'Thing1', owner_package: 'pkg-1' },
        { canonical_name: 'Thing2', owner_package: 'pkg-2' },
      ],
    },
    structure: { segments: [] },
  };
}

/** The view of one package in the two-package chain. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function packageView(packageId) {
  return buildPackageView({
    artifact: twoPackageArtifact(),
    treeManifest: twoPackageTreeManifest(),
    packageSegments: [],
    obligations: {},
  }, packageId);
}

/** A graph whose only edge is incident to the operation node. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function graphWithEdge(unitIds, note = null) {
  return {
    nodes: [{ id: 'N1', unitIds }, { id: 'N2', unitIds: [] }],
    edges: [{
      from: 'N1',
      to: 'N2',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false, ...(note === null ? {} : { note }) },
      contracts: [],
    }],
  };
}

/** The same graph with the note the projection computed. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function withNote(graph, note) {
  return {
    ...graph,
    edges: graph.edges.map((edge, index) => (index === 0
      ? { ...edge, attributes: { ...edge.attributes, note } }
      : edge)),
  };
}

/** A view with one owned sequence and `count` steps of one operation. */
// [::TICKET::] PX-322 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-322 --for-spec --no-implementation-order`.
function viewWithSteps(operationId, count) {
  const steps = Array.from({ length: count }, (unused, index) => ({
    stepId: `s${index + 1}`,
    operationId,
    order: index,
    line: index + 1,
    quote: `q${index + 1}`,
    contract: { pre: [], post: [], invariants: [] },
    contractProse: '',
  }));
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [{ unitId: `op-${operationId}`, operationId, roleCandidate: 'implementer', obligation: { specLines: [] } }],
    ownedSequenceUnits: [{ unitId: 'seq-S', sequenceId: 'S', outcome: 'direct', steps }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

test('C001 a foreign step is not projected and a local step is', () => {
  const view = packageView('pkg-1');
  const graph = graphWithEdge(['op-Op1', 'xdir-S1']);
  const projected = projectStepContracts({ view, graph });

  assert.equal(projected.ok, true, JSON.stringify(projected.findings));
  assert.deepEqual(projected.sidecar.steps.map((row) => row.stepId), ['s1']);

  const note = [...stepNotesByEdge(graph, projected.sidecar).values()][0].note;
  assert.deepEqual(verifyStepContracts({ view, graph: withNote(graph, note), sidecar: projected.sidecar }), []);
});

test('C001 a foreign sidecar row is CONTRACT_CHAIN_OPEN', () => {
  const view = packageView('pkg-1');
  const graph = graphWithEdge(['op-Op1', 'xdir-S1']);
  const projected = projectStepContracts({ view, graph });
  const note = [...stepNotesByEdge(graph, projected.sidecar).values()][0].note;
  const withForeignRow = {
    ...projected.sidecar,
    steps: [...projected.sidecar.steps, { stepId: 's2', digest: 'foreign', nodeIds: ['N9'], operationId: 'Op2' }],
  };

  const findings = verifyStepContracts({ view, graph: withNote(graph, note), sidecar: withForeignRow });
  assert.ok(findings.some((finding) => finding.code === 'CONTRACT_CHAIN_OPEN' && finding.subject === 's2'));
});

test('C001 a local step whose graph lacks its operation fails closed', () => {
  const view = viewWithSteps('Op1', 1);
  const graph = graphWithEdge(['seq-S']);
  const projected = projectStepContracts({ view, graph });

  assert.equal(projected.ok, false);
  assert.ok(projected.findings.some((finding) => finding.code === 'CONTRACT_CHAIN_OPEN' && finding.subject === 's1'));
});

test('C001 localOperationUnitIds includes owned and obligated operations', () => {
  const ids = localOperationUnitIds({
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A' }],
    obligationUnits: [{ unitId: 'op-B', kind: 'operation', subject: 'B' }],
  });
  assert.deepEqual([...ids].sort(), ['A', 'B']);
});

test('C003 a 17-step operation uses a bounded pointer note', () => {
  const view = viewWithSteps('Op1', 17);
  const graph = graphWithEdge(['op-Op1', 'seq-S']);
  const projected = projectStepContracts({ view, graph });

  assert.equal(projected.ok, true, JSON.stringify(projected.findings));
  const note = [...stepNotesByEdge(graph, projected.sidecar).values()][0].note;
  assert.match(note, /^step-sidecar;digest:[0-9a-f]{64}$/);
  assert.ok(note.length <= 240);
  assert.deepEqual(verifyStepContracts({ view, graph: withNote(graph, note), sidecar: projected.sidecar }), []);
});

test('C003 a legacy inline note still verifies', () => {
  const view = viewWithSteps('Op1', 2);
  const graph = graphWithEdge(['op-Op1', 'seq-S'], 'step:s1;row:0|step:s2;row:1');
  const projected = projectStepContracts({ view, graph });
  const legacySidecar = { ...projected.sidecar };
  delete legacySidecar.edges;

  assert.deepEqual(verifyStepContracts({ view, graph, sidecar: legacySidecar }), []);
});

test('C004 a boundary projection preserves an existing step note', () => {
  const view = {
    packageId: 'pkg-1',
    ownedOperationUnits: [{ unitId: 'op-Op1', operationId: 'Op1' }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'ctr-boundary-001', kind: 'contract', direction: 'provides', counterpart: 'pkg-2' }],
  };
  const stepNote = `step-sidecar;digest:${'a'.repeat(64)}`;
  const graph = {
    nodes: [{ id: 'N1', unitIds: ['op-Op1'] }, { id: 'N2', unitIds: ['ctr-boundary-001'] }],
    edges: [{ from: 'N1', to: 'N2', type: 'depends_on', attributes: { note: stepNote }, contracts: [] }],
  };
  const registryRow = {
    boundary_id: 'boundary-001',
    provider_package: 'pkg-1',
    consumer_package: 'pkg-2',
    clauses: { preconditions: ['p'], postconditions: ['q'], invariants: ['r'] },
  };

  const projected = projectBoundaryContracts({ graph, registry: [registryRow], view, sidecarPath: null });
  const note = projected.edges[0].attributes.note;

  assert.match(note, /step-sidecar;digest:/);
  assert.match(note, /registry:boundary-001;digest:/);
  assert.ok(note.length <= 240);
});
