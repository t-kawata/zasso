/**
 * Whether the workspace's obligations cover the workspace.
 *
 * The guarantee is an implication whose antecedent is a property of the whole workspace — every
 * package discharges its own set — so it cannot be established by inspecting one package at a time.
 * What is decidable is the property that lets that antecedent be discharged: every demand is
 * assigned to a named package, by a relation or by an adjudication that names one. A demand that is
 * neither is a demand nobody owes, and reporting it as covered would prove nothing.
 *
 * Assignments are read from the package views and from nowhere else. The views are the projection of
 * the declarations, so reading the declarations too would give one fact two sources, and a reader
 * who found them disagreeing would have no way to tell which one was current.
 */
import { NOT_A_SEQUENCE } from './units.mjs';
import { collectCandidateColumns } from './obligation.mjs';

/** The four axes a demand can belong to, in the order a report prints them. */
export const DEMAND_AXES = Object.freeze(['operations', 'sequences', 'boundaries', 'surfaces']);

/** The kind a demand of each axis carries, so a report can name what it is asking for. */
const DEMAND_KINDS = Object.freeze({ operations: 'operation', sequences: 'sequence', boundaries: 'boundary', surfaces: 'surface' });

/** The unit-id prefix a boundary unit carries, mirrored here so the boundary axis can be read. */
const CARRIES_UNIT_PREFIX = 'ctr-';

/** The verdict the workspace earns when every demand is assigned. */
export const VERDICT_HOLDS = 'holds';

/** The verdict the workspace earns when a demand is assigned to nobody. */
export const VERDICT_NOT_ESTABLISHED = 'not established';

/** Whether an exemption row carries the ground that makes it an adjudication rather than a silence. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function isGroundedExemption(row) {
  return typeof row?.subject === 'string' && row.subject.length > 0
    && typeof row?.lens === 'string' && row.lens.trim().length > 0
    && typeof row?.why === 'string' && row.why.trim().length > 0;
}

/** Every obligation unit the workspace's views hold. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function collectObligationUnits(views) {
  return (views ?? []).flatMap((view) => (Array.isArray(view?.obligationUnits) ? view.obligationUnits : []));
}

/** The columns some package has declared itself the surface of. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function collectServedColumns(views) {
  const columns = new Set();
  for (const unit of collectObligationUnits(views)) {
    if (unit?.relation === 'serves' && typeof unit.coverage?.column === 'string') columns.add(unit.coverage.column);
  }
  return columns;
}

/** The boundary ids some package holds a side of. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function collectCarriedBoundaryIds(views) {
  const ids = new Set();
  for (const unit of collectObligationUnits(views)) {
    if (typeof unit?.unitId === 'string' && unit.unitId.startsWith(CARRIES_UNIT_PREFIX)) {
      ids.add(unit.unitId.slice(CARRIES_UNIT_PREFIX.length));
    }
  }
  return ids;
}

/** The operation ids and sequence ids the ownership relation reaches, read from the views. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function collectOwnedIds(views) {
  const operationIds = new Set();
  const sequenceIds = new Set();
  for (const view of views ?? []) {
    for (const unit of view?.ownedOperationUnits ?? []) if (typeof unit?.operationId === 'string') operationIds.add(unit.operationId);
    for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
      for (const unit of view?.[field] ?? []) if (typeof unit?.sequenceId === 'string') sequenceIds.add(unit.sequenceId);
    }
  }
  return { operationIds, sequenceIds };
}

/** Whether an operation carries any column some package has declared itself the surface of. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function isReachedByAServedColumn(operation, servedColumns) {
  for (const column of servedColumns) {
    const value = operation?.[column];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return true;
  }
  return false;
}

/** The demand of one axis, as the ids the axis asks about. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function demandsOfAxis(axis, { artifact, allocateManifest }) {
  if (axis === 'operations') return (artifact?.operations ?? []).map((operation) => String(operation?.id ?? '')).filter(Boolean);
  if (axis === 'sequences') {
    return (artifact?.sequences ?? [])
      .filter((sequence) => sequence?.outcome !== NOT_A_SEQUENCE)
      .map((sequence) => String(sequence.id));
  }
  if (axis === 'boundaries') {
    return (allocateManifest?.contract_registry ?? [])
      .map((contract) => String(contract?.boundary_id ?? contract?.contract_id ?? ''))
      .filter(Boolean);
  }
  return collectCandidateColumns(artifact);
}

/** Which demands of one axis are assigned, exempt and neither. */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function partitionAxis(axis, input) {
  const { artifact, views, exemptions } = input;
  const servedColumns = collectServedColumns(views);
  const { operationIds, sequenceIds } = collectOwnedIds(views);
  const carriedBoundaryIds = collectCarriedBoundaryIds(views);
  const servedColumnsDeclared = new Set(collectObligationUnits(views)
    .filter((unit) => unit?.relation === 'serves')
    .map((unit) => unit?.coverage?.column));
  const operationById = new Map((artifact?.operations ?? []).map((operation) => [String(operation.id), operation]));

  const isAssigned = (id) => {
    if (axis === 'operations') {
      return operationIds.has(id) || isReachedByAServedColumn(operationById.get(id), servedColumns);
    }
    if (axis === 'sequences') return sequenceIds.has(id);
    if (axis === 'boundaries') return carriedBoundaryIds.has(id);
    return servedColumnsDeclared.has(id);
  };

  const exemptSubjects = new Set((exemptions ?? []).filter(isGroundedExemption).map((row) => row.subject));
  const partition = { assigned: [], exempt: [], unassigned: [] };
  for (const id of demandsOfAxis(axis, input)) {
    const demand = { axis, id, kind: DEMAND_KINDS[axis] };
    if (isAssigned(id)) partition.assigned.push(demand);
    else if (exemptSubjects.has(id)) partition.exempt.push(demand);
    else partition.unassigned.push(demand);
  }
  return partition;
}

