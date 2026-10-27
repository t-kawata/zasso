// PX-320 @verifies C001 C002
// A two-package chain whose operation is owned by both packages. The view is built by
// the real producer (buildPackageView), so the fixture cannot hide a producer/verifier
// drift; the map role is the only package-local difference.
import { buildPackageView } from '../../../.claude/scripts/sequences-slice/lib/view.mjs';
import {
  kindOfUnit,
  mapDigest,
  viewDigest,
} from '../../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { digestValue } from '../../../.claude/scripts/sequences-slice/lib/digest.mjs';
import { digestTicketDistribution } from '../../../.claude/scripts/tickets/add-tickets-for-phase.js';

/** The artifact a schema-valid producer emits: steps carry no order field. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function schemaArtifact({ stepCount, operationCount }) {
  const operationIds = Array.from({ length: operationCount }, (unused, index) => `Op${index + 1}`);
  return {
    spec: { lines: 100 },
    sequences: [{ id: 'S1', outcome: 'direct' }],
    steps: Array.from({ length: stepCount }, (unused, index) => ({
      id: `s${index + 1}`,
      sequence: 'S1',
      operation: operationIds[index % operationIds.length],
      line: index + 1,
      quote: `q${index + 1}`,
    })),
    operations: operationIds.map((id) => ({
      id,
      disposition: 'active',
      position: 'positioned',
      result_object_classes: ['Thing1', 'Thing2'],
      grounding: { classification: 'authored' },
    })),
  };
}

/** The tree manifest that makes both packages owners of the operation. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function twoOwnerTreeManifest() {
  return {
    inventory: {
      objects: [
        { canonical_name: 'Thing1', owner_package: 'pkg-1' },
        { canonical_name: 'Thing2', owner_package: 'pkg-2' },
      ],
    },
    structure: { segments: [] },
  };
}

/** The units a view distributes, in view order. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function viewUnits(view) {
  return [
    ...(view.ownedOperationUnits ?? []),
    ...(view.ownedSequenceUnits ?? []),
    ...(view.crossBoundarySequenceUnits ?? []),
    ...(view.obligationUnits ?? []),
  ];
}

/** The distribution map rendered from the view, with the package role fixed. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function mapFor(view, role) {
  const map = {
    schemaVersion: 1,
    packageId: view.packageId,
    sourceViewDigest: viewDigest(view),
    units: viewUnits(view).map((unit) => ({
      unitId: unit.unitId,
      kind: kindOfUnit(unit.unitId),
      ...(kindOfUnit(unit.unitId) === 'operation' ? { role } : {}),
      owners: [view.packageId],
      sections: ['1'],
      ground: 'fixture',
    })),
    residuals: [],
  };
  map.digest = mapDigest(map);
  return map;
}

/** The graph and Dirs-Tree index for one node carrying every unit. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function graphAndDirs(map) {
  const unitIds = (map.units ?? []).map((unit) => unit.unitId);
  const graph = {
    sourceFile: 'RFC.md',
    distributionDigest: map.digest,
    nodes: [{ id: 'N0001', unitIds }],
    edges: [],
  };
  const units = Object.fromEntries(unitIds.map((unitId) => [
    unitId,
    { nodeIds: ['N0001'], paths: ['src/impl.rs'] },
  ]));
  return { graph, dirsTree: { distribution: { digest: map.digest, units } } };
}

/** The ticket obligation for one unit. */
// [::TICKET::] PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-320 --for-spec --no-implementation-order`.
function obligationFor(unit, role, ticketMode) {
  if (kindOfUnit(unit.unitId) === 'operation') {
    const mode = ticketMode ?? (role === 'implementer' ? 'implement' : 'reference');
    return { mode };
  }
  if (kindOfUnit(unit.unitId) === 'sequence' || kindOfUnit(unit.unitId) === 'cross-boundary-sequence') {
    return { mode: 'steps', outcome: 'direct', steps: unit.steps ?? [] };
  }
  return { mode: 'obligation' };
}

/** A complete verifyChain input for one package. */
export function buildConsumerChainFixture({
  role = 'implementer',
  ticketMode = null,
  stepCount = 1,
  operationCount = 1,
} = {}) {
  const artifact = schemaArtifact({ stepCount, operationCount });
  const treeManifest = twoOwnerTreeManifest();
  const packageId = role === 'implementer' ? 'pkg-1' : 'pkg-2';
  const view = buildPackageView({ artifact, treeManifest, packageSegments: [], obligations: {} }, packageId);
  const map = mapFor(view, role);
  const { graph, dirsTree } = graphAndDirs(map);
  const units = viewUnits(view);
  const ticketUnits = units.map((unit) => ({
    unitId: unit.unitId,
    kind: kindOfUnit(unit.unitId),
    obligation: obligationFor(unit, role, ticketMode),
  }));
  const ticketDigest = digestTicketDistribution({
    sourceMapDigest: map.digest,
    sourceViewDigest: map.sourceViewDigest,
    units: ticketUnits,
  });
  const ticket = {
    id: 1,
    phaseId: 0,
    nodeIds: ['N0001', ...units.map((unit) => unit.unitId)],
    distribution: {
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      units: ticketUnits,
      digest: ticketDigest,
    },
    contracts: [],
  };
  const ticketDigests = { 'P0-1': ticketDigest };
  const tickets = {
    phases: [{ id: 0, nodeIds: ['N0001'], tickets: [ticket] }],
    distribution: {
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      ticketDigests,
      digest: digestValue({ ticketDigests }),
    },
  };
  return { view, map, graph, dirsTree, tickets, artifact, treeManifest, registry: [] };
}

/** The step-bearing unit of the fixture, for reorder tests. */
export function sequenceStepUnit(view) {
  return (view.crossBoundarySequenceUnits ?? [])[0]
    ?? (view.ownedSequenceUnits ?? [])[0]
    ?? null;
}
