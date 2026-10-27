// PX-325 @verifies C001 C002 C003 C004 C005 C006 C007 C008
// The implementer role is the only owner; a foreign view must not erase it. Prerequisites
// include every declared source, consolidation remaps ticket-key references, the delivery
// gate requires a real spec, and the brief names the actual reason a step is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  ownersFromViews,
  ownersFromViewsDetailed,
  ticketPrerequisites,
} from '../../.claude/scripts/sequences-slice/lib/implementation-order.mjs';
import { buildOperationOwners } from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import {
  DELIVERY_CODES,
  evaluateDistributionDelivery,
} from '../../.claude/scripts/tickets/verify-make-distribution.js';
import { renderWorkShare } from '../../.claude/scripts/tickets/show-ticket-context.js';
import { run as runPrerequisiteGate } from '../../.claude/scripts/tickets/check-ticket-prerequisites.js';
import {
  verifyPackage,
} from '../../.claude/scripts/sequences-slice/verify-implementation-order.mjs';
import { buildModel } from '../../.claude/scripts/workspacify-order/lib/levels.mjs';
import { materializeOrderWorkspace } from '../workspacify-order/helpers/order-workspace.mjs';

/** One operation unit with a role candidate and no obligation payload. */
// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
function operationUnit(operationId, roleCandidate = 'undecided') {
  return { unitId: `op-${operationId}`, operationId, roleCandidate };
}

/** One sequence step with a typed contract. */
// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
function step(id, operation, order, contract) {
  return { id, stepId: id, sequence: 'S', operation, order, contract };
}

test('C001 ownersFromViews selects the implementer role, not view presence', () => {
  const packages = [{ id: 'pkg-1' }, { id: 'pkg-2' }];
  const views = {
    'pkg-1': { packageId: 'pkg-1', ownedOperationUnits: [operationUnit('Do')], obligationUnits: [] },
    'pkg-2': { packageId: 'pkg-2', ownedOperationUnits: [operationUnit('Do')], obligationUnits: [] },
  };
  const roles = {
    'pkg-1': new Map([['op-Do', 'implementer']]),
    'pkg-2': new Map([['op-Do', 'consumer']]),
  };

  const owners = ownersFromViews({ packages, views, roles });
  const owner = owners.get('Do');

  assert.equal(owner.packageId, 'pkg-1');
  assert.deepEqual(owner.implementerPackageIds, ['pkg-1']);
  assert.notEqual(owner.ambiguous, true);
});

test('C001 the ledger role overrides a single-owner view candidate', () => {
  const packages = [{ id: 'pkg-1' }];
  const views = {
    'pkg-1': { packageId: 'pkg-1', ownedOperationUnits: [operationUnit('Do', 'implementer')], obligationUnits: [] },
  };
  const roles = { 'pkg-1': new Map([['op-Do', 'consumer']]) };

  const result = ownersFromViewsDetailed({ packages, views, roles });
  assert.equal(result.owners.get('Do').missingImplementer, true);
  assert.ok(result.findings.some((entry) => entry.code === 'OWNER_ROLE_UNDECIDED'));
});

test('C001 buildOperationOwners prefers the ledger role over the view candidate', () => {
  const view = { packageId: 'pkg-2', ownedOperationUnits: [operationUnit('X', 'implementer')], obligationUnits: [] };
  const owners = buildOperationOwners({
    view,
    workspaceRoot: null,
    tickets: [],
    rolesByPackage: { 'pkg-2': new Map([['op-X', 'consumer']]) },
  });
  assert.equal(owners.has('X'), true);
  assert.equal(owners.get('X').missingImplementer, true);
  assert.equal(owners.get('X').ambiguous, true);
});

