// PX-330 @verifies C004
// The displayed implementation order must agree with the live rule. Ticket-declared roles
// change which package implements a step, so a sidecar that only digests the artifact,
// views, tree and registry cannot be trusted after a ticket edit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { materializeOrderWorkspace } from './helpers/order-workspace.mjs';
import { digestValue } from '../../.claude/scripts/sequences-slice/lib/digest.mjs';
import { buildModel } from '../../.claude/scripts/workspacify-order/lib/levels.mjs';

const PACKAGES = ['pkg-0001', 'pkg-0002'];

/** The artifact whose data relation orders the two steps. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
function artifact() {
  return {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [
      { id: 's1', stepId: 's1', sequence: 'S', operation: 'A', order: 1, contract: { produces: ['fact:X'] } },
      { id: 's2', stepId: 's2', sequence: 'S', operation: 'B', order: 2, contract: { consumes: ['fact:X'] } },
    ],
    operations: [{ id: 'A' }, { id: 'B' }],
  };
}

/** Both views carry both operations; the ticket roles decide the implementer. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
function view(packageId) {
  const operation = (operationId) => ({
    unitId: `op-${operationId}`,
    operationId,
    ownerPackageIds: PACKAGES,
    roleCandidate: 'undecided',
  });
  return {
    packageId,
    ownedOperationUnits: [operation('A'), operation('B')],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

/** One package's ticket document. The caller owns the role assignment. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
function tickets(units) {
  return {
    title: 'fixture',
    metadata: {},
    phases: [{ id: 0, tickets: [{ id: 1, phaseId: 0, status: 'todo', distribution: { units } }] }],
  };
}

/** The first role assignment: pkg-0001 implements A, pkg-0002 implements B. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
function firstRoles() {
  return {
    'pkg-0001': tickets([
      { unitId: 'op-A', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } },
    ]),
    'pkg-0002': tickets([
      { unitId: 'op-A', kind: 'operation', role: 'consumer', obligation: { mode: 'reference', providers: [] } },
      { unitId: 'op-B', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } },
    ]),
  };
}

/** The edited assignment: pkg-0002 implements A, pkg-0001 implements B. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
function editedRoles() {
  return {
    'pkg-0001': tickets([
      { unitId: 'op-A', kind: 'operation', role: 'consumer', obligation: { mode: 'reference', providers: [] } },
      { unitId: 'op-B', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } },
    ]),
    'pkg-0002': tickets([
      { unitId: 'op-A', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } },
    ]),
  };
}

/** Write the views, artifact, tickets and a digest-fresh sidecar. */
// [::TICKET::] PX-330 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-330 --for-spec --no-implementation-order`.
function materialize(roleSet, sidecarLevels) {
  const workspace = materializeOrderWorkspace({ packages: PACKAGES, edges: [] });
  const design = artifact();
  writeFileSync(join(workspace.root, 'DESIGN-sequences.json'), JSON.stringify(design));
  for (const packageId of PACKAGES) {
    writeFileSync(workspace.viewPathOf(packageId), JSON.stringify(view(packageId)));
    writeFileSync(join(workspace.directoryOf(packageId), 'Tickets.json'), JSON.stringify(roleSet[packageId]));
  }
  writeFileSync(join(workspace.root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json'), JSON.stringify({
    schemaVersion: 1,
    buildOrder: workspace.allocateManifest.implementation_order,
    implementationOrder: { serial: sidecarLevels.flat(), levels: sidecarLevels },
    prerequisites: [],
    sourceDigests: {
      artifact: digestValue(design),
      views: Object.fromEntries(PACKAGES.map((packageId) => [packageId, digestValue(view(packageId))])),
      registry: digestValue([]),
      treeManifest: digestValue(workspace.treeManifest),
    },
  }));
  return workspace;
}

test('C004 a sidecar that agrees with the live derivation is displayed', () => {
  const workspace = materialize(firstRoles(), [['pkg-0001'], ['pkg-0002']]);
  try {
    const model = buildModel({
      root: workspace.root,
      treeManifest: workspace.treeManifest,
      allocateManifest: workspace.allocateManifest,
    });
    assert.equal(model.orderSource, 'implementation');
    assert.deepEqual(model.implementationSerial, ['pkg-0001', 'pkg-0002']);
  } finally {
    workspace.remove();
  }
});

test('C004 a digest-fresh sidecar is refused when only the ticket roles moved the order', () => {
  const workspace = materialize(firstRoles(), [['pkg-0001'], ['pkg-0002']]);
  try {
    for (const packageId of PACKAGES) {
      writeFileSync(
        join(workspace.directoryOf(packageId), 'Tickets.json'),
        JSON.stringify(editedRoles()[packageId]),
      );
    }
    assert.throws(() => buildModel({
      root: workspace.root,
      treeManifest: workspace.treeManifest,
      allocateManifest: workspace.allocateManifest,
    }), /STALE_IMPLEMENTATION_ORDER|disagrees with the live/);
  } finally {
    workspace.remove();
  }
});
