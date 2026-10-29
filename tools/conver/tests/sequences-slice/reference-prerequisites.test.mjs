// PX-329 @verifies C001 C002 C003
// A reference operation unit is a declared dependency: the consumer ticket may not
// enter make while the ticket or package that implements the operation is unfinished.
// The split gate and the entry gate read this one derivation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ticketPrerequisites } from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';

// [::TICKET::] PX-329 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-329 --for-spec --no-implementation-order`.
function operationUnit(unitId, obligation = { mode: 'implement' }, role = 'implementer') {
  return { unitId, kind: 'operation', role, obligation };
}

// [::TICKET::] PX-329 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-329 --for-spec --no-implementation-order`.
function ticket(id, units, nodeIds = []) {
  return { id, phaseId: 0, nodeIds, distribution: { units } };
}

// [::TICKET::] PX-329 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-329 --for-spec --no-implementation-order`.
function samePackageReference(implementerTicketKey = 'P0-1', implementerTicketId = 1) {
  return operationUnit('op-X', {
    mode: 'reference',
    implementerTicketId,
    implementerTicketKey,
    providers: [],
  }, 'consumer');
}

test('C001 a same-package reference unit becomes a ticket prerequisite', () => {
  const tickets = [
    ticket(1, [operationUnit('op-X')], ['N1']),
    ticket(2, [samePackageReference()], ['N2']),
  ];
  const operationOwners = new Map([['X', { packageId: 'pkg-1', ticketKey: 'P0-1' }]]);

  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph: { edges: [] },
    operationOwners,
    packageId: 'pkg-1',
  });

  assert.deepEqual(prerequisites.get('P0-2'), [{
    ticket: 'P0-1',
    kind: 'implementation',
    source: 'reference:op-X',
  }]);
  assert.deepEqual(findings, []);
});

test('C002 a cross-package reference unit becomes a package prerequisite', () => {
  const tickets = [
    ticket(2, [operationUnit('op-X', {
      mode: 'reference',
      implementerTicketId: null,
      providers: ['pkg-2'],
    }, 'consumer')], ['N2']),
  ];

  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph: { edges: [] },
    packageId: 'pkg-1',
  });

  assert.deepEqual(prerequisites.get('P0-2'), [{
    package: 'pkg-2',
    kind: 'implementation',
    source: 'reference:op-X',
  }]);
  assert.deepEqual(findings, []);
});

test('C001 a reference to the ticket itself adds no self-edge', () => {
  const tickets = [ticket(1, [samePackageReference('P0-1', 1)], ['N1'])];

  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph: { edges: [] },
    packageId: 'pkg-1',
  });

  assert.equal(prerequisites.has('P0-1'), false);
  assert.deepEqual(findings, []);
});

test('C001 a graph prerequisite for the same provider is not duplicated', () => {
  const tickets = [
    ticket(1, [operationUnit('op-X')], ['N1']),
    ticket(2, [samePackageReference()], ['N2']),
  ];
  const graph = { edges: [{ from: 'N2', to: 'N1', type: 'depends_on' }] };
  const operationOwners = new Map([['X', { packageId: 'pkg-1', ticketKey: 'P0-1' }]]);

  const { prerequisites } = ticketPrerequisites({
    tickets,
    graph,
    operationOwners,
    packageId: 'pkg-1',
  });

  const entries = prerequisites.get('P0-2');
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, 'graph:depends_on:N2->N1');
});

test('C003 an unresolved reference is MISSING_IMPLEMENTER, never a skip', () => {
  const tickets = [
    ticket(2, [operationUnit('op-X', {
      mode: 'reference',
      implementerTicketId: null,
      providers: [],
    }, 'consumer')], ['N2']),
  ];

  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph: { edges: [] },
    packageId: 'pkg-1',
  });

  assert.equal((prerequisites.get('P0-2') ?? []).length, 0);
  assert.ok(findings.some((entry) => entry.code === 'MISSING_IMPLEMENTER' && entry.subject === 'op-X'));
});

test('C003 a non-active reference operation adds no prerequisite and no finding', () => {
  const tickets = [
    ticket(2, [samePackageReference()], ['N2']),
  ];

  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph: { edges: [] },
    packageId: 'pkg-1',
    activeOperationIds: new Set(['Y']),
  });

  assert.equal(prerequisites.has('P0-2'), false);
  assert.deepEqual(findings, []);
});
