// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
// C002: a boundary states the connection kind of the normal edge it came from.
//
// The boundary used to carry only the consumer, the provider and the scope, so
// stage 2 could not know the kind and defaulted every contract to value_only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDependencyBoundaries } from '../../../.claude/scripts/workspacify-tree/run.mjs';
import { buildBoundaryContractScope } from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';

const GRAPH_KINDS = [
  'value_only',
  'typed_protocol_input',
  'proof_verification',
  'state_transition',
  'external_effect',
  'composition_obligation',
  'port_contract',
  'checkpoint-reference',
  'adapter-implementation',
  'conformance',
];

// [::TICKET::] PX-300 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-300 --for-spec --no-implementation-order`.
function normalEdge(connectionKind) {
  return {
    from: 'pkg-consumer',
    to: 'pkg-provider',
    kind: 'permitted',
    reasonCode: 'canonical-object',
    reason: 'the consumer reads the provider record',
    connectionKind,
  };
}

test('C002 every boundary carries the kind of its matching normal edge', () => {
  const edges = GRAPH_KINDS.map((kind) => normalEdge(kind));
  const boundaries = buildDependencyBoundaries(edges);

  assert.equal(boundaries.length, edges.length);
  boundaries.forEach((boundary, index) => {
    assert.equal(boundary.connection_kind, edges[index].connectionKind);
    assert.deepEqual(boundary.stage2_contract_scope, buildBoundaryContractScope(edges[index].connectionKind));
  });
});

test('C002 the new kinds scope errors and tests in the boundary itself', () => {
  const boundaries = buildDependencyBoundaries([
    normalEdge('checkpoint-reference'),
    normalEdge('adapter-implementation'),
    normalEdge('conformance'),
  ]);

  for (const boundary of boundaries) {
    assert.ok(boundary.stage2_contract_scope.includes('errors'), boundary.id);
    assert.ok(boundary.stage2_contract_scope.includes('tests'), boundary.id);
  }
});

test('C002 a boundary with no registered kind is refused before it is written', () => {
  assert.throws(() => buildDependencyBoundaries([normalEdge('not-a-kind')]), /not-a-kind/);
  assert.throws(() => buildDependencyBoundaries([{ ...normalEdge(undefined), connectionKind: undefined }]), /connection kind/);
});

test('C002 forbidden edges produce no boundary', () => {
  assert.deepEqual(buildDependencyBoundaries([{ ...normalEdge('value_only'), kind: 'forbidden' }]), []);
});
