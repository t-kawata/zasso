// PX-330 @verifies C008
// A reference unit is a declared dependency, but its direction is not always the
// implementation direction. When the operation crosses a boundary connecting the two
// packages, the boundary contract (and the boundary edge) already carries the relation:
// the reference must not add a second, possibly opposite, prerequisite. A reference with
// no connecting boundary is a genuine implementation prerequisite.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPlacement,
  derivePackagePrecedence,
  ownersFromViewsDetailed,
  ticketPrerequisites,
  topologicalOrder,
} from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';

/** Both packages see the operation; the ticket roles decide which one implements it. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function views() {
  const operation = {
    unitId: 'op-X',
    operationId: 'X',
    ownerPackageIds: ['pkg-consumer', 'pkg-provider'],
    roleCandidate: 'undecided',
  };
  return {
    'pkg-consumer': {
      packageId: 'pkg-consumer',
      ownedOperationUnits: [operation],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    },
    'pkg-provider': {
      packageId: 'pkg-provider',
      ownedOperationUnits: [operation],
      ownedSequenceUnits: [],
      crossBoundarySequenceUnits: [],
      obligationUnits: [],
    },
  };
}

/** The two roles, with the provider as the implementer. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function roles() {
  return {
    'pkg-consumer': new Map([['op-X', 'consumer']]),
    'pkg-provider': new Map([['op-X', 'implementer']]),
  };
}

// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function owners() {
  return ownersFromViewsDetailed({
    packages: [{ id: 'pkg-consumer' }, { id: 'pkg-provider' }],
    views: views(),
    roles: roles(),
  }).owners;
}

/** The artifact with the operation's step crossing one boundary. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function artifact(boundaryId) {
  return {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [{
      id: 's1',
      stepId: 's1',
      sequence: 'S',
      operation: 'X',
      order: 1,
      contract: { crosses: boundaryId === null ? [] : [boundaryId] },
    }],
    operations: [{ id: 'X' }],
  };
}

/** One registry row with its direction. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function registryRow(provider, consumer) {
  return {
    boundary_id: 'boundary-001',
    provider_package: provider,
    consumer_package: consumer,
    clauses: {},
  };
}

// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function consumerTicket() {
  return {
    id: 1,
    phaseId: 0,
    distribution: {
      units: [{
        unitId: 'op-X',
        kind: 'operation',
        role: 'consumer',
        obligation: { mode: 'reference', providers: ['pkg-provider'] },
      }],
    },
  };
}

// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function precedenceOf({ design, registry }) {
  return derivePackagePrecedence({
    artifact: design,
    registry,
    operationOwners: owners(),
    treeManifest: { dependencies: { dag: { canonical_edges: [] } } },
  });
}

// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function prerequisitesOf({ design, registry }) {
  return ticketPrerequisites({
    tickets: [consumerTicket()],
    graph: { edges: [] },
    artifact: design,
    registry,
    operationOwners: owners(),
    packageId: 'pkg-consumer',
    treeManifest: { dependencies: { dag: { canonical_edges: [] } } },
  });
}

test('C008 a boundary-backed reference adds no reference edge (same direction)', () => {
  const design = artifact('boundary-001');
  const registry = [registryRow('pkg-provider', 'pkg-consumer')];
  const precedence = precedenceOf({ design, registry });
  assert.ok(precedence.edges.some((edge) => edge.kind === 'boundary'));
  assert.ok(!precedence.edges.some((edge) => edge.kind === 'reference'), JSON.stringify(precedence.edges));
});

test('C008 a boundary: prefixed crossing is recognized as the same boundary', () => {
  const design = artifact('boundary:boundary-001');
  const registry = [registryRow('pkg-provider', 'pkg-consumer')];
  const precedence = precedenceOf({ design, registry });
  assert.ok(!precedence.edges.some((edge) => edge.kind === 'reference'), JSON.stringify(precedence.edges));
});

test('C008 a boundary-backed reference adds no reference edge (reverse direction)', () => {
  const design = artifact('boundary-001');
  const registry = [registryRow('pkg-consumer', 'pkg-provider')];
  const precedence = precedenceOf({ design, registry });
  assert.ok(precedence.edges.some(
    (edge) => edge.kind === 'boundary' && edge.fromPackage === 'pkg-consumer' && edge.toPackage === 'pkg-provider',
  ));
  assert.ok(!precedence.edges.some((edge) => edge.kind === 'reference'), JSON.stringify(precedence.edges));
});

test('C008 a same-direction boundary carries the prerequisite, not the reference', () => {
  const design = artifact('boundary-001');
  const registry = [registryRow('pkg-provider', 'pkg-consumer')];
  const result = prerequisitesOf({ design, registry });
  assert.deepEqual(result.prerequisites.get('P0-1'), [{
    package: 'pkg-provider',
    kind: 'implementation',
    source: 'boundary:boundary-001',
    boundary: 'boundary-001',
  }]);
});

test('C008 a reverse boundary leaves the consumer with no implementation prerequisite', () => {
  const design = artifact('boundary-001');
  const registry = [registryRow('pkg-consumer', 'pkg-provider')];
  const result = prerequisitesOf({ design, registry });
  assert.equal(result.prerequisites.has('P0-1'), false);
  assert.deepEqual(result.findings, []);
});

test('C008 a reference with no connecting boundary becomes a package prerequisite and edge', () => {
  const design = artifact(null);
  const precedence = precedenceOf({ design, registry: [] });
  assert.ok(precedence.edges.some(
    (edge) => edge.kind === 'reference' && edge.fromPackage === 'pkg-provider' && edge.toPackage === 'pkg-consumer',
  ), JSON.stringify(precedence.edges));

  const result = prerequisitesOf({ design, registry: [] });
  assert.deepEqual(result.prerequisites.get('P0-1'), [{
    package: 'pkg-provider',
    kind: 'implementation',
    source: 'reference:op-X',
  }]);
});

test('C008 the provider-first order accepts the no-boundary consumer placement', () => {
  const design = artifact(null);
  const precedence = precedenceOf({ design, registry: [] });
  const order = topologicalOrder({
    nodes: ['pkg-consumer', 'pkg-provider'],
    edges: precedence.edges.map((edge) => ({ from: edge.fromPackage, to: edge.toPackage, source: edge.source })),
  });
  assert.deepEqual(order.serial, ['pkg-provider', 'pkg-consumer']);
  const placement = checkPlacement({
    tickets: [{
      id: 1,
      phaseId: 0,
      prerequisites: [{ package: 'pkg-provider', kind: 'implementation', source: 'reference:op-X' }],
    }],
    packageId: 'pkg-consumer',
    packageOrder: Object.fromEntries(order.levels.flatMap((ids, index) => ids.map((id) => [id, index]))),
    packageTickets: { 'pkg-provider': { phases: [] } },
  });
  assert.deepEqual(placement.findings, []);
});
