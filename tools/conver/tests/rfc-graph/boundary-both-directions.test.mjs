// PX-321 @verifies C008
// A package that holds both sides of one boundary needs both direction edges projected and
// verified. One edge cannot satisfy both directions.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  projectBoundaryContracts,
  verifyBoundaryContracts,
} from '../../.claude/scripts/rfc-graph/project-boundary-contracts.js';

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
const ROW = {
  boundary_id: 'b1',
  provider_package: 'pkg',
  consumer_package: 'pkg',
  clauses: { preconditions: ['pre'], postconditions: ['post'], invariants: ['inv'] },
};

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function bothDirectionView() {
  return {
    packageId: 'pkg',
    obligationUnits: [
      { unitId: 'ctr-b1', relation: 'carries', subject: 'b1', direction: 'provides', counterpart: 'pkg' },
      { unitId: 'ctr-b1', relation: 'carries', subject: 'b1', direction: 'consumes', counterpart: 'pkg' },
    ],
  };
}

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function graphWith(edges) {
  return {
    nodes: [{ id: 'N0001', unitIds: ['ctr-b1'] }, { id: 'N0002', unitIds: [] }, { id: 'N0003', unitIds: [] }],
    edges,
  };
}

test('C008 both direction edges carry a registry projection', () => {
  const graph = graphWith([
    { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: {}, contracts: [] },
    { from: 'N0003', to: 'N0001', type: 'depends_on', attributes: {}, contracts: [] },
  ]);
  const projected = projectBoundaryContracts({ graph, registry: [ROW], view: bothDirectionView() });
  const providing = projected.edges.find((edge) => edge.from === 'N0001');
  const consuming = projected.edges.find((edge) => edge.to === 'N0001');
  assert.equal(providing.contracts.length, 1);
  assert.equal(consuming.contracts.length, 1);
  assert.notEqual(providing.contracts[0].id, consuming.contracts[0].id);
  assert.deepEqual(verifyBoundaryContracts(projected, [ROW], { view: bothDirectionView() }), []);
});

test('C008 a single edge cannot satisfy both directions', () => {
  const graph = graphWith([
    { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: {}, contracts: [] },
  ]);
  const projected = projectBoundaryContracts({ graph, registry: [ROW], view: bothDirectionView() });
  const findings = verifyBoundaryContracts(projected, [ROW], { view: bothDirectionView() });
  assert.ok(findings.some((finding) => finding.code === 'BOUNDARY_DIRECTION_MISMATCH'));
});
