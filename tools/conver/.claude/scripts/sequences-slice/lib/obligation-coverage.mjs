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
import { collectUnitIds } from './material.mjs';
import { NOT_A_SEQUENCE } from './units.mjs';
import { ASSIGNMENT_RELATION, collectCandidateColumns } from './obligation.mjs';
import { denominatorOf, gapsIn } from './obligation-denominator.mjs';
import { resolveGround } from './obligation-ground.mjs';

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

/**
 * The kind a refusal carries when the exemption named no carrier.
 *
 * An exemption is how a demand is placed somewhere other than an assignment, so a row that names
 * no party places nothing and the demand stays owed. It is refused rather than ignored because a
 * grounded row that looks like a placement and is not is exactly the silence this whole relation
 * exists to remove: the difference between a duty parked and a duty discharged would otherwise be
 * invisible in the record.
 */
export const UNCARRIED_EXEMPTION_KIND = 'exemption';

/** Why an exemption that names no carrier was refused, in the terms of the field it lacks. */
export const UNCARRIED_EXEMPTION_REASON = 'the exemption names no carriedBy, so it places nothing';

/** The relation each assigned demand records, in the order a report prints the mix. */
export const DEMAND_RELATIONS = Object.freeze(['owns', 'carries', 'serves', 'assigns']);

/**
 * Where an exemption was recorded, so a reviewer can tell the two routes apart.
 *
 * They reach one decision procedure, which is what keeps a second route from opening a path the
 * first closed. They are still reported apart, because the repairs differ: an artifact exemption
 * is a reading of the specification and is re-derived with it, while a record adjudication is a
 * package's own judgment and is reviewed with the package.
 */
export const EXEMPTION_ROUTES = Object.freeze(['artifact', 'record']);

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
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
function collectAssignedIds(views, resolvedUnitIds) {
  const operationIds = new Set();
  const sequenceIds = new Set();
  for (const unit of collectObligationUnits(views)) {
    if (!isGroundedAssignment(unit) || typeof unit.unitId !== 'string') continue;
    if (!resolvedUnitIds.has(unit.unitId)) continue;
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

/**
 * The columns the workspace's packages adjudicated away, in the shape the refuser takes.
 *
 * One shape for both routes is the point: the refuser that refuses an operation or a sequence
 * runs once over the artifact's rows and these, so the rule cannot be spelled twice and cannot
 * drift between them.
 *
 * @param {object[]} views
 * @returns {Array<{ subject: string, lens: string, why: string, route: string }>}
 */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function collectAdjudicationRows(views) {
  return (views ?? [])
    .flatMap((view) => (view?.adjudicatedColumns ?? []).map((entry) => String(entry?.column ?? '')))
    .filter((column) => column.length > 0)
    .map((column) => ({
      subject: column,
      lens: 'obligation',
      why: groundOfColumn(views, column),
      route: EXEMPTION_ROUTES[1],
      carriedBy: valueOfColumn(views, column, 'carriedBy'),
    }));
}

/** The ground the workspace recorded for one adjudicated column, or the empty string. */
// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function groundOfColumn(views, column) {
  return valueOfColumn(views, column, 'ground');
}

/**
 * One field of the entry a view recorded for an adjudicated column, or the empty string.
 *
 * The carrier travels with the ground rather than being decided here, because which package a
 * demand is left with is the record's judgment and not the measurement's. A version-1 record is
 * read by the obligation reader as carrying the package that wrote it, so the value arriving here
 * is the record's answer either way and this layer only passes it on.
 *
 * @param {object[]} views
 * @param {string} column
 * @param {string} field
 * @returns {string}
 */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function valueOfColumn(views, column, field) {
  for (const view of views ?? []) {
    for (const entry of view?.adjudicatedColumns ?? []) {
      if (String(entry?.column ?? '') === column) return String(entry?.[field] ?? '');
    }
  }
  return '';
}

/**
 * The packages whose record adjudicated a column away without recording a ground.
 *
 * Reported apart from the unassigned list for the reason an ungrounded assignment is: a column
 * nobody decided is a decision the workspace has not made, while a column decided with nothing
 * written down is a judgment a reader must go and substantiate.
 *
 * @param {object[]} views
 * @returns {string[]}
 */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function findUngroundedAdjudications(views) {
  return (views ?? [])
    .filter((view) => (view?.adjudicatedColumns ?? []).some((entry) => String(entry?.ground ?? '').trim().length === 0))
    .map((view) => String(view?.packageId));
}

/** Every recorded judgment the workspace holds, with the route it lives on and its ground. */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
/** The axis a recorded assignment sits on, read from the unit id it names. */
// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function axisOfUnitId(unitId) {
  if (unitId.startsWith(OPERATION_UNIT_PREFIX)) return DEMAND_AXES[0];
  if (unitId.startsWith(SEQUENCE_UNIT_PREFIX)) return DEMAND_AXES[1];
  return DEMAND_AXES[3];
}

