/**
 * The smallest two-package distribution that proves the graph-stage scope.
 *
 * The package view declares A-1 and boundary-001. The workspace artifact also carries
 * B-1 and the registry also carries boundary-002; a verifier that reads the global
 * sidecars without scoping reports both as local omissions.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  mapDigest,
  renderDistributionMap,
  viewDigest,
} from '../../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { digestValue } from '../../../.claude/scripts/sequences-slice/lib/digest.mjs';
import {
  boundaryClauseDigest,
  boundaryContractProjection,
  boundaryNote,
} from '../../../.claude/scripts/sequences-slice/lib/boundary-contract.mjs';

export const VIEW_PACKAGE = 'pkg-0001';

export const REGISTRY = [
  {
    boundary_id: 'boundary-001',
    provider_package: 'pkg-0001',
    consumer_package: 'pkg-0002',
    clauses: { preconditions: ['identity present'], postconditions: ['order_id derived'], invariants: ['one active order_id'] },
  },
  {
    boundary_id: 'boundary-002',
    provider_package: 'pkg-0002',
    consumer_package: 'pkg-0003',
    clauses: { preconditions: ['foreign provider'], postconditions: ['foreign consumer'], invariants: ['foreign invariant'] },
  },
];

/** A deep copy so a mutation test changes one layer, not all layers. */
// [::TICKET::] PX-314 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-314 --for-spec --no-implementation-order`.
function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

