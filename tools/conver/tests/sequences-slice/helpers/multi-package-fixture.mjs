/**
 * The smallest two-package distribution that proves the graph-stage scope.
 *
 * The package view declares A-1 and boundary-001. The workspace artifact also carries
 * B-1 and the registry also carries boundary-002; a verifier that reads the global
 * sidecars without scoping reports both as local omissions.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotDesignFiles } from '../../../.claude/scripts/regeneration/lib/staging.mjs';

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
import {
  projectStepContracts,
  stepContractEntry,
  stepNotesByEdge,
} from '../../../.claude/scripts/rfc-graph/lib/step-contracts.mjs';
import { composeNote } from '../../../.claude/scripts/rfc-graph/lib/note-parts.mjs';

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
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-317 --for-spec --no-implementation-order`.
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
export function multiPackageFixture(options = {}) {
  const stepContract = {
    pre: [{ factId: 'identity', text: 'identity present' }],
    post: [{ factId: 'order', text: 'order_id derived' }],
    invariants: [{ factId: 'active', text: 'one active order_id' }],
  };
  const viewStep = {
    stepId: 'A-1__ProduceFact',
    operationId: 'ProduceFact',
    order: 0,
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
        quote: 'produce',
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

  // The fixture carries a step-bearing view, so it must also carry the sidecar and the
  // bounded pointer the graph verifier now requires. Project with the real producer so
  // the fixture cannot drift from the verifier.
  const stepProjection = projectStepContracts({ view, graph });
  if (stepProjection.ok) {
    for (const { edge, note } of stepNotesByEdge(graph, stepProjection.sidecar).values()) {
      edge.attributes = {
        ...(edge.attributes ?? {}),
        note: composeNote(edge.attributes?.note, note, { limit: 240, replacePrefixes: ['step:', 'step-sidecar;'] }),
      };
    }
    if (stepProjection.sidecar.steps.length > 0) {
      tickets.phases[0].tickets[0].contracts.push(stepContractEntry(stepProjection.sidecar.steps[0], 0));
    }
  }

  return { view, map, graph, dirsTree, tickets, registry: REGISTRY, artifact, stepSidecar: stepProjection.sidecar };
}

/** Write one package's derived files; the map is rendered into RFC.md. */
export function writePackage(packageDir, fixture, { withDirs = true } = {}) {
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'SEQUENCES.json'), JSON.stringify(fixture.view, null, 2));
  writeFileSync(join(packageDir, 'RFC.md'), `# Package\n\n${renderDistributionMap(fixture.map)}\n`);
  writeFileSync(join(packageDir, 'P-GRAPH.json'), JSON.stringify(fixture.graph, null, 2));
  if (fixture.stepSidecar !== undefined) {
    writeFileSync(join(packageDir, 'RFC-STEP-CONTRACTS.json'), JSON.stringify(fixture.stepSidecar, null, 2));
  }
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
    workspace: { packages: [{ id: VIEW_PACKAGE, path: 'pkg' }] },
    dependencies: { boundaries: registry.map((row) => ({ id: row.boundary_id })) },
  }));
  writeFileSync(join(root, 'WORKSPACIFY-ALLOCATE-MANIFEST.json'), JSON.stringify({ contract_registry: registry }));
}

/** The verdict a passing smooth run records. */
const PASS_VERDICT = Object.freeze({
  exitCode: 0,
  findings: 0,
  blocked: 0,
  withheld: 0,
  readings: 0,
});

/** The digest smooth-sequences/run.mjs computes from the frozen design snapshot. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
function designInputDigest(root) {
  const snapshot = snapshotDesignFiles(root);
  const lines = Object.keys(snapshot).sort().map((path) => `${path}\u0000${snapshot[path]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}

/** The single root `*-sequences.json`, or null. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function rootArtifactPath(root) {
  const matches = readdirSync(root).filter((name) => name.endsWith('-sequences.json'));
  return matches.length === 1 ? join(root, matches[0]) : null;
}

/** The sha256 of a file the gate reads. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function sha256OfFile(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Write smooth-sequences/status.json and, when requested, the completion certificate.
 *
 * Call this after every design file exists: the input digest covers the whole snapshot.
 */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export function writeSmoothVerdict(root, options = {}) {
  const {
    verdict = PASS_VERDICT,
    certificate = 'complete',
    artifactDigest = null,
  } = options;
  const smoothDirectory = join(root, 'smooth-sequences');
  mkdirSync(smoothDirectory, { recursive: true });
  const artifactPath = rootArtifactPath(root);
  const resolvedArtifactDigest = artifactDigest ?? (artifactPath === null ? null : sha256OfFile(artifactPath));
  const status = {
    schemaVersion: 2,
    generation: 106,
    mode: 'new generation',
    measuredAt: '2026-10-26T00:00:00.000Z',
    inputDigest: designInputDigest(root),
    reportDigest: '9f'.repeat(32),
    findingKeysDigest: 'e3'.repeat(32),
    schemaHistory: [3, 2, 3, 2, 3],
    calibrationDigest: '63'.repeat(32),
    verdict,
    remainingOpen: 0,
    effortDebt: 0,
    assuranceSchemaVersion: 1,
  };
  const statusPath = join(smoothDirectory, 'status.json');
  writeFileSync(statusPath, JSON.stringify(status, null, 2));
  let certificatePath = null;
  if (certificate !== null) {
    certificatePath = join(smoothDirectory, 'COMPLETION-CERTIFICATE.json');
    writeFileSync(certificatePath, JSON.stringify({
      schemaVersion: 1,
      status: certificate,
      inputs: { artifact: resolvedArtifactDigest },
    }, null, 2));
  }
  return { status, statusPath, certificatePath, artifactDigest: resolvedArtifactDigest, inputDigest: status.inputDigest };
}

/** Write the workspace-level receipt through the real gate. */
// [::TICKET::] PX-316 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-316 --for-spec --no-implementation-order`.
export async function writeSmoothReceipt(packageDir) {
  const { verifySmoothVerdict } = await import('../../../.claude/scripts/sequences-slice/lib/smooth-verdict.mjs');
  return verifySmoothVerdict({ packageDir, writeReceipt: true });
}
