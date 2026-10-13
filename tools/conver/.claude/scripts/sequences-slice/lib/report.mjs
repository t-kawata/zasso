/**
 * The calibration as a value, and the calibration as prose.
 *
 * The report is built here rather than inside the command so that the shape the tests
 * assert and the shape PX-257 reads are one thing. The command's only job is to read
 * three files and a tree, and to print one of two renderings of this value.
 */
import {
  collectDistinctClassNames,
  collectReachedPackageIds,
  collectUnmatchedClassNames,
  countOperationOwnershipBuckets,
  resolveOwningPackages,
} from './ownership.mjs';
import { disposeUnmatchedClassNames } from './residuals.mjs';
import { measureLineRangeJoin, normalizeStructureSegments } from './segments.mjs';
import {
  buildSequenceUnits,
  collectSequencesWithNoKnownPackage,
  sequenceAxisBuckets,
} from './units.mjs';
import { digestSnapshot } from './digest.mjs';

/**
 * The counts the live workspace produced on 2026-10-13.
 *
 * Recorded so that a run can say whether it still measures the same world. These are the
 * numbers PX-257 calibration-checks against, and a change in any of them is a change in
 * the join rather than a change in the code.
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export const BASELINE = Object.freeze({
  emptyResultClasses: 47,
  exactlyOnePackage: 187,
  severalPackages: 20,
  noKnownPackage: 3,
  sequencesOnePackage: 73,
  sequencesSeveralPackages: 38,
  sequencesNoKnownPackage: 5,
  packagesReached: 13,
  unmatchedClassNames: 10,
  declaredResidualClassNames: 10,
});

/** The sentence that keeps the rejected key from being mistaken for an identity. */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export const LINE_RANGE_IDENTITY_USE = 'not used as an identity';