/**
 * The inventory objects owned by packages that no operation reaches.
 *
 * Ownership already records that this case is not a defect, so no gate reports it; it is counted
 * here because under the guarantee those objects are duties like any other, and a count is what
 * makes them visible rather than inferred.
 *
 * @param {{ inventory?: { objects?: Array<{ canonical_name?: string, owner_package?: string }> } }} treeManifest
 * @param {Array<{ result_object_classes?: string[] }>} operations
 * @returns {number}
 */
// [::TICKET::] PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-259 --for-spec --no-implementation-order`.
function countObjectsNoOperationReaches(treeManifest, operations) {
  const namedByOperations = new Set();
  for (const operation of operations ?? []) {
    for (const className of operation?.result_object_classes ?? []) namedByOperations.add(className);
  }
  const reachedOwners = new Set();
  for (const object of treeManifest?.inventory?.objects ?? []) {
    if (namedByOperations.has(object?.canonical_name)) reachedOwners.add(object.owner_package);
  }
  return (treeManifest?.inventory?.objects ?? []).filter((object) => !reachedOwners.has(object?.owner_package)).length;
}

/**
 * The coverage of one workspace.
 *
 * @param {{
 *   artifact: object,
 *   allocateManifest: object,
 *   views: object[],
 *   exemptions?: object[],
 *   treeManifest?: object,
 * }} input
 * @returns {{ axes: object, verdict: string, unreachedOwnedObjects: number }}
 */
export function measureCoverage({ artifact, allocateManifest, views, exemptions = [], treeManifest = null }) {
  const input = { artifact, allocateManifest, views, exemptions };
  const axes = {};
  for (const axis of DEMAND_AXES) axes[axis] = partitionAxis(axis, input);

  const everyUnassigned = DEMAND_AXES.flatMap((axis) => axes[axis].unassigned);
  return {
    axes,
    verdict: everyUnassigned.length === 0 ? VERDICT_HOLDS : VERDICT_NOT_ESTABLISHED,
    unreachedOwnedObjects: countObjectsNoOperationReaches(treeManifest, artifact?.operations ?? []),
  };
}
