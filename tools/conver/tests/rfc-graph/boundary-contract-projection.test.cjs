const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  projectBoundaryContracts,
  verifyBoundaryContracts,
} = require('../../.claude/scripts/rfc-graph/project-boundary-contracts.js');

const REGISTRY = [{
  boundary_id: 'boundary-001',
  provider_package: 'pkg-0001',
  consumer_package: 'pkg-0002',
  clauses: {
    preconditions: ['identity present'],
    postconditions: ['order_id derived'],
    invariants: ['one active order_id'],
  },
}];

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function graphFixture() {
  return {
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-ProduceFact'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [{ id: 'C001', precondition: 'old', postcondition: 'old', invariant: 'old' }],
    }],
  };
}

test('the projection is a new graph and keeps the existing contract', () => {
  const graph = graphFixture();
  const projected = projectBoundaryContracts({ graph, registry: REGISTRY });
  assert.notEqual(projected, graph);
  assert.equal(graph.edges[0].contracts.length, 1);
  assert.equal(projected.edges[0].contracts.length, 2);
  assert.equal(projected.edges[0].contracts[0].id, 'C001');
});

test('the projected contract uses a valid C9xx id, the canonical clauses and the registry digest note', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  const contract = projected.edges[0].contracts.find((entry) => entry.id === 'C900');
  assert.ok(contract, 'the deterministic C900 contract is present');
  assert.equal(contract.precondition, 'identity present');
  assert.equal(contract.postcondition, 'order_id derived');
  assert.equal(contract.invariant, 'one active order_id');
  assert.match(projected.edges[0].attributes.note, /^registry:boundary-001;digest:[0-9a-f]{64}$/);
});

test('a matching graph has no verification finding', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  assert.deepEqual(verifyBoundaryContracts(projected, REGISTRY), []);
});

test('a changed projection is BOUNDARY_CONTRACT_MISMATCH', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  projected.edges[0].contracts.find((entry) => entry.id === 'C900').precondition = 'tampered';
  const findings = verifyBoundaryContracts(projected, REGISTRY);
  assert.ok(findings.some((finding) => finding.code === 'BOUNDARY_CONTRACT_MISMATCH'));
});

test('a changed note digest is BOUNDARY_CONTRACT_MISMATCH', () => {
  const projected = projectBoundaryContracts({ graph: graphFixture(), registry: REGISTRY });
  projected.edges[0].attributes.note = `registry:boundary-001;digest:${'0'.repeat(64)}`;
  const findings = verifyBoundaryContracts(projected, REGISTRY);
  assert.ok(findings.some((finding) => finding.code === 'BOUNDARY_CONTRACT_MISMATCH'));
});