/**
 * The line-range measurement, stated in prose.
 *
 * The numbers are read off the measurement rather than written into the sentence, so a
 * sentence that disagreed with its own numbers is not a thing this function can produce.
 *
 * @param {ReturnType<typeof measureLineRangeJoin>} measured
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function renderLineRangeStatement(measured) {
  const packagesWithNoSegments = measured.packagesWithNoSegments.length;
  return [
    `The line coordinate is ${LINE_RANGE_IDENTITY_USE}, and this is the measurement that says so.`,
    `It claims ${measured.claimedLineCount} of the specification's lines and leaves ${measured.unclaimedLineCount} unclaimed, so it is total.`,
    `But ${measured.multiClaimedLineCount} of the claimed lines are claimed by more than one package, and only ${measured.singlyClaimedSegmentIds.length} of ${measured.segmentsUsedByMoreThanOnePackage + measured.singlyClaimedSegmentIds.length + measured.unusedSegmentIds.length} segments belong to a single package, the busiest to ${measured.maxClaimantsOnOneSegment}.`,
    `${packagesWithNoSegments} packages claim no segment at all, so it cannot reach them whatever the ranges are.`,
  ].join('\n');
}

/**
 * The whole calibration as one value.
 *
 * @param {{
 *   artifact: { spec: { lines: number }, sequences: unknown[], steps: unknown[], operations: unknown[] },
 *   treeManifest: { inventory: { objects: unknown[], claims: Array<{ canonical_name: string }>, terms: Array<{ canonical_name: string }> }, structure: { segments: unknown[] } },
 *   allocateManifest: unknown,
 *   packageSegments: Array<{ packagePath: string, segmentIds: string[] }>,
 * }} input
 * @returns {object}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function buildCalibrationReport({ artifact, treeManifest, allocateManifest, packageSegments }) {
  const units = buildSequenceUnits(artifact);
  const ownershipByCanonicalName = resolveOwningPackages(treeManifest.inventory.objects);

  const operations = countOperationOwnershipBuckets(artifact.operations, ownershipByCanonicalName);
  const sequenceBuckets = sequenceAxisBuckets(units, ownershipByCanonicalName);
  const reachedPackageIds = collectReachedPackageIds(artifact.operations, ownershipByCanonicalName);
  const unmatched = collectUnmatchedClassNames(artifact.operations, ownershipByCanonicalName);
  const dispositions = disposeUnmatchedClassNames(unmatched, {
    claimNames: treeManifest.inventory.claims.map((claim) => claim.canonical_name),
    termNames: treeManifest.inventory.terms.map((term) => term.canonical_name),
  });

  const measuredLineRange = measureLineRangeJoin({
    packageSegments,
    structureSegments: normalizeStructureSegments(treeManifest.structure.segments),
    specLines: artifact.spec.lines,
  });

  const measured = {
    emptyResultClasses: operations.emptyResultClasses,
    exactlyOnePackage: operations.exactlyOnePackage,
    severalPackages: operations.severalPackages,
    noKnownPackage: operations.noKnownPackage,
    sequencesOnePackage: sequenceBuckets.onePackage,
    sequencesSeveralPackages: sequenceBuckets.severalPackages,
    sequencesNoKnownPackage: sequenceBuckets.noKnownPackage,
    packagesReached: reachedPackageIds.length,
    unmatchedClassNames: unmatched.length,
    declaredResidualClassNames: dispositions.declaredResiduals.length,
  };

  return {
    specLines: artifact.spec.lines,
    operations,
    sequences: {
      ...sequenceBuckets,
      sequencesWithNoKnownPackage: collectSequencesWithNoKnownPackage(units, ownershipByCanonicalName),
    },
    packages: {
      reachedCount: reachedPackageIds.length,
      reachedPackageIds,
    },
    classNames: {
      distinct: collectDistinctClassNames(artifact.operations).length,
      unmatched,
      dispositions,
    },
    lineRange: {
      ...measuredLineRange,
      identityUse: LINE_RANGE_IDENTITY_USE,
      statement: renderLineRangeStatement(measuredLineRange),
    },
    unknownSequenceOutcomes: units.unknownOutcomes,
    baseline: BASELINE,
    baselineMatches: Object.keys(BASELINE).every((key) => BASELINE[key] === measured[key]),
    snapshotDigest: digestSnapshot({ artifact, treeManifest, allocateManifest }),
  };
}

/**
 * The calibration as a machine record.
 *
 * @param {object} report
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function renderCalibrationJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * The calibration as prose an operator reads.
 *
 * This is the default rendering. A calibration is read to decide whether a gate may be
 * written against it, and that decision is made by a person reading four sentences, not
 * by a program reading a field.
 *
 * @param {object} report
 * @param {string[]} packagePaths - the package directories that were read
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function renderCalibrationProse(report, { packagePaths }) {
  const lines = [
    '# Sequence-ledger calibration',
    '',
    `Read ${packagePaths.length} package seed documents.`,
    '',
    '## Ownership join',
    '',
    `Of ${report.operations.total} operations, ${report.operations.emptyResultClasses} name no result object class,`,
    `${report.operations.exactlyOnePackage} resolve to exactly one package, ${report.operations.severalPackages} resolve to several,`,
    `and ${report.operations.noKnownPackage} resolve to none. ${report.packages.reachedCount} packages are reached.`,
    '',
    `${report.classNames.distinct} distinct class names occur; ${report.classNames.unmatched.length} are owned by nobody.`,
    `Disposition: ${report.classNames.dispositions.resolvedThroughClaims.length} through claims,`,
    `${report.classNames.dispositions.resolvedThroughTerms.length} through terms,`,
    `${report.classNames.dispositions.declaredResiduals.length} declared residuals,`,
    `${report.classNames.dispositions.unaccounted.length} unaccounted.`,
    '',
    '## Sequence axis',
    '',
    `Of ${report.sequences.total} sequences, ${report.sequences.onePackage} resolve to one package,`,
    `${report.sequences.severalPackages} resolve to several, and ${report.sequences.noKnownPackage} resolve to none:`,
    `${report.sequences.sequencesWithNoKnownPackage.join(', ')}.`,
    '',
    '## Line coordinate',
    '',
    report.lineRange.statement,
    '',
    '## Drift',
    '',
    `Recorded baseline: ${report.baselineMatches ? 'matched' : 'DID NOT MATCH — the join is not a function of an unchanged workspace'}.`,
    `artifact ${report.snapshotDigest.artifact}`,
    `tree     ${report.snapshotDigest.treeManifest}`,
    `allocate ${report.snapshotDigest.allocateManifest}`,
    '',
  ];
  return lines.join('\n');
}
