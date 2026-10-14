/**
 * What each demand axis is measured against, so a demand set can be incomplete rather than total.
 *
 * A demand list is only total against something. Every axis in this workspace had its members
 * derived from the artifact or from the frozen manifests and compared with nothing, so an artifact
 * that named no operations read as a workspace with no work rather than as a workspace whose
 * enumeration was never supplied. The rail says as much about its own census checks: an artifact
 * that borrows no census has no denominator, so those checks are silent rather than wrong.
 *
 * This module is the one place that answers what each axis rests on, and it invents no source of
 * truth to do it. Every denominator below already exists in the workspace: the census the rail
 * borrowed from the supplied material and pinned, the contract registry the allocation wrote and
 * the tree manifest it answers to, and the interface declarations the packages recorded.
 *
 * It measures and decides nothing about placement. Whether a demand is owed by somebody is the
 * coverage layer's question; whether the list of demands is complete is this one's, and keeping
 * them apart is what lets the second be answered when the first is not.
 */
import { collectCandidateColumns, DECLARED_INTERFACES_FIELD } from './obligation.mjs';

/** The axes a denominator is stated for, in the order a report prints them. */
export const DENOMINATOR_AXES = Object.freeze(['operations', 'sequences', 'boundaries', 'surfaces']);

/**
 * The ways an axis can be stated.
 *
 * `unstated` is a verdict and not a gap in the reading: it says the workspace holds no structure
 * from which the completeness of this axis could be judged, which is a different fact from an
 * axis that was judged and found short.
 */
export const DENOMINATOR_SOURCES = Object.freeze(['census', 'registry', 'declaration', 'unstated']);

/** The census role that answers for the operations, and the one that answers for the sequences. */
const CENSUS_ROLE_BY_AXIS = Object.freeze({ operations: 'operations', sequences: 'entries' });

/**
 * The axes whose statement and whose placement are the same act.
 *
 * A surface is placed by a package declaring itself its surface, and that same declaration is the
 * only statement of which surfaces exist. So an axis with no demands has nothing to state, and
 * withholding the verdict over it would withhold for a question nobody is asking. An operation is
 * placed by ownership but stated by the borrowed census, which is a different structure: the
 * census can be absent while the artifact names operations, and that absence is the finding this
 * module exists to make visible whether or not the artifact names any.
 */
const AXES_STATED_BY_THEIR_PLACEMENT = Object.freeze(['surfaces']);

/** The unit-id shape of a declaration that a package is the surface of a column. */
const SERVES_RELATION = 'serves';

/**
 * The members a borrowed census lists for a role, or null when no census was borrowed.
 *
 * A pin with no `members` field answers with an empty list rather than with null: the census was
 * supplied and it says the specification names nothing, which is a statement and is not the same
 * fact as a census that was never supplied.
 *
 * @param {object} artifact
 * @param {string} role
 * @returns {string[]|null}
 */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function borrowedCensusMembers(artifact, role) {
  const pins = artifact?.pins?.sourceEnumerations;
  if (!Array.isArray(pins)) return null;
  const pin = pins.find((entry) => entry?.role === role);
  if (pin === undefined) return null;
  return Array.isArray(pin.members) ? pin.members.map((member) => String(member)) : [];
}

/**
 * Whether the workspace says anything about its interfaces, and how many columns it accounts for.
 *
 * A declaration answers for the columns that are interfaces and an adjudication answers for the
 * ones that are not, so both are counted: a workspace that ruled a candidate column out has said
 * as much about its surfaces as one that declared another in, and counting only the declarations
 * would withhold the verdict from a workspace whose every column had been decided. An adjudication
 * counts here only when it carries the ground and the carrier the coverage layer requires, because
 * one that does not place anything is not a statement either.
 *
 * The three places a declaration can live are the same three the obligation reader resolves, so
 * this counts a union rather than picking one: the question is whether the workspace said
 * something, and a workspace that said it twice has still said it.
 *
 * @param {{ [DECLARED_INTERFACES_FIELD]?: object }} allocateManifest
 * @param {object[]} views
 * @returns {number|null}
 */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function declaredSurfaceCount(allocateManifest, views) {
  const fromManifest = allocateManifest?.[DECLARED_INTERFACES_FIELD];
  const manifestColumns = new Set();
  if (fromManifest !== null && typeof fromManifest === 'object') {
    for (const entries of Object.values(fromManifest)) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        const column = String(entry?.column ?? '').trim();
        if (column.length > 0) manifestColumns.add(column);
      }
    }
  }

  const servedColumns = new Set();
  for (const view of views ?? []) {
    for (const unit of Array.isArray(view?.obligationUnits) ? view.obligationUnits : []) {
      if (unit?.relation !== SERVES_RELATION) continue;
      const column = String(unit?.coverage?.column ?? '').trim();
      if (column.length > 0) servedColumns.add(column);
    }
  }

  const adjudicatedColumns = new Set();
  for (const view of views ?? []) {
    for (const entry of Array.isArray(view?.adjudicatedColumns) ? view.adjudicatedColumns : []) {
      const column = String(entry?.column ?? '').trim();
      if (column.length === 0) continue;
      if (String(entry?.ground ?? '').trim().length === 0) continue;
      if (String(entry?.carriedBy ?? '').trim().length === 0) continue;
      adjudicatedColumns.add(column);
    }
  }

  if (manifestColumns.size === 0 && servedColumns.size === 0 && adjudicatedColumns.size === 0) return null;
  return new Set([...manifestColumns, ...servedColumns, ...adjudicatedColumns]).size;
}