/** One consistent package chain plus one foreign step and boundary. */
export function multiPackageFixture(options = {}) {
  const stepContract = {
    pre: [{ factId: 'identity', text: 'identity present' }],
    post: [{ factId: 'order', text: 'order_id derived' }],
    invariants: [{ factId: 'active', text: 'one active order_id' }],
  };
  const viewStep = {
    stepId: 'A-1__ProduceFact',
    operationId: 'ProduceFact',
    order: 1,
    line: 1,
    quote: 'produce',
    contract: copy(stepContract),
    contractProse: 'produce',
  };
  const view = {
    packageId: VIEW_PACKAGE,
    ownedOperationUnits: [{ unitId: 'op-ProduceFact', operationId: 'ProduceFact', ownerPackageIds: [VIEW_PACKAGE] }],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      ownerPackageIds: [VIEW_PACKAGE],
      steps: [viewStep],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{
      unitId: 'ctr-boundary-001',
      kind: 'contract',
      subject: 'boundary-001',
      relation: 'carries',
      direction: 'provides',
      counterpart: 'pkg-0002',
    }],
  };
  const map = {
    schemaVersion: 1,
    packageId: VIEW_PACKAGE,
    sourceViewDigest: viewDigest(view),
    units: [
      { unitId: 'op-ProduceFact', kind: 'operation', owners: [VIEW_PACKAGE], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'seq-A-1', kind: 'sequence', owners: [VIEW_PACKAGE], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'ctr-boundary-001', kind: 'contract', owners: [VIEW_PACKAGE], sections: ['1.1'], ground: 'fixture' },
    ].sort((left, right) => left.unitId.localeCompare(right.unitId)),
    residuals: [],
  };
  map.digest = mapDigest(map);

  const registryContract = boundaryContractProjection(REGISTRY[0], 'C900');
  const graph = {
    distributionDigest: map.digest,
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-ProduceFact', 'seq-A-1'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false, note: boundaryNote(REGISTRY[0]) },
      contracts: [registryContract],
    }],
  };
  const dirsTree = {
    distribution: {
      digest: map.digest,
      units: {
        'op-ProduceFact': { nodeIds: ['N0002'], paths: ['src/produce.rs'] },
        'seq-A-1': { nodeIds: ['N0002'], paths: ['src/produce.rs'] },
        'ctr-boundary-001': { nodeIds: ['N0001'], paths: ['src/boundary.rs'] },
      },
    },
  };
  const ticketUnits = [
    { unitId: 'op-ProduceFact', obligation: { mode: 'implement' } },
    { unitId: 'seq-A-1', obligation: { mode: 'steps', steps: [copy(viewStep)] } },
    { unitId: 'ctr-boundary-001', obligation: { mode: 'obligation' } },
  ];
  const ticketDigest = digestValue({
    sourceMapDigest: map.digest,
    sourceViewDigest: map.sourceViewDigest,
    units: ticketUnits,
  });
  const tickets = {
    distribution: {
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      ticketDigests: { 1: ticketDigest },
      digest: digestValue({ ticketDigests: { 1: ticketDigest } }),
    },
    phases: [{
      id: 0,
      tickets: [{
        id: 1,
        nodeIds: ['N0001', 'N0002', 'ctr-boundary-001', 'op-ProduceFact', 'seq-A-1'],
        distribution: {
          sourceMapDigest: map.digest,
          sourceViewDigest: map.sourceViewDigest,
          units: ticketUnits,
          digest: ticketDigest,
        },
        contracts: [{
          ...copy(registryContract),
          id: 'contract-boundary-001',
          boundaryId: 'boundary-001',
          registryContractId: 'contract-boundary-001',
          clauseDigest: boundaryClauseDigest(REGISTRY[0]),
        }],
      }],
    }],
  };
  const artifact = {
    sequences: [{ id: 'A-1', outcome: 'singleStep' }, { id: 'B-1', outcome: 'singleStep' }],
    steps: [
      {
        id: 'A-1__ProduceFact',
        sequence: 'A-1',
        operation: 'ProduceFact',
        order: 1,
        line: 1,
        contract: copy(stepContract),
        contract_prose: 'produce',
      },
      {
        id: 'B-1__Foreign',
        sequence: 'B-1',
        operation: 'ForeignOp',
        order: 1,
        line: 2,
        contract: { pre: [], post: [], invariants: [] },
        contract_prose: 'foreign',
      },
    ],
  };

  if (options.obligationOnly === true) {
    view.ownedSequenceUnits = [];
    view.crossBoundarySequenceUnits = [];
    view.obligationUnits.push({ unitId: 'seq-A-1', kind: 'sequence', subject: 'A-1' });
    map.sourceViewDigest = viewDigest(view);
    map.digest = mapDigest(map);
    graph.distributionDigest = map.digest;
    dirsTree.distribution.digest = map.digest;
    tickets.distribution.sourceMapDigest = map.digest;
    tickets.distribution.sourceViewDigest = map.sourceViewDigest;
    tickets.phases[0].tickets[0].distribution.sourceMapDigest = map.digest;
    tickets.phases[0].tickets[0].distribution.sourceViewDigest = map.sourceViewDigest;
    tickets.phases[0].tickets[0].distribution.units = [
      { unitId: 'op-ProduceFact', obligation: { mode: 'implement' } },
      { unitId: 'ctr-boundary-001', obligation: { mode: 'obligation' } },
    ];
    tickets.distribution.ticketDigests = { 1: digestValue({
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      units: tickets.phases[0].tickets[0].distribution.units,
    }) };
    tickets.distribution.digest = digestValue({ ticketDigests: tickets.distribution.ticketDigests });
  }

  if (options.contractMutation === true) artifact.steps[0].contract.pre[0].text = 'tampered';
  if (options.directionFlip === true) {
    graph.edges[0].attributes.bidirectional = true;
    graph.edges[0].from = 'N0002';
    graph.edges[0].to = 'N0001';
  }
  if (options.duplicateStep === true) {
    tickets.phases[0].tickets[0].distribution.units[1].obligation.steps.push(copy(viewStep));
  }

  return { view, map, graph, dirsTree, tickets, registry: REGISTRY, artifact };
}

/** Write one package's derived files; the map is rendered into RFC.md. */
export function writePackage(packageDir, fixture, { withDirs = true } = {}) {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'SEQUENCES.json'), JSON.stringify(fixture.view, null, 2));
  writeFileSync(join(packageDir, 'RFC.md'), `# Package\n\n${renderDistributionMap(fixture.map)}\n`);
  writeFileSync(join(packageDir, 'P-GRAPH.json'), JSON.stringify(fixture.graph, null, 2));
  if (withDirs) {
    writeFileSync(join(packageDir, 'P-Dirs-Tree.json'), JSON.stringify(fixture.dirsTree, null, 2));
  }
  if (fixture.tickets !== undefined) {
    writeFileSync(join(packageDir, 'Tickets.json'), JSON.stringify(fixture.tickets, null, 2));
  }
}

/** Write the workspace manifests that make findAllocateManifest succeed. */
export function writeWorkspaceManifests(root, registry = REGISTRY) {
  writeFileSync(join(root, 'WORKSPACIFY-TREE-MANIFEST.json'), JSON.stringify({
    dependencies: { boundaries: registry.map((row) => ({ id: row.boundary_id })) },
  }));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: registry }));
}
