/**
 * One package's share of the sequences and operations the specification names.
 *
 * This is where the distribution either happens or does not. A unit owned by one package
 * is a `seq-` unit in that package's view; a unit owned by several is an `xdir-` unit in
 * each of their views, carrying the same owner list, so a reader can see who else must be
 * involved before implementing. A unit that appeared nowhere would be an omission nothing
 * downstream could detect, so the partition is the property the tests assert.
 *
 * The projection is pure: it is a function of the artifact, the tree manifest and the
 * workspace's package segments, and it neither reads nor writes.
 */
import { collectDistinctClassNames, classifyOperationOwnership, resolveOwningPackages } from './ownership.mjs';
import { measureLineRangeJoin, normalizeStructureSegments } from './segments.mjs';
import { classifySequenceOwnership, buildSequenceUnits } from './units.mjs';
import { ASSIGNMENT_RELATION, OBLIGATION_SOURCES, buildObligationUnits, classifyAdjudications, classifyAssignments } from './obligation.mjs';
import { renderLineRangeStatement, LINE_RANGE_IDENTITY_USE } from './report.mjs';

/** The prefix that marks an operation unit. */
const OPERATION_UNIT_PREFIX = 'op-';

/** The prefix that marks a sequence owned by exactly one package. */
const SEQUENCE_UNIT_PREFIX = 'seq-';

/** The prefix that marks a sequence owned by more than one package. */
const CROSS_BOUNDARY_UNIT_PREFIX = 'xdir-';

/** The sentence every view carries, so the rejected key is never mistaken for an identity. */
export const VIEW_SOURCE_NOTE = 'Generated from the sequences artifact by /grill-me-for-rfc. Frozen input: do not edit; regenerate instead.';

