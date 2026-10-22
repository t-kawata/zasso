// PX-306 @verifies C003
// A boundary the allocate registry declares must appear as ctr-B in the graph and in a
// ticket, each carrying a contract. A ticket contract with no edge and no registry row is
// an invention, not a closure.
import test from 'node:test';
import assert from 'node:assert/strict';

import { checkBoundaryContracts } from '../../.claude/scripts/sequences-slice/lib/unit-provenance.mjs';

const graph = {
  nodes: [{ id: 'N5', unitIds: ['ctr-boundary-005'] }],
  edges: [{
    from: 'N5',
    to: 'N6',
    type: 'depends_on',
    contracts: [{ id: 'C001', precondition: 'order received', postcondition: 'order accepted', invariant: 'one order' }],
  }],
};
const tickets = {
  phases: [{
    id: 0,
    tickets: [{
      id: 1,
      nodeIds: ['N5', 'ctr-boundary-005'],
      contracts: [{ id: 'C001', sourceEdge: 'N5→N6', precondition: 'order received', postcondition: 'order accepted', invariant: 'one order' }],
    }],
  }],
};

test('C003 a registry boundary reaching the graph edge and the ticket is accepted', () => {
  assert.deepEqual(checkBoundaryContracts({ registryBoundaryIds: ['boundary-005'], graph, tickets }), []);
});

test('C003 a registry boundary absent from the graph is missing', () => {
  const findings = checkBoundaryContracts({
    registryBoundaryIds: ['boundary-005'],
    graph: { nodes: [], edges: [] },
    tickets,
  });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_BOUNDARY_CONTRACT' && entry.boundaryId === 'boundary-005'));
});

test('C003 a boundary node with no contract edge is missing', () => {
  const findings = checkBoundaryContracts({
    registryBoundaryIds: ['boundary-005'],
    graph: { nodes: [{ id: 'N5', unitIds: ['ctr-boundary-005'] }], edges: [] },
    tickets,
  });
  assert.ok(findings.some((entry) => entry.code === 'MISSING_BOUNDARY_CONTRACT' && entry.boundaryId === 'boundary-005'));
});

test('C003 a ticket contract with no edge and no registry row is invented', () => {
  const invented = {
    phases: [{
      id: 0,
      tickets: [{
        id: 1,
        nodeIds: ['N5', 'ctr-boundary-005'],
        contracts: [{ id: 'C999', sourceEdge: 'N9→N8', precondition: 'x', postcondition: 'y', invariant: 'z' }],
      }],
    }],
  };
  const findings = checkBoundaryContracts({ registryBoundaryIds: ['boundary-005'], graph, tickets: invented });
  assert.ok(findings.some((entry) => entry.code === 'INVENTED_TICKET_CONTRACT' && entry.contractId === 'C999'));
});