/** One axis, stated or unstated, with the member count the statement carries. */
// [::TICKET::] PX-262, PX-263 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-262|PX-263) --for-spec --no-implementation-order`.
function axisEntry(axis, source, members) {
  return { axis, source, members, borrowed: source !== DENOMINATOR_SOURCES[3] };
}

/**
 * What each of the four axes is measured against.
 *
 * The boundaries axis accepts the contract registry as its statement and treats the tree manifest
 * as a cross-check rather than as a precondition: the registry is what the allocation wrote and
 * what the demand is read from, so a workspace holding one has stated the axis, and a tree manifest
 * that declares a different count is a disagreement this reports as unstated rather than as two
 * memberships to reconcile.
 *
 * @param {{ artifact?: object, allocateManifest?: object, treeManifest?: object, views?: object[] }} input
 * @returns {{ operations: object, sequences: object, boundaries: object, surfaces: object }}
 */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
export function denominatorOf({ artifact = null, allocateManifest = null, treeManifest = null, views = [] } = {}) {
  const censusOf = (axis) => {
    const members = borrowedCensusMembers(artifact, CENSUS_ROLE_BY_AXIS[axis]);
    return axisEntry(axis, members === null ? DENOMINATOR_SOURCES[3] : DENOMINATOR_SOURCES[0], members === null ? 0 : members.length);
  };

  const registry = allocateManifest?.contract_registry;
  const declared = treeManifest?.stage2_handoff?.contract_boundaries;
  const registryMembers = Array.isArray(registry) ? registry.length : null;
  const declaredMembers = Array.isArray(declared) ? declared.length : null;
  // A tree manifest that declares a different count than the registry carries is the one state this
  // axis cannot call stated: the two structures the workspace holds disagree about how many
  // boundaries exist, and a denominator that disagreed with its own demand list would judge nothing.
  const registryAgrees = declaredMembers === null || declaredMembers === registryMembers;
  const boundaries = registryMembers === null || !registryAgrees
    ? axisEntry(DENOMINATOR_AXES[2], DENOMINATOR_SOURCES[3], 0)
    : axisEntry(DENOMINATOR_AXES[2], DENOMINATOR_SOURCES[1], registryMembers);

  // A candidate column exists only where a column of the operation rows instantiates a closed
  // vocabulary the specification pinned, so a workspace holding candidates has had its document
  // say which columns are its interfaces, and that statement is the axis. Counting it widens the
  // accepted routes and narrows none: a workspace that stated the axis by a declaration still does.
  const declaredSurfaces = declaredSurfaceCount(allocateManifest, views);
  const candidateColumns = collectCandidateColumns(artifact);
  const surfaceMembers = declaredSurfaces ?? (candidateColumns.length > 0 ? candidateColumns.length : null);
  const surfaces = surfaceMembers === null
    ? axisEntry(DENOMINATOR_AXES[3], DENOMINATOR_SOURCES[3], 0)
    : axisEntry(DENOMINATOR_AXES[3], DENOMINATOR_SOURCES[2], surfaceMembers);

  return { operations: censusOf(DENOMINATOR_AXES[0]), sequences: censusOf(DENOMINATOR_AXES[1]), boundaries, surfaces };
}

/** The structure to supply for an axis, and what supplying it would settle. */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
const REPAIR_BY_AXIS = Object.freeze({
  operations: 'supply the census for the operations role beside the run, so the operation list answers to a reading of the specification rather than to itself',
  sequences: 'supply the census for the entries role beside the run, so the sequence list answers to a reading of the specification rather than to itself',
  boundaries: 're-run the allocation so the contract registry carries every boundary the tree manifest declares',
  surfaces: 'declare the interfaces in the allocation manifest or in a package record, so the candidate columns answer to a declaration',
});

/** Why an axis is unstated, in the terms of the structure that is missing. */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
const REASON_BY_AXIS = Object.freeze({
  operations: 'no census is borrowed for the operations role, so the artifact is its own denominator',
  sequences: 'no census is borrowed for the entries role, so the artifact is its own denominator',
  boundaries: 'the contract registry does not account for the boundaries the tree manifest declares, so the boundary list answers to nothing',
  surfaces: 'no interface is declared anywhere, so the candidate columns are only what the artifact read for itself',
});

/**
 * The axes whose completeness cannot be judged, with the repair each one calls for.
 *
 * The demand counts are taken rather than derived, because how many demands an axis asks about is
 * the coverage layer's answer and deriving it a second time here would be the drift this module is
 * meant to remove.
 *
 * @param {object} denominator — the answer of {@link denominatorOf}
 * @param {{ [axis: string]: number }} demandCounts — how many demands each axis asks about
 * @returns {Array<{ axis: string, why: string, repair: string }>}
 */
// [::TICKET::] PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-262 --for-spec --no-implementation-order`.
export function gapsIn(denominator, demandCounts = {}) {
  return DENOMINATOR_AXES
    .filter((axis) => denominator?.[axis]?.source === DENOMINATOR_SOURCES[3])
    .filter((axis) => !AXES_STATED_BY_THEIR_PLACEMENT.includes(axis) || (demandCounts?.[axis] ?? 0) > 0)
    .map((axis) => ({ axis, why: REASON_BY_AXIS[axis], repair: REPAIR_BY_AXIS[axis] }));
}