/**
 * The units one package owns, and the ones it shares.
 *
 * `packageSegments` is the workspace's list and not the package's: the line-coordinate
 * statement every view carries is a cross-package measurement, so it is measured once over
 * the whole workspace and is therefore the same sentence in every view. It is required
 * rather than defaulted, because a default renders the same confident zero for a package
 * claiming seven segments and for one claiming none.
 *
 * @param {{
 *   artifact: object,
 *   treeManifest: object,
 *   packageSegments: Array<{ packagePath: string, segmentIds: string[] }>,
 *   obligations?: { allocateManifest?: object, declared?: Array<object>, record?: object|null },

 * }} input
 * @param {string} packageId
 * @returns {object}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function buildPackageView({ artifact, treeManifest, packageSegments, obligations = {} }, packageId) {
  const { allocateManifest = null, declared = [], record = null } = obligations;
  const ownershipByCanonicalName = resolveOwningPackages(treeManifest.inventory.objects);
  const units = buildSequenceUnits(artifact);

  const ownedOperationUnits = artifact.operations
    .map((operation) => {
      const classified = classifyOperationOwnership(operation, ownershipByCanonicalName);
      return {
        unitId: `${OPERATION_UNIT_PREFIX}${operation.id}`,
        operationId: operation.id,
        resultObjectClasses: Array.isArray(operation.result_object_classes) ? [...operation.result_object_classes] : [],
        ownerPackageIds: classified.ownerPackageIds,
        unmatchedClassNames: classified.unmatchedClassNames,
      };
    })
    .filter((unit) => unit.ownerPackageIds.includes(packageId));

  const operationsBySequence = new Map();
  for (const step of units.steps) {
    if (!operationsBySequence.has(step.sequence)) operationsBySequence.set(step.sequence, []);
    operationsBySequence.get(step.sequence).push(step.operation);
  }
  const operationById = new Map(units.operations.map((operation) => [operation.id, operation]));

  const ownedSequenceUnits = [];
  const crossBoundarySequenceUnits = [];
  for (const sequence of units.sequences) {
    const ownerPackageIds = classifySequenceOwnership(sequence, operationsBySequence, operationById, ownershipByCanonicalName);
    if (!ownerPackageIds.includes(packageId)) continue;

    // A sequence owned by one package is that package's work. A sequence owned by several
    // is recorded once in each of their views, which is what makes the count of a unit's
    // appearances equal the count of its owners.
    const shared = ownerPackageIds.length > 1;
    const unit = {
      unitId: `${shared ? CROSS_BOUNDARY_UNIT_PREFIX : SEQUENCE_UNIT_PREFIX}${sequence.id}`,
      sequenceId: sequence.id,
      outcome: sequence.outcome,
      ownerPackageIds,
    };
    if (shared) crossBoundarySequenceUnits.push(unit);
    else ownedSequenceUnits.push(unit);
  }

  const structureSegments = normalizeStructureSegments(treeManifest.structure.segments);
  const lineRange = measureLineRangeJoin({ packageSegments, structureSegments, specLines: artifact.spec.lines });

  const namedClassNames = new Set(ownedOperationUnits.flatMap((unit) => unit.resultObjectClasses));

  // The relations that assign work beside ownership. Ownership reaches a package only through an
  // object an operation result names, so a package whose duty is structural appears in no unit
  // above; these are the units that reach it, and they are additive: nothing in the three lists is
  // recomputed from them.
  const obligationUnits = buildObligationUnits({ artifact, allocateManifest, record }, packageId, declared);
  // The same pure classifier the units above come from, so the finding and the units cannot
  // disagree about which judgment bound and which named nothing. A judgment that named nothing is
  // reported rather than dropped: a package told to implement a duty no specification states is a
  // worse outcome than a package told its record has a name it cannot use.
  const unboundAssignments = classifyAssignments(artifact, record?.assignments ?? []).unbound;
  // The columns this package adjudicated away. They produce no unit — a question removed is not
  // a duty placed — so they are carried beside the units rather than among them.
  const adjudicatedColumns = classifyAdjudications(record, packageId);

  return {
    packageId,
    ownedOperationUnits,
    ownedSequenceUnits,
    crossBoundarySequenceUnits,
    obligationUnits,
    unboundAssignments,
    adjudicatedColumns,
    obligationSource: declared.length > 0 ? OBLIGATION_SOURCES[0] : OBLIGATION_SOURCES[1],
    unmatchedClassNames: collectDistinctClassNames(artifact.operations).filter(
      (name) => namedClassNames.has(name) && !ownershipByCanonicalName.has(name),
    ),
    specLines: artifact.spec.lines,
    lineRange: {
      claimedLineCount: lineRange.claimedLineCount,
      multiClaimedLineCount: lineRange.multiClaimedLineCount,
      unclaimedLineCount: lineRange.unclaimedLineCount,
      identityUse: LINE_RANGE_IDENTITY_USE,
      statement: renderLineRangeStatement(lineRange),
    },
  };
}

/** A markdown table row built from cells that may be empty. */
// [::TICKET::] PX-256, PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-259) --for-spec --no-implementation-order`.
function renderTableRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

/** A section of the view, or a line saying the section is empty. */
// [::TICKET::] PX-256, PX-259 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-256|PX-259) --for-spec --no-implementation-order`.
function renderUnitTable(heading, units, columns) {
  if (units.length === 0) return [`## ${heading}`, '', 'None.', ''];
  return [
    `## ${heading}`,
    '',
    renderTableRow(columns.map((column) => column.title)),
    renderTableRow(columns.map(() => '---')),
    ...units.map((unit) => renderTableRow(columns.map((column) => column.value(unit)))),
    '',
  ];
}

/**
 * What one obligation unit owes, as the sentence a reader acts on.
 *
 * A served unit says what it was measured against and whether it could be checked at all, because
 * an absent cross-check and an absent obligation must not read the same: the first is a limit of the
 * artifact, the second is the defect this projection exists to remove.
 *
 * @param {object} unit
 * @returns {string}
 */
// [::TICKET::] PX-257, PX-259, PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-257|PX-259|PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function describeObligation(unit) {
  if (unit.relation === ASSIGNMENT_RELATION) {
    return unit.ground.length === 0 ? 'recorded with no ground' : `placed by a recorded judgment: ${unit.ground}`;
  }
  if (unit.relation !== 'serves') return `${unit.direction} for ${unit.counterpart}`;
  const { column, carried, total, crossChecked, operationSet } = unit.coverage;
  if (!crossChecked) return `not cross-checked: the artifact carries no ${column} column`;
  return `cross-checked against ${column}, ${carried} of ${total} operations against ${operationSet}`;
}

