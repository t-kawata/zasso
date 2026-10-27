// PX-323 @verifies C001 C002 C003 C004 C005 C006 C008
// The build order and the implementation order are distinct. Every derived edge names
// its source; narrative sequence order alone never creates one.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPlacement,
  derivePackagePrecedence,
  evaluatePrerequisites,
  factTexts,
  ticketPrerequisites,
  topologicalOrder,
} from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function ticket(id, phaseId, nodeIds, units = []) {
  return { id, phaseId, nodeIds, distribution: { units } };
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function operationUnit(unitId, mode = 'implement') {
  return { unitId, kind: 'operation', obligation: { mode } };
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function step(id, sequence, operation, order, contract) {
  return { id: `${sequence}__${id}`, stepId: `${sequence}__${id}`, sequence, operation, order, contract };
}

// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
function registryRow(id, provider, consumer) {
  return { boundary_id: id, provider_package: provider, consumer_package: consumer };
}

test('C002 factTexts reads string and fact-object entries', () => {
  assert.deepEqual(factTexts(['a', { text: 'b' }, { factId: 'c' }]), ['a', 'b', 'c']);
});

test('C002 build edges are turned into provider-first package edges', () => {
  const treeManifest = { dependencies: { dag: { canonical_edges: [{ from: 'pkg-2', to: 'pkg-1' }] } } };
  const { edges } = derivePackagePrecedence({ treeManifest });
  assert.deepEqual(edges.map((edge) => [edge.fromPackage, edge.toPackage]), [['pkg-1', 'pkg-2']]);
  assert.match(edges[0].source, /^build:/);
});

test('C002 a consumes/produces match creates a provider-first edge', () => {
  const artifact = {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      step('s1', 'S', 'Op1', 1, { produces: ['object:X'] }),
      step('s2', 'S', 'Op2', 2, { consumes: ['object:X'] }),
    ],
  };
  const operationOwners = new Map([
    ['Op1', { packageId: 'pkg-1' }],
    ['Op2', { packageId: 'pkg-2' }],
  ]);
  const { edges } = derivePackagePrecedence({ treeManifest: null, artifact, operationOwners });
  assert.deepEqual(edges.map((edge) => [edge.fromPackage, edge.toPackage]), [['pkg-1', 'pkg-2']]);
  assert.match(edges[0].source, /^sequence:S:/);
});

test('C002 narrative order without a contract relation creates no edge', () => {
  const artifact = {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      step('s1', 'S', 'Op1', 1, { produces: ['object:X'] }),
      step('s2', 'S', 'Op2', 2, { consumes: ['object:Y'] }),
    ],
  };
  const operationOwners = new Map([
    ['Op1', { packageId: 'pkg-1' }],
    ['Op2', { packageId: 'pkg-2' }],
  ]);
  const { edges } = derivePackagePrecedence({ treeManifest: null, artifact, operationOwners });
  assert.equal(edges.length, 0);
});

test('C002 a crossed boundary whose registry provider is the earlier step creates an edge', () => {
  const artifact = {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      step('s1', 'S', 'Op1', 1, {}),
      step('s2', 'S', 'Op2', 2, { crosses: ['boundary-001'] }),
    ],
  };
  const operationOwners = new Map([
    ['Op1', { packageId: 'pkg-1' }],
    ['Op2', { packageId: 'pkg-2' }],
  ]);
  const { edges } = derivePackagePrecedence({
    treeManifest: null,
    artifact,
    operationOwners,
    registry: [registryRow('boundary-001', 'pkg-1', 'pkg-2')],
  });
  const sequenceEdges = edges.filter((edge) => edge.kind === 'sequence');
  assert.deepEqual(sequenceEdges.map((edge) => [edge.fromPackage, edge.toPackage]), [['pkg-1', 'pkg-2']]);
  assert.equal(sequenceEdges[0].boundaryId, 'boundary-001');
});

