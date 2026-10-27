// PX-320 @verifies C004
// The sidecar is the graph-layer carrier of the step contract. A graph repair after
// graphify must be checked against the live sidecar before the Dirs-Tree and tickets
// are accepted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  projectStepContracts,
  verifyStepContracts,
} from '../../.claude/scripts/rfc-graph/lib/step-contracts.mjs';

/** A view with one step bound to op-A. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function stepView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [],
    ownedSequenceUnits: [{
      unitId: 'seq-S',
      sequenceId: 'S',
      steps: [{
        stepId: 's1',
        operationId: 'A',
        order: 0,
        line: 1,
        quote: 'a',
        subject: null,
        predicate: null,
        object: null,
        contract: { pre: [], post: [], invariants: [] },
        contractProse: 'a',
      }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

/** A graph whose only edge carries the sidecar pointer. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function stepGraph() {
  return {
    nodes: [{ id: 'N0001', unitIds: ['op-A'] }],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: {
        strength: 'hard',
        bidirectional: false,
        note: 'step:s1;row:0',
      },
      contracts: [],
    }],
  };
}

test('C004 a matching sidecar passes and writes nothing', () => {
  const view = stepView();
  const graph = stepGraph();
  const before = JSON.stringify(graph);
  const projected = projectStepContracts({ view, graph });
  assert.equal(projected.ok, true);
  assert.deepEqual(verifyStepContracts({ view, graph, sidecar: projected.sidecar }), []);
  assert.equal(JSON.stringify(graph), before);
});

test('C004 a graph mutation after projection makes the sidecar stale', () => {
  const view = stepView();
  const graph = stepGraph();
  const projected = projectStepContracts({ view, graph });
  const mutated = {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      unitIds: (node.unitIds ?? []).filter((unitId) => unitId !== 'op-A'),
    })),
  };
  const findings = verifyStepContracts({ view, graph: mutated, sidecar: projected.sidecar });
  assert.ok(findings.some((finding) =>
    finding.code === 'CONTRACT_CHAIN_OPEN' || finding.code === 'STEP_CONTRACT_MISMATCH'));
});

test('C004 boundify and split invoke project-step-contracts mode verify', () => {
  assert.match(
    readFileSync('.claude/commands/boundify-graph.md', 'utf8'),
    /project-step-contracts\.js --mode=verify/,
  );
  assert.match(
    readFileSync('.claude/commands/split-to-tickets.md', 'utf8'),
    /project-step-contracts\.js --mode=verify/,
  );
});
