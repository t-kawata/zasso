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
import { ASSIGNMENT_RELATION, collectCandidateColumns } from './obligation.mjs';

/** The four axes a demand can belong to, in the order a report prints them. */
export const DEMAND_AXES = Object.freeze(['operations', 'sequences', 'boundaries', 'surfaces']);

/** The kind a demand of each axis carries, so a report can name what it is asking for. */
const DEMAND_KINDS = Object.freeze({ operations: 'operation', sequences: 'sequence', boundaries: 'boundary', surfaces: 'surface' });

/**
 * The two kinds an adjudication may never empty.
 *
 * A surface is a reading of what the specification's interfaces are, so a reader who decides a
 * column is not a surface has removed a question rather than a duty. An operation and a sequence
 * are the work itself: exempting one does not place the duty anywhere, it deletes it, and a
 * workspace that earned the guarantee that way would report completeness for an operation nobody
 * owes. That is the one path by which this whole measurement becomes vacuous, so it is closed here
 * rather than left to the judgment of the party being checked.
 */
export const UNEXEMPTIBLE_DEMAND_KINDS = Object.freeze(['operation', 'sequence']);

/** The relation each assigned demand records, in the order a report prints the mix. */
export const DEMAND_RELATIONS = Object.freeze(['owns', 'carries', 'serves', 'assigns']);

/** The unit-id prefix a boundary unit carries, mirrored here so the boundary axis can be read. */
const CARRIES_UNIT_PREFIX = 'ctr-';

/** The unit-id prefix a recorded assignment to an operation carries, mirrored for the operation axis. */
const OPERATION_UNIT_PREFIX = 'op-';

/** The unit-id prefix a recorded assignment to a sequence carries, mirrored for the sequence axis. */
const SEQUENCE_UNIT_PREFIX = 'seq-';

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

/** Whether a recorded assignment carries the ground that makes it a judgment rather than a gesture. */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function isGroundedAssignment(unit) {
  return unit?.relation === ASSIGNMENT_RELATION && typeof unit?.ground === 'string' && unit.ground.trim().length > 0;
}

/**
 * The demands a recorded judgment placed, read from the views like every other assignment.
 *
 * A demand the judgment named but did not ground is read as unplaced, because the ground is what
 * makes the judgment reviewable: without it the record is a claim no reader can check, and a claim
 * that cannot be checked cannot discharge the antecedent either.
 *
 * @param {object[]} views
 * @returns {{ operationIds: Set<string>, sequenceIds: Set<string> }}
 */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function collectAssignedIds(views) {
  const operationIds = new Set();
  const sequenceIds = new Set();
  for (const unit of collectObligationUnits(views)) {
    if (!isGroundedAssignment(unit) || typeof unit.unitId !== 'string') continue;
    if (unit.kind === DEMAND_KINDS.operations) operationIds.add(unit.unitId.slice(OPERATION_UNIT_PREFIX.length));
    if (unit.kind === DEMAND_KINDS.sequences) sequenceIds.add(unit.unitId.slice(SEQUENCE_UNIT_PREFIX.length));
  }
  return { operationIds, sequenceIds };
}

/**
 * The packages whose record placed a demand without a ground.
 *
 * Reported apart from the unassigned list, because the two facts call for different repairs: a
 * demand nobody named is a decision the workspace has not made, while a demand named without a
 * ground is a written judgment a reader must go and substantiate.
 *
 * @param {object[]} views
 * @returns {string[]}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function findUngroundedAssignments(views) {
  return (views ?? [])
    .filter((view) => (view?.obligationUnits ?? []).some((unit) => unit?.relation === ASSIGNMENT_RELATION && !isGroundedAssignment(unit)))
    .map((view) => String(view?.packageId));
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

/**
 * The demands an adjudication may empty, and the ones it may not.
 *
 * A row that is not grounded is not an adjudication at all: it is a mention, and it is neither
 * allowed to exonerate a demand nor refused as an attempt, because nothing was claimed. What is
 * refused is a grounded row that names an operation or a sequence, which is a written attempt to
 * remove a duty instead of placing it.
 *
 * @param {Array<{ subject?: string, lens?: string, why?: string }>} exemptions
 * @param {{ [kind: string]: string[] }} demandsByKind — the ids each kind asks about
 * @returns {{ allowed: object[], refused: Array<{ kind: string, id: string, why: string }> }}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function refuseUnexemptibleDemand(exemptions, demandsByKind = {}) {
  const allowed = [];
  const refused = [];
  for (const row of exemptions ?? []) {
    if (!isGroundedExemption(row)) continue;
    const kind = UNEXEMPTIBLE_DEMAND_KINDS.find((candidate) => (demandsByKind[candidate] ?? []).includes(row.subject));
    if (kind === undefined) allowed.push(row);
    else refused.push({ kind, id: row.subject, why: row.why });
  }
  return { allowed, refused };
}

/** The sentence a refused exemption is reported with, spelled once for every surface that prints it. */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function describeRefusedExemption(row) {
  const article = row.kind === DEMAND_KINDS.operations ? 'an operation' : 'a sequence';
  return `${row.kind} ${row.id} was exempted — ${article} may not be exempted`;
}