// [::TICKET::] PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function collectGroundedJudgments(views, exemptionRows) {
  const assignments = collectObligationUnits(views)
    .filter((unit) => unit?.relation === ASSIGNMENT_RELATION && typeof unit?.ground === 'string' && unit.ground.trim().length > 0)
    .map((unit) => ({ subject: String(unit.subject ?? ''), unitId: String(unit.unitId ?? ''), route: ASSIGNMENT_RELATION, axis: axisOfUnitId(String(unit.unitId ?? '')), ground: unit.ground.trim() }));
  const exemptions = exemptionRows
    .filter(isGroundedExemption)
    .map((row) => ({ subject: row.subject, unitId: null, route: row.route, axis: DEMAND_AXES[3], ground: String(row.why).trim() }));
  return [...assignments, ...exemptions];
}

/**
 * Every unit every view holds that no ledger accounts for.
 *
 * Deliberately not a fifth demand axis. A demand can be assigned before any RFC exists, and a
 * unit can only be accounted for after the RFC that carries its ledger is written, so the two
 * questions are answered at different moments of the workflow and one verdict carrying both
 * would be unsatisfiable at the step where the demand is resolved.
 *
 * The three states are reported apart because they call for three different repairs: a package
 * that has no ledger yet, a package whose ledger is present and not well formed, and a package
 * whose well-formed ledger omits a unit. The caller reads the ledger through the one parser the
 * repository has, so this function decides nothing about what a ledger is.
 *
 * @param {{ views?: object[], ledgersByPackage?: Map<string, Set<string>> }} input
 * @returns {{ unaccounted: Array<{ packageId: string, unitIds: string[] }>, withoutLedger: string[] }}
 */
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function measureDischarge({ views, ledgersByPackage }) {
  const unaccounted = [];
  const withoutLedger = [];
  for (const view of views ?? []) {
    const held = collectUnitIds(view);
    if (held.length === 0) continue;

    const ledger = ledgersByPackage?.get(String(view?.packageId));
    if (ledger === undefined) {
      withoutLedger.push(String(view?.packageId));
      continue;
    }
    const missing = held.filter((unitId) => !ledger.has(unitId));
    if (missing.length > 0) unaccounted.push({ packageId: String(view?.packageId), unitIds: missing });
  }
  return { unaccounted, withoutLedger };
}

/** Every obligation unit the workspace's views hold. */
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function collectObligationUnits(views) {
  return (views ?? []).flatMap((view) => (Array.isArray(view?.obligationUnits) ? view.obligationUnits : []));
}

/** The columns some package has declared itself the surface of. */
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function collectServedColumns(views) {
  const columns = new Set();
  for (const unit of collectObligationUnits(views)) {
    if (unit?.relation === 'serves' && typeof unit.coverage?.column === 'string') columns.add(unit.coverage.column);
  }
  return columns;
}

/** The boundary ids some package holds a side of. */
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
// [::TICKET::] PX-259, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
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
    if (kind !== undefined) {
      refused.push({ kind, id: row.subject, why: row.why, route: row.route ?? null });
      continue;
    }
    // The carrier is required of a row that names a demand, because that is the row that would
    // otherwise place nothing while reading as a placement. A row naming no demand of any axis — an
    // inquest region, a line, a blank-line entry — parks nothing, so requiring a carrier of it would
    // refuse rows that never claimed to place a duty and would bury the ones that did.
    if (namesADemand(row, demandsByKind) && !namesACarrier(row)) {
      refused.push({ kind: UNCARRIED_EXEMPTION_KIND, id: row.subject, why: UNCARRIED_EXEMPTION_REASON, route: row.route ?? null });
      continue;
    }
    allowed.push(row);
  }
  return { allowed, refused };
}

/** Whether an exemption row names a demand of some axis, which is what makes its carrier required. */
// [::TICKET::] PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-263 --for-spec --no-implementation-order`.
function namesADemand(row, demandsByKind) {
  return Object.values(demandsByKind ?? {}).some((ids) => (ids ?? []).includes(row.subject));
}

/** Whether an exemption says which package the duty went to. */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function namesACarrier(row) {
  return String(row?.carriedBy ?? '').trim().length > 0;
}