test('C002 topologicalOrder returns deterministic levels for a diamond', () => {
  const result = topologicalOrder({
    nodes: ['a', 'b', 'c', 'd'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.levels, [['a'], ['b', 'c'], ['d']]);
  assert.deepEqual(result.serial, ['a', 'b', 'c', 'd']);
});

test('C002 topologicalOrder rejects a cycle', () => {
  const result = topologicalOrder({
    nodes: ['a', 'b'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'IMPLEMENTATION_ORDER_CYCLE'));
});

test('C004 a graph hard edge becomes a same-package ticket prerequisite', () => {
  const tickets = [
    ticket(1, 0, ['N1'], [operationUnit('op-A')]),
    ticket(2, 0, ['N2'], [operationUnit('op-B')]),
  ];
  const graph = { edges: [{ from: 'N2', to: 'N1', type: 'depends_on', attributes: { strength: 'hard' } }] };
  const { prerequisites } = ticketPrerequisites({ tickets, graph, packageId: 'pkg-1' });
  assert.deepEqual(prerequisites.get('P0-2'), [{
    ticket: 'P0-1',
    kind: 'implementation',
    source: 'graph:depends_on:N2->N1',
  }]);
});

test('C004 a same-package sequence data relation becomes a ticket prerequisite', () => {
  const tickets = [
    ticket(1, 0, ['N1'], [operationUnit('op-Op1')]),
    ticket(2, 0, ['N2'], [operationUnit('op-Op2')]),
  ];
  const artifact = {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      step('s1', 'S', 'Op1', 1, { produces: ['object:X'] }),
      step('s2', 'S', 'Op2', 2, { consumes: ['object:X'] }),
    ],
  };
  const operationOwners = new Map([
    ['Op1', { packageId: 'pkg-1', ticketKey: 'P0-1' }],
    ['Op2', { packageId: 'pkg-1', ticketKey: 'P0-2' }],
  ]);
  const { prerequisites } = ticketPrerequisites({ tickets, graph: { edges: [] }, artifact, operationOwners, packageId: 'pkg-1' });
  const entry = prerequisites.get('P0-2')[0];
  assert.equal(entry.ticket, 'P0-1');
  assert.equal(entry.kind, 'implementation');
  assert.match(entry.source, /^sequence:S:/);
});

test('C004 a cross-package sequence relation becomes a package prerequisite', () => {
  const tickets = [ticket(1, 0, ['N1'], [operationUnit('op-Op2')])];
  const artifact = {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      step('s1', 'S', 'Op1', 1, { produces: ['object:X'] }),
      step('s2', 'S', 'Op2', 2, { consumes: ['object:X'] }),
    ],
  };
  const operationOwners = new Map([
    ['Op1', { packageId: 'pkg-1' }],
    ['Op2', { packageId: 'pkg-2', ticketKey: 'P0-1' }],
  ]);
  const { prerequisites } = ticketPrerequisites({ tickets, graph: { edges: [] }, artifact, operationOwners, packageId: 'pkg-2' });
  const entry = prerequisites.get('P0-1')[0];
  assert.equal(entry.package, 'pkg-1');
  assert.equal(entry.kind, 'implementation');
  assert.match(entry.source, /^sequence:S:/);
});

test('C004 no distribution produces no prerequisites field', () => {
  const { prerequisites } = ticketPrerequisites({ tickets: [{ id: 1, phaseId: 0 }], graph: null, packageId: 'pkg-1' });
  assert.equal(prerequisites.size, 0);
});

test('C004 prerequisites are deterministic and deduplicated', () => {
  const tickets = [
    ticket(1, 0, ['N1'], [operationUnit('op-A')]),
    ticket(2, 0, ['N2'], [operationUnit('op-B')]),
  ];
  const graph = {
    edges: [
      { from: 'N2', to: 'N1', type: 'depends_on' },
      { from: 'N2', to: 'N1', type: 'depends_on' },
      { from: 'N2', to: 'N1', type: 'precedes' },
    ],
  };
  const first = ticketPrerequisites({ tickets, graph, packageId: 'pkg-1' }).prerequisites.get('P0-2');
  const second = ticketPrerequisites({ tickets, graph, packageId: 'pkg-1' }).prerequisites.get('P0-2');
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.equal(new Set(first.map((entry) => entry.source)).size, first.length);
});

test('C005 an inverted same-package placement is PREREQUISITE_NOT_BEFORE', () => {
  const tickets = [
    { id: 2, phaseId: 0, prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:x' }] },
    { id: 1, phaseId: 0, prerequisites: [] },
  ];
  const result = checkPlacement({ tickets, packageId: 'pkg-2', packageOrder: { 'pkg-2': 0 } });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_BEFORE'));
});

test('C005 an earlier same-package placement passes', () => {
  const tickets = [
    { id: 1, phaseId: 0, prerequisites: [] },
    { id: 2, phaseId: 0, prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:x' }] },
  ];
  const result = checkPlacement({ tickets, packageId: 'pkg-2', packageOrder: { 'pkg-2': 0 } });
  assert.equal(result.ok, true);
});

test('C005 a later cross-package placement is PREREQUISITE_PACKAGE_BEFORE', () => {
  const tickets = [{ id: 1, phaseId: 0, prerequisites: [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }] }];
  const result = checkPlacement({
    tickets,
    packageId: 'pkg-2',
    packageOrder: { 'pkg-1': 1, 'pkg-2': 0 },
    packageTickets: { 'pkg-1': { phases: [] } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_PACKAGE_BEFORE'));
});

test('C005 an unsplit prerequisite package is PREREQUISITE_PACKAGE_UNSPLIT', () => {
  const tickets = [{ id: 1, phaseId: 0, prerequisites: [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }] }];
  const result = checkPlacement({
    tickets,
    packageId: 'pkg-2',
    packageOrder: { 'pkg-1': 0, 'pkg-2': 1 },
    packageTickets: {},
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_PACKAGE_UNSPLIT'));
});

test('C006 no prerequisites is skipped', () => {
  const result = evaluatePrerequisites({ prerequisites: undefined, samePackageStatuses: new Map(), packageStatuses: new Map() });
  assert.deepEqual(result, { ok: true, skipped: 'no-prerequisites', findings: [] });
});

test('C006 an unfinished same-package prerequisite is PREREQUISITE_NOT_DONE', () => {
  for (const status of ['todo', 'made', 'planned', 'in_progress']) {
    const result = evaluatePrerequisites({
      prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:x' }],
      samePackageStatuses: new Map([['P0-1', status]]),
      packageStatuses: new Map(),
    });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_DONE'));
  }
});

test('C006 done and reviewed prerequisites pass', () => {
  for (const status of ['done', 'reviewed']) {
    const result = evaluatePrerequisites({
      prerequisites: [{ ticket: 'P0-1', kind: 'implementation', source: 'graph:x' }],
      samePackageStatuses: new Map([['P0-1', status]]),
      packageStatuses: new Map(),
    });
    assert.equal(result.ok, true);
  }
});

test('C006 a missing cross-package Tickets.json is PREREQUISITE_TICKETS_MISSING', () => {
  const result = evaluatePrerequisites({
    prerequisites: [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }],
    samePackageStatuses: new Map(),
    packageStatuses: new Map([['pkg-1', null]]),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_TICKETS_MISSING'));
});

test('C006 a cross-package unfinished implementer is PREREQUISITE_NOT_DONE', () => {
  const result = evaluatePrerequisites({
    prerequisites: [{ package: 'pkg-1', kind: 'implementation', source: 'sequence:s' }],
    samePackageStatuses: new Map(),
    packageStatuses: new Map([['pkg-1', [{ ticket: 'P0-1', status: 'planned', implements: true }]]]),
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_NOT_DONE'));
});
