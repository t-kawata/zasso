// PX-330 @verifies C008
// A reference unit names the package that implements the operation it consumes. That is
// an implementation dependency even when no build, boundary or sequence edge states it,
// so the package order must carry the same relation the ticket prerequisite does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPlacement,
  derivePackagePrecedence,
  ownersFromViewsDetailed,
  topologicalOrder,
} from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';

/** Both packages see the operation; the ticket roles decide which one implements it. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
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

test('C008 a consumer role records the consuming package', () => {
  const result = ownersFromViewsDetailed({
    packages: [{ id: 'pkg-consumer' }, { id: 'pkg-provider' }],
    views: views(),
    roles: {
      'pkg-consumer': new Map([['op-X', 'consumer']]),
      'pkg-provider': new Map([['op-X', 'implementer']]),
    },
  });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.owners.get('X').consumerPackageIds, ['pkg-consumer']);
});

test('C008 the reference relation places the implementer package first', () => {
  const owners = ownersFromViewsDetailed({
    packages: [{ id: 'pkg-consumer' }, { id: 'pkg-provider' }],
    views: views(),
    roles: {
      'pkg-consumer': new Map([['op-X', 'consumer']]),
      'pkg-provider': new Map([['op-X', 'implementer']]),
    },
  }).owners;
  const precedence = derivePackagePrecedence({
    artifact: { sequences: [], steps: [], operations: [] },
    operationOwners: owners,
    treeManifest: { dependencies: { dag: { canonical_edges: [] } } },
  });
  assert.ok(precedence.edges.some(
    (edge) => edge.fromPackage === 'pkg-provider'
      && edge.toPackage === 'pkg-consumer'
      && edge.kind === 'reference',
  ), JSON.stringify(precedence.edges));

  const order = topologicalOrder({
    nodes: ['pkg-consumer', 'pkg-provider'],
    edges: precedence.edges.map((edge) => ({ from: edge.fromPackage, to: edge.toPackage, source: edge.source })),
  });
  assert.deepEqual(order.serial, ['pkg-provider', 'pkg-consumer']);
});

test('C008 the consumer package prerequisite passes placement under that order', () => {
  const placement = checkPlacement({
    tickets: [{
      id: 1,
      phaseId: 0,
      prerequisites: [{ package: 'pkg-provider', kind: 'implementation', source: 'reference:op-X' }],
    }],
    packageId: 'pkg-consumer',
    packageOrder: { 'pkg-provider': 0, 'pkg-consumer': 1 },
    packageTickets: { 'pkg-provider': { phases: [] } },
  });
  assert.deepEqual(placement.findings, []);
});