/** Which demands of one axis are assigned, exempt and neither. */
// [::TICKET::] PX-259, PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function partitionAxis(axis, input) {
  const { artifact, views, allowedExemptSubjects } = input;
  const servedColumns = collectServedColumns(views);
  const { operationIds, sequenceIds } = collectOwnedIds(views);
  const assigned = collectAssignedIds(views);
  const carriedBoundaryIds = collectCarriedBoundaryIds(views);
  const servedColumnsDeclared = new Set(collectObligationUnits(views)
    .filter((unit) => unit?.relation === 'serves')
    .map((unit) => unit?.coverage?.column));
  const operationById = new Map((artifact?.operations ?? []).map((operation) => [String(operation.id), operation]));

  // The relation that placed a demand is returned rather than a boolean, because a report that
  // printed only "assigned" could not distinguish a workspace distributed across its packages from
  // one where a single package was handed everything.
  const relationFor = (id) => {
    if (axis === 'operations') {
      if (operationIds.has(id)) return 'owns';
      if (assigned.operationIds.has(id)) return ASSIGNMENT_RELATION;
      return isReachedByAServedColumn(operationById.get(id), servedColumns) ? 'serves' : null;
    }
    if (axis === 'sequences') {
      if (sequenceIds.has(id)) return 'owns';
      return assigned.sequenceIds.has(id) ? ASSIGNMENT_RELATION : null;
    }
    if (axis === 'boundaries') return carriedBoundaryIds.has(id) ? 'carries' : null;
    return servedColumnsDeclared.has(id) ? 'serves' : null;
  };

  const partition = { assigned: [], exempt: [], unassigned: [] };
  for (const id of demandsOfAxis(axis, input)) {
    const demand = { axis, id, kind: DEMAND_KINDS[axis] };
    const by = relationFor(id);
    if (by !== null) partition.assigned.push({ ...demand, by });
    else if (allowedExemptSubjects.has(id)) partition.exempt.push(demand);
    else partition.unassigned.push(demand);
  }
  return partition;
}

/**
 * How many distinct demands each package holds a unit for.
 *
 * Printed rather than gated. Checked against nothing, because a threshold would encode a
 * project's shape in the tool: a workspace whose surface vocabulary reaches every operation may
 * legitimately place three hundred demands on three packages. What the line makes visible is the
 * concentration itself, which a total alone would summarise away.
 *
 * @param {object[]} views
 * @returns {Array<{ packageId: string, count: number }>}
 */
// [::TICKET::] PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function measureAssignmentDistribution(views) {
  return (views ?? [])
    .map((view) => {
      const held = new Set();
      for (const unit of view?.ownedOperationUnits ?? []) held.add(`${OPERATION_UNIT_PREFIX}${unit?.operationId}`);
      for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
        for (const unit of view?.[field] ?? []) held.add(`${SEQUENCE_UNIT_PREFIX}${unit?.sequenceId}`);
      }
      for (const unit of view?.obligationUnits ?? []) held.add(String(unit?.unitId));
      return { packageId: String(view?.packageId), count: held.size };
    })
    .sort((left, right) => right.count - left.count || left.packageId.localeCompare(right.packageId));
}

/**
 * The demand the workspace asks about, as facts alone.
 *
 * The rail emits these into the artifact because they are a function of the specification and the
 * frozen manifests and of nothing else, so they cannot go stale: the candidate columns come from
 * the pins crossed with the operation rows, and the boundary count from the contract registry. Who
 * owes a demand is deliberately not among them, and is measured fresh at every report.
 *
 * @param {{ artifact: object, allocateManifest: object }} input
 * @returns {{ candidateColumns: string[], boundaryCount: number, counts: object }}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function demandFactsOf({ artifact, allocateManifest }) {
  const demanded = Object.fromEntries(DEMAND_AXES.map((axis) => [axis, demandsOfAxis(axis, { artifact, allocateManifest })]));
  return {
    candidateColumns: demanded.surfaces,
    boundaryCount: demanded.boundaries.length,
    counts: Object.fromEntries(DEMAND_AXES.map((axis) => [axis, demanded[axis].length])),
  };
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
  const demanded = Object.fromEntries(DEMAND_AXES.map((axis) => [axis, demandsOfAxis(axis, { artifact, allocateManifest })]));
  const { allowed, refused } = refuseUnexemptibleDemand(exemptions, {
    [DEMAND_KINDS.operations]: demanded.operations,
    [DEMAND_KINDS.sequences]: demanded.sequences,
  });

  const input = { artifact, allocateManifest, views, allowedExemptSubjects: new Set(allowed.map((row) => row.subject)) };
  const axes = {};
  for (const axis of DEMAND_AXES) axes[axis] = partitionAxis(axis, input);

  const everyUnassigned = DEMAND_AXES.flatMap((axis) => axes[axis].unassigned);
  return {
    axes,
    refusedExemptions: refused,
    assignmentDistribution: measureAssignmentDistribution(views),
    demandCounts: Object.fromEntries(DEMAND_AXES.map((axis) => [axis, demanded[axis].length])),
    // A refusal withholds the guarantee even though no demand is unassigned: the workspace asked
    // for a demand to be struck out, and a gate that answered "holds" would be reporting the
    // completeness of a set the run had just proposed to shrink.
    verdict: everyUnassigned.length === 0 && refused.length === 0 ? VERDICT_HOLDS : VERDICT_NOT_ESTABLISHED,
    unreachedOwnedObjects: countObjectsNoOperationReaches(treeManifest, artifact?.operations ?? []),
  };
}