test('C001 a foreign consumer view does not overwrite the local implementer', () => {
  const root = mkdtempSync(join(tmpdir(), 'px325-owner-'));
  try {
    writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ artifact_kind: 'workspacify-allocate-manifest' }));
    writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-1', path: 'pkg-1' }, { id: 'pkg-2', path: 'pkg-2' }] },
    }));
    mkdirSync(join(root, 'pkg-1'));
    mkdirSync(join(root, 'pkg-2'));
    writeFileSync(join(root, 'pkg-1', 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-1',
      ownedOperationUnits: [operationUnit('X')],
      obligationUnits: [],
    }));
    writeFileSync(join(root, 'pkg-1', 'Tickets.json'), JSON.stringify({
      phases: [{ id: 0, tickets: [{
        id: 1,
        phaseId: 0,
        status: 'todo',
        distribution: { units: [{ unitId: 'op-X', kind: 'operation', role: 'consumer', obligation: { mode: 'reference' } }] },
      }] }],
    }));

    const localView = { packageId: 'pkg-2', ownedOperationUnits: [operationUnit('X')], obligationUnits: [] };
    const tickets = [{
      id: 1,
      phaseId: 0,
      distribution: { units: [{ unitId: 'op-X', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } }] },
    }];

    const owners = buildOperationOwners({ view: localView, workspaceRoot: root, tickets });
    const owner = owners.get('X');

    assert.equal(owner.packageId, 'pkg-2');
    assert.equal(owner.ticketKey, 'P0-1');
    assert.notEqual(owner.ambiguous, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C002 ticketPrerequisites includes graph, sequence, build and boundary sources', () => {
  const tickets = [
    { id: 1, phaseId: 0, nodeIds: ['N1'], distribution: { units: [{ unitId: 'op-A', kind: 'operation', obligation: { mode: 'implement' } }] } },
    { id: 2, phaseId: 0, nodeIds: ['N2'], distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'implement' } }] } },
  ];
  const graph = { edges: [{ from: 'N2', to: 'N1', type: 'depends_on', attributes: { strength: 'hard' } }] };
  const artifact = {
    sequences: [{ id: 'S', outcome: 'realized' }],
    steps: [step('s1', 'A', 1, { produces: ['object:F'] }), step('s2', 'B', 2, { consumes: ['object:F'] })],
  };
  const operationOwners = new Map([
    ['A', { packageId: 'pkg-1', ticketKey: 'P0-1' }],
    ['B', { packageId: 'pkg-2', ticketKey: 'P0-2' }],
  ]);
  const { prerequisites, findings } = ticketPrerequisites({
    tickets,
    graph,
    artifact,
    operationOwners,
    registry: [{ boundary_id: 'boundary-001', provider_package: 'pkg-1', consumer_package: 'pkg-2' }],
    packageId: 'pkg-2',
    treeManifest: { dependencies: { dag: { canonical_edges: [{ from: 'pkg-2', to: 'pkg-1' }] } } },
  });

  const entries = prerequisites.get('P0-2') ?? [];
  assert.equal(findings.length, 0);
  assert.ok(entries.some((entry) => entry.ticket === 'P0-1' && entry.source.startsWith('graph:')));
  assert.ok(entries.some((entry) => entry.package === 'pkg-1' && entry.source.startsWith('sequence:')));
  assert.ok(entries.some((entry) => entry.package === 'pkg-1' && entry.source.startsWith('build:')));
  assert.ok(entries.some((entry) => entry.package === 'pkg-1' && entry.boundary === 'boundary-001'));
  assert.equal(new Set(entries.map((entry) => JSON.stringify(entry))).size, entries.length);
});

test('C004 remapTicketKeyReferences rewrites prerequisites and implementer references', async () => {
  const module = await import('../../.claude/scripts/tickets/consolidate-phase-tickets.js');
  assert.equal(typeof module.remapTicketKeyReferences, 'function');

  const document = {
    phases: [{ id: 1, tickets: [{
      id: 3,
      phaseId: 1,
      prerequisites: [{ ticket: 'P0-2', kind: 'implementation', source: 'graph:x' }],
      distribution: { units: [{
        unitId: 'op-X',
        kind: 'operation',
        obligation: { mode: 'reference', implementerTicketId: 1, implementerTicketKey: 'P0-1' },
      }] },
    }] }],
  };

  const remapped = module.remapTicketKeyReferences(document, new Map([['P0-2', 'P1-2'], ['P0-1', 'P1-1']]));
  const ticket = remapped.phases[0].tickets[0];

  assert.equal(ticket.prerequisites[0].ticket, 'P1-2');
  assert.equal(ticket.prerequisites[0].source, 'graph:x');
  assert.equal(ticket.distribution.units[0].obligation.implementerTicketId, 1);
  assert.equal(ticket.distribution.units[0].obligation.implementerTicketKey, 'P1-1');
});