/** The sentence a refused exemption is reported with, spelled once for every surface that prints it. */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
export function describeRefusedExemption(row) {
  if (row.kind === UNCARRIED_EXEMPTION_KIND) return `${DEMAND_KINDS.surfaces} ${row.id} was exempted — ${UNCARRIED_EXEMPTION_REASON}`;
  const article = row.kind === DEMAND_KINDS.operations ? 'an operation' : 'a sequence';
  return `${row.kind} ${row.id} was exempted — ${article} may not be exempted`;
}

/** Which demands of one axis are assigned, exempt and neither. */
// [::TICKET::] PX-259, PX-260, PX-261, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-260|PX-261|PX-262|PX-263) --for-spec --no-implementation-order`.
function partitionAxis(axis, input) {
  const { artifact, views, allowedExemptSubjects, resolvedAssignmentUnitIds } = input;
  const servedColumns = collectServedColumns(views);
  const { operationIds, sequenceIds } = collectOwnedIds(views);
  const assigned = collectAssignedIds(views, resolvedAssignmentUnitIds);
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
// [::TICKET::] PX-259, PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-259|PX-262|PX-263) --for-spec --no-implementation-order`.
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
  // One refuser over both routes, so the rule that an operation or a sequence is never exempted
  // cannot be spelled twice and cannot drift between a recorded adjudication and an artifact row.
  const exemptionRows = [
    ...(exemptions ?? []).map((row) => ({ ...row, route: EXEMPTION_ROUTES[0] })),
    ...collectAdjudicationRows(views),
  ];
  const { allowed, refused } = refuseUnexemptibleDemand(exemptionRows, {
    [DEMAND_KINDS.operations]: demanded.operations,
    [DEMAND_KINDS.sequences]: demanded.sequences,
    [DEMAND_KINDS.boundaries]: demanded.boundaries,
    [DEMAND_KINDS.surfaces]: demanded.surfaces,
  });

  const judgments = collectGroundedJudgments(views, exemptionRows);
  const resolvedJudgments = judgments.filter((judgment) => resolveGround(judgment.ground, artifact).resolved);
  const unresolvedGrounds = judgments
    .filter((judgment) => !resolvedJudgments.includes(judgment))
    .map((judgment) => ({ subject: judgment.subject, axis: judgment.axis, route: judgment.route, ground: judgment.ground }));

  const input = {
    artifact,
    allocateManifest,
    views,
    allowedExemptSubjects: new Set(allowed.map((row) => row.subject)),
    resolvedAssignmentUnitIds: new Set(resolvedJudgments.filter((judgment) => judgment.unitId !== null).map((judgment) => judgment.unitId)),
  };
  const axes = {};
  for (const axis of DEMAND_AXES) axes[axis] = partitionAxis(axis, input);

  const everyUnassigned = DEMAND_AXES.flatMap((axis) => axes[axis].unassigned);
  const demandCounts = Object.fromEntries(DEMAND_AXES.map((axis) => [axis, demanded[axis].length]));
  // Whether the demand list is complete is answered beside whether it is placed, and the two are
  // reported apart: a demand nobody named is a decision the workspace has not made, while an axis
  // nobody measured is a question the workspace cannot answer at all. A verdict of holds over an
  // artifact that supplied its own denominator would report the completeness of a set nobody
  // checked, which is the state this measurement exists to make visible rather than to assume.
  const denominator = denominatorOf({ artifact, allocateManifest, treeManifest, views });
  const denominatorGaps = gapsIn(denominator, demandCounts);
  return {
    axes,
    allowedExemptions: allowed,
    refusedExemptions: refused,
    unresolvedGrounds,
    denominator,
    denominatorGaps,
    assignmentDistribution: measureAssignmentDistribution(views),
    demandCounts,
    // Three things withhold the guarantee even when no demand is unassigned. A refusal: the
    // workspace asked for a demand to be struck out, or named one without saying where the duty
    // went, and answering "holds" would report the completeness of a set the run had just proposed
    // to shrink or to park. An unresolved ground: a judgment nobody can check is an assertion, and
    // an assertion is not evidence. An unstated denominator: the demand list is measured against
    // nothing, so its completeness is not a fact anybody has established.
    verdict: everyUnassigned.length === 0 && refused.length === 0 && unresolvedGrounds.length === 0 && denominatorGaps.length === 0
      ? VERDICT_HOLDS
      : VERDICT_NOT_ESTABLISHED,
    unreachedOwnedObjects: countObjectsNoOperationReaches(treeManifest, artifact?.operations ?? []),
  };
}
