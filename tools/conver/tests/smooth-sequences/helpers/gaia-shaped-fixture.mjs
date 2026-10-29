/**
 * A synthetic workspace shaped like the audited gaia counts.
 *
 * The fixture is built from the same neutral helpers as the clean fixture; it contains
 * no gaia record. Its purpose is to make every new PX-284 check fire by construction,
 * so a green test proves the check exists rather than proving a particular project.
 */
import {
  defaultAllocateManifest,
  defaultTreeManifest,
  defaultViews,
  materializeSmoothWorkspace,
  minimalV3Artifact,
  operationRow,
  rfcBody,
} from './workspace-fixture.mjs';

const PROVIDER = 'pkg-0001';
const CONSUMER = 'pkg-0002';
const BOUNDARY_COUNT = 84;
const CROSSED_BOUNDARY_COUNT = 15;
const ASSIGNED_ONLY_COUNT = 18;
const UNKNOWN_SEQUENCE_COUNT = 5;
const NOT_A_SEQUENCE_COUNT = 434;
const UNDECLARED_STATUS_COUNT = 9;

/** The zero-padded boundary id. */
// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-284 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-284 --for-spec --no-implementation-order`.
function boundaryId(index) {
  return `boundary-${String(index).padStart(3, '0')}`;
}

/** Every boundary id in the fixture. */
// [::TICKET::] PX-284 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-284 --for-spec --no-implementation-order`.
function boundaryIds() {
  return Array.from({ length: BOUNDARY_COUNT }, (_, index) => boundaryId(index + 1));
}

/** The two RFC bodies, naming every boundary the views carry. */
// [::TICKET::] PX-284 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-284 --for-spec --no-implementation-order`.
function rfcBodies(boundaries) {
  const suffix = boundaries.map((boundary) => boundary).join('\n');
  return {
    [PROVIDER]: `${rfcBody({ packageId: PROVIDER, operationId: 'ProduceFact', sequenceIds: ['A-1'], crossSequenceIds: ['A-1'] })}\n${suffix}\n`,
    [CONSUMER]: `${rfcBody({ packageId: CONSUMER, operationId: 'ConsumeFact', crossSequenceIds: ['A-1'] })}\n${suffix}\n`,
  };
}

/** Build the gaia-shaped workspace. */
export function gaiaShapedWorkspace() {
  const artifact = minimalV3Artifact();
  const crossed = boundaryIds().slice(0, CROSSED_BOUNDARY_COUNT);

  for (const step of artifact.steps) {
    step.contract.crosses = [...crossed];
    // The audited artifact has no object flow: no step consumes what another produces.
    step.contract.consumes = [];
    if (step.contract.authored !== undefined) step.contract.authored.consumes = [];
  }
  // One step has no authored facts, so S5.projection-only has a subject.
  const { authored, ...projection } = artifact.steps[0].contract;
  artifact.steps[0].contract = projection;
  delete artifact.steps[0].contract_prose;

  for (let index = 1; index <= NOT_A_SEQUENCE_COUNT; index += 1) {
    artifact.sequences.push({
      id: `G-${index}`,
      kind: 'neighbour',
      firstLine: 1,
      lastLine: 10,
      outcome: 'notASequence',
      predicateLimb: 'none-applies',
    });
  }

  for (let index = 1; index <= ASSIGNED_ONLY_COUNT; index += 1) {
    artifact.operations.push(operationRow(`Assigned-${index}`, {
      position: 'suppliedRule',
      registry_contribution: 'required',
    }));
  }

  for (let index = 1; index <= UNDECLARED_STATUS_COUNT; index += 1) {
    artifact.operations.push(operationRow(`Status-${index}`, {
      position: 'suppliedRule',
      registry_contribution: 'required',
      initial_status: 'open',
      allowed_status_transitions: { open: ['recovered'] },
    }));
  }

  // One effect that no step of the operation crosses.
  artifact.operations[0].boundary_effects = [{ boundary: boundaryId(CROSSED_BOUNDARY_COUNT + 1), direction: 'provides' }];

  const boundaries = boundaryIds();
  const treeManifest = defaultTreeManifest();
  treeManifest.dependencies.boundaries = boundaries.map((id) => ({
    id,
    provider_package: PROVIDER,
    consumer_package: CONSUMER,
    dependency_reason_code: 'canonical-object',
    stage2_contract_scope: [],
  }));

  const contractRegistry = boundaries.map((id) => ({
    boundary_id: id,
    provider_package: PROVIDER,
    consumer_package: CONSUMER,
    clauses: {},
    source_refs: ['s-000001'],
  }));
  const allocateManifest = defaultAllocateManifest(contractRegistry);

  const views = defaultViews();
  for (const [packageId, direction, counterpart] of [
    [PROVIDER, 'provides', CONSUMER],
    [CONSUMER, 'consumes', PROVIDER],
  ]) {
    views[packageId].obligationUnits = boundaries.map((id) => ({
      unitId: `ctr-${id}`,
      relation: 'carries',
      subject: id,
      direction,
      counterpart,
    }));
  }
  for (let index = 1; index <= ASSIGNED_ONLY_COUNT; index += 1) {
    views[PROVIDER].obligationUnits.push({
      unitId: `op-Assigned-${index}`,
      relation: 'assigns',
      subject: `Assigned-${index}`,
      kind: 'operation',
    });
  }
  for (let index = 1; index <= UNKNOWN_SEQUENCE_COUNT; index += 1) {
    views[PROVIDER].obligationUnits.push({
      unitId: `seq-G-999-${index}`,
      relation: 'assigns',
      subject: `G-999-${index}`,
      kind: 'sequence',
    });
  }

  return materializeSmoothWorkspace({
    artifact,
    treeManifest,
    allocateManifest,
    views,
    rfcBodies: rfcBodies(boundaries),
  });
}