test('C004 a numeric implementer id is disambiguated by the source phase', async () => {
  const module = await import('../../.claude/scripts/tickets/consolidate-phase-tickets.js');
  const document = {
    phases: [{ id: 2, tickets: [{
      id: 1,
      phaseId: 2,
      __sourcePhaseId: 1,
      distribution: { units: [{
        unitId: 'op-X',
        kind: 'operation',
        obligation: { mode: 'reference', implementerTicketId: 1 },
      }] },
    }] }],
  };

  const remapped = module.remapTicketKeyReferences(document, new Map([['P0-1', 'P1-1'], ['P1-1', 'P2-2']]));
  const obligation = remapped.phases[0].tickets[0].distribution.units[0].obligation;
  assert.equal(obligation.implementerTicketKey, 'P2-2');
  assert.equal(obligation.implementerTicketId, 2);
});

test('C007 a distributed ticket without its spec fails the delivery gate', () => {
  const ticket = {
    distribution: { units: [{ unitId: 'op-A', kind: 'operation', obligation: { mode: 'implement' } }] },
    testUnit: ['UT: op-A returns the expected result'],
    contracts: [],
  };

  const absent = evaluateDistributionDelivery(ticket, { specProvided: true, specText: null });
  assert.equal(absent.ok, false);
  assert.ok(absent.findings.some((entry) => entry.code === DELIVERY_CODES.DISTRIBUTION_SPEC_MISSING));

  // An operation-only ticket has no Work Share block; the Distribution Obligations
  // section is the whole delivery record for it.
  const operationOnly = evaluateDistributionDelivery(ticket, {
    specProvided: true,
    specText: '## Distribution Obligations\n\n### op-A\n',
  });
  assert.equal(operationOnly.ok, true);

  const sequenceTicket = {
    distribution: { units: [{ unitId: 'seq-S', kind: 'sequence', obligation: { mode: 'flow', outcome: 'realized', steps: [] } }] },
    testUnit: [],
    contracts: [],
  };
  const noWorkShare = evaluateDistributionDelivery(sequenceTicket, {
    specProvided: true,
    specText: '## Distribution Obligations\n\n### seq-S\n',
  });
  assert.equal(noWorkShare.ok, false);
  assert.ok(noWorkShare.findings.some((entry) => entry.code === DELIVERY_CODES.WORK_SHARE_SECTION_MISSING));

  const delivered = evaluateDistributionDelivery(sequenceTicket, {
    specProvided: true,
    specText: '## Distribution Obligations\n\n### Work Share\n',
  });
  assert.equal(delivered.ok, true);
});

test('C008 Work Share names the actual reason when the view is readable', () => {
  const ticket = {
    id: 1,
    phaseId: 0,
    distribution: { units: [{
      unitId: 'seq-S',
      kind: 'sequence',
      sequenceId: 'S',
      obligation: { mode: 'flow', outcome: 'realized', steps: [] },
    }] },
    contracts: [],
  };
  const view = { packageId: 'pkg-1', ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] };
  const readable = renderWorkShare(ticket, { ticketsDocument: { phases: [] }, view });
  assert.match(readable, /not step-bearing in the package view/);
  assert.doesNotMatch(readable, /package view is unreadable/);

  const unreadable = renderWorkShare(ticket, { ticketsDocument: { phases: [] }, view: null });
  assert.match(unreadable, /package view is unreadable/);
});