/** The line naming the judgments that named nothing, or none when every one of them bound. */
// [::TICKET::] PX-260, PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-260|PX-261|PX-262) --for-spec --no-implementation-order`.
function renderUnboundAssignments(units) {
  if (units.length === 0) return [];
  return [`Recorded assignments naming no operation or sequence: ${units.join(', ')}.`, ''];
}

/**
 * The line naming the questions this package removed, with the ground of each.
 *
 * An adjudication places no duty, so it produces no unit and appears in no table above. It is
 * printed because a reader of the projection is reading the whole decision: a column the package
 * decided is not a surface is as much a part of what it owes as the surfaces it declared, and a
 * projection that showed only the duties would leave the removal to be found in the record.
 */
// [::TICKET::] PX-261, PX-262 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-261|PX-262) --for-spec --no-implementation-order`.
function renderAdjudications(adjudications) {
  if (adjudications.length === 0) return [];
  const removed = adjudications.map((entry) => `${entry.column} — ${entry.ground.length === 0 ? 'recorded with no ground' : entry.ground}`);
  return [`Adjudicated away: ${removed.join('; ')}.`, ''];
}

/**
 * The obligation source of a view read from disk.
 *
 * A view projected before the relations existed carries no section at all, and that state is named
 * `absent` rather than defaulted to `undeclared`: a consumer that read the silence as a satisfied
 * obligation would reintroduce the defect the relations remove.
 *
 * @param {object} view
 * @returns {string}
 */
// [::TICKET::] PX-257 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-257 --for-spec --no-implementation-order`.
export function obligationSourceOf(view) {
  return OBLIGATION_SOURCES.includes(view?.obligationSource) ? view.obligationSource : OBLIGATION_SOURCES[2];
}

/**
 * The view as prose a grill reads.
 *
 * Every unit id appears verbatim, because PX-257 gates on the ids being present in the
 * package rather than on a count matching.
 *
 * @param {object} view
 * @returns {string}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function renderPackageViewMarkdown(view) {
  const lines = [
    `# Sequences and operations for ${view.packageId}`,
    '',
    VIEW_SOURCE_NOTE,
    '',
    `The specification is ${view.specLines} lines. ${view.lineRange.statement}`,
    '',
    ...renderUnitTable('Operations this package owns', view.ownedOperationUnits, [
      { title: 'Unit', value: (unit) => unit.unitId },
      { title: 'Operation', value: (unit) => unit.operationId },
      { title: 'Result object classes', value: (unit) => unit.resultObjectClasses.join(', ') },
      { title: 'Owning packages', value: (unit) => unit.ownerPackageIds.join(', ') },
    ]),
    ...renderUnitTable('Sequences this package owns', view.ownedSequenceUnits, [
      { title: 'Unit', value: (unit) => unit.unitId },
      { title: 'Sequence', value: (unit) => unit.sequenceId },
      { title: 'Outcome', value: (unit) => unit.outcome },
    ]),
    ...renderUnitTable('Sequences that cross this package boundary', view.crossBoundarySequenceUnits, [
      { title: 'Unit', value: (unit) => unit.unitId },
      { title: 'Sequence', value: (unit) => unit.sequenceId },
      { title: 'Outcome', value: (unit) => unit.outcome },
      { title: 'Owning packages', value: (unit) => unit.ownerPackageIds.join(', ') },
    ]),
    ...renderUnitTable('Obligation', view.obligationUnits ?? [], [
      { title: 'Relation', value: (unit) => unit.relation },
      { title: 'Unit', value: (unit) => unit.unitId },
      { title: 'Subject', value: (unit) => unit.subject },
      { title: 'Owes', value: (unit) => describeObligation(unit) },
    ]),
    ...renderUnboundAssignments(view.unboundAssignments ?? []),
    ...renderAdjudications(view.adjudicatedColumns ?? []),
    '## Class names no manifest owns',
    '',
    view.unmatchedClassNames.length === 0
      ? 'None.'
      : `${view.unmatchedClassNames.join(', ')}. These are recorded residuals: no manifest owns them, so no package can be told to implement them.`,
    '',
  ];
  return lines.join('\n');
}

/**
 * The view as the machine record PX-257 reads.
 *
 * @param {object} view
 * @returns {string}
 */
// [::TICKET::] PX-256 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-256 --for-spec --no-implementation-order`.
export function renderPackageViewJson(view) {
  return `${JSON.stringify(view, null, 2)}\n`;
}