test('C003 verifyPackage fails on a missing view when the artifact declares a distribution', () => {
  const root = mkdtempSync(join(tmpdir(), 'px325-missing-view-'));
  try {
    writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ artifact_kind: 'workspacify-allocate-manifest', contract_registry: [] }));
    writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-2', path: 'pkg-2' }] },
    }));
    writeFileSync(join(root, 'DESIGN-sequences.json'), JSON.stringify({
      sequences: [{ id: 'S', outcome: 'realized' }],
      steps: [step('s1', 'A', 1, { produces: ['object:F'] })],
    }));
    mkdirSync(join(root, 'pkg-2'));
    writeFileSync(join(root, 'pkg-2', 'DESIGN-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }));
    writeFileSync(join(root, 'pkg-2', 'Tickets.json'), JSON.stringify({
      phases: [{ id: 0, tickets: [{
        id: 1,
        phaseId: 0,
        status: 'made',
        nodeIds: ['N2'],
        distribution: { units: [{ unitId: 'op-B', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } }] },
      }] }],
    }));

    const result = verifyPackage({ packageDir: join(root, 'pkg-2'), write: false });
    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'MISSING_PACKAGE_VIEW'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C005 the make gate re-derives a stale prerequisites field and rejects it', () => {
  const root = mkdtempSync(join(tmpdir(), 'px325-stale-prereq-'));
  try {
    writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ artifact_kind: 'workspacify-allocate-manifest', contract_registry: [] }));
    writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
      workspace: { packages: [{ id: 'pkg-1', path: 'pkg-1' }, { id: 'pkg-2', path: 'pkg-2' }] },
    }));
    writeFileSync(join(root, 'DESIGN-sequences.json'), JSON.stringify({
      sequences: [{ id: 'S', outcome: 'realized' }],
      steps: [
        step('s1', 'A', 1, { produces: ['object:F'] }),
        step('s2', 'B', 2, { consumes: ['object:F'] }),
      ],
    }));
    mkdirSync(join(root, 'pkg-1'));
    mkdirSync(join(root, 'pkg-2'));
    writeFileSync(join(root, 'pkg-1', 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-1',
      ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer' }],
      obligationUnits: [],
    }));
    writeFileSync(join(root, 'pkg-1', 'Tickets.json'), JSON.stringify({
      phases: [{ id: 0, tickets: [{
        id: 1,
        phaseId: 0,
        status: 'done',
        distribution: { units: [{ unitId: 'op-A', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } }] },
      }] }],
    }));
    writeFileSync(join(root, 'pkg-2', 'SEQUENCES.json'), JSON.stringify({
      packageId: 'pkg-2',
      ownedOperationUnits: [{ unitId: 'op-B', operationId: 'B', roleCandidate: 'implementer' }],
      obligationUnits: [],
    }));
    writeFileSync(join(root, 'pkg-2', 'DESIGN-GRAPH.json'), JSON.stringify({ nodes: [], edges: [] }));
    const consumerTicketsPath = join(root, 'pkg-2', 'Tickets.json');
    writeFileSync(consumerTicketsPath, JSON.stringify({
      phases: [{ id: 0, tickets: [{
        id: 1,
        phaseId: 0,
        status: 'made',
        nodeIds: ['N2'],
        distribution: { units: [{ unitId: 'op-B', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } }] },
      }] }],
    }));

    const result = runPrerequisiteGate(['--ticket-key=P0-1', `--tickets=${consumerTicketsPath}`, `--workspace=${root}`]);
    assert.equal(result.code, 1);
    assert.ok(result.findings.some((entry) => entry.code === 'PREREQUISITE_SET_MISMATCH'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('C006 workspacify-order refuses a stale sidecar', () => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  try {
    writeFileSync(join(workspace.root, 'WORKSPACIFY-IMPLEMENTATION-ORDER.json'), JSON.stringify({
      schemaVersion: 1,
      implementationOrder: { serial: ['pkg-0001', 'pkg-0002'], levels: [['pkg-0001'], ['pkg-0002']] },
      sourceDigests: { artifact: 'stale', views: {}, treeManifest: 'stale', registry: 'stale' },
    }));
    assert.throws(() => buildModel({
      root: workspace.root,
      treeManifest: workspace.treeManifest,
      allocateManifest: workspace.allocateManifest,
    }), /STALE_IMPLEMENTATION_ORDER/);
  } finally {
    workspace.remove();
  }
});

test('C006 workspacify-order refuses a partial view set', () => {
  const workspace = materializeOrderWorkspace({
    packages: ['pkg-0001', 'pkg-0002'],
    edges: [['pkg-0002', 'pkg-0001']],
    levels: [['pkg-0001'], ['pkg-0002']],
  });
  try {
    writeFileSync(join(workspace.root, 'DESIGN-sequences.json'), JSON.stringify({
      sequences: [],
      steps: [],
      operations: [{ id: 'Do', disposition: 'active' }],
    }));
    for (const id of ['pkg-0001', 'pkg-0002']) {
      writeFileSync(join(workspace.directoryOf(id), 'SEQUENCES.json'), JSON.stringify({
        packageId: id,
        ownedOperationUnits: [],
        ownedSequenceUnits: [],
        crossBoundarySequenceUnits: [],
        obligationUnits: [],
      }));
    }
    rmSync(join(workspace.directoryOf('pkg-0002'), 'SEQUENCES.json'));
    assert.throws(() => buildModel({
      root: workspace.root,
      treeManifest: workspace.treeManifest,
      allocateManifest: workspace.allocateManifest,
    }), /MISSING_PACKAGE_VIEW/);
  } finally {
    workspace.remove();
  }
});
