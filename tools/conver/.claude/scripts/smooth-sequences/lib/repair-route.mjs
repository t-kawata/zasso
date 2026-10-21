/**
 * The authored surface and the producer that re-derive a finding's verdict.
 *
 * A finding is only useful if it names the file a reader may edit and the command that
 * turns that edit back into the artifact the detector judges. Generated files are never
 * an editable surface: they are named only as the thing a producer rewrites. The table
 * is exhaustive by construction — an emitted checkId with no entry raises
 * `UNROUTED_FINDING` rather than rendering a blank repair line.
 */
import { SmoothSequencesError } from './errors.mjs';

export const SURFACE = Object.freeze({
  SPEC: 'spec',
  PACKAGE_RFC: 'package-rfc',
  PACKAGE_OBLIGATION: 'package-obligation',
  ALLOCATE_DECISIONS: 'allocate-decisions',
  PACKAGE_VIEW: 'package-view',
});

export const ALLOCATE_DECISIONS_PATH = 'workspacify/allocate/DECISIONS.json';
export const REGENERATION_COMMAND = 'node .claude/scripts/regeneration/run.mjs open --spec=<candidate> --reason=<reason>';
export const REGENERATION_ALLOCATE_COMMAND = 'node .claude/scripts/regeneration/run.mjs open --allocate-decisions=<candidate> --reason=<reason>';
export const DETECTOR_COMMAND = 'node .claude/scripts/smooth-sequences/run.mjs';
export const SEQUENCES_SLICE_COMMAND = 'node .claude/scripts/sequences-slice/run.mjs';

// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
const SPEC_CHECK_IDS = Object.freeze([
  'S1.duplicate-id',
  'S1.not-a-sequence-ground-missing',
  'S1.sequence-without-step',
  'S1.step-unresolved-operation',
  'S1.step-unresolved-sequence',
  'S3.finality-missing-for-external',
  'S3.interface-mapping-missing',
  'S3.status-initial-unknown',
  'S3.transition-out-of-terminal',
  'S3.transition-target-unknown',
  'S4.contribution-ground-missing',
  'S4.contribution-missing',
  'S4.contribution-unowned',
  'S5.boundary-uncovered',
  'S5.consumes-not-produced',
  'S5.crossing-boundary-unknown',
  'S5.crossing-direction-mismatch',
  'S5.crossing-side-missing',
  'S5.error-set-mismatch',
  'S5.precondition-not-implied',
  'S5.projection-only',
  'S6.boundary-effect-drift',
  'S6.cycle',
  'S6.order-contradiction',
  'S6.orphan-object',
  'S6.unannotated-repeat',
  'S6.unreachable-operation',
]);

const ALLOCATE_CHECK_IDS = Object.freeze([
  'S4.boundary-clause-extra',
  'S4.boundary-clause-missing',
  'S4.boundary-contract-missing',
  'S4.boundary-side-mismatch',
  'S4.contract-source-refs-missing',
]);

const PACKAGE_RFC_CHECK_IDS = Object.freeze(['S7.rfc-boundary-missing']);

// [::TICKET::] PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-284 --for-spec --no-implementation-order`.
const PACKAGE_VIEW_CHECK_IDS = Object.freeze([
  'S7.obligation-unit-unknown',
  'S7.view-missing',
  'S7.view-package-mismatch',
  'S7.view-unit-mismatch',
]);

/** Every emitted checkId mapped to the surface that authored it. */
export const REPAIR_ROUTE_BY_CHECK_ID = Object.freeze(Object.fromEntries([
  ...SPEC_CHECK_IDS.map((checkId) => [checkId, SURFACE.SPEC]),
  ...ALLOCATE_CHECK_IDS.map((checkId) => [checkId, SURFACE.ALLOCATE_DECISIONS]),
  ...PACKAGE_RFC_CHECK_IDS.map((checkId) => [checkId, SURFACE.PACKAGE_RFC]),
  ...PACKAGE_VIEW_CHECK_IDS.map((checkId) => [checkId, SURFACE.PACKAGE_VIEW]),
]));

/** A path with the row a reader opens, or the bare path when no row is known. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function withLocator(filePath, locator) {
  return typeof locator === 'string' && locator.trim() !== '' ? `${filePath}#${locator.trim()}` : filePath;
}

/** The package a package-scoped route names, or a refusal that cannot be rendered as a pass. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function requirePackage(context) {
  const pkg = context.packagesById?.get(context.packageId);
  if (pkg === undefined) {
    const whose = typeof context.checkId === 'string' ? `finding ${context.checkId}` : 'a package-scoped finding';
    throw new SmoothSequencesError(`${whose} names no package`, {
      code: 'UNROUTED_FINDING',
      repair: 'Pass the package the finding belongs to when resolving its route.',
    });
  }
  return pkg;
}

/** A regeneration route: the live spec is evidence, never an edit surface. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function specTarget(context) {
  const specPath = context.artifact?.spec?.path;
  const where = typeof specPath === 'string' && specPath.trim() !== ''
    ? `${withLocator(specPath, context.locator)} (read-only; copy it to a candidate first)`
    : 'candidate spec (the artifact records no spec path)';
  return { where, producer: REGENERATION_COMMAND, repairClass: 'regeneration' };
}

/** The route for one finding, resolved from its checkId unless the caller overrides the surface. */
export function repairRouteFor(checkId, context = {}) {
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
  const surface = context.surface ?? REPAIR_ROUTE_BY_CHECK_ID[checkId];
  if (surface === undefined) {
    throw new SmoothSequencesError(`no repair route for finding ${checkId}`, {
      code: 'UNROUTED_FINDING',
      repair: `Add ${checkId} to REPAIR_ROUTE_BY_CHECK_ID with the surface and producer that repair it.`,
    });
  }
  switch (surface) {
    case SURFACE.SPEC:
      return specTarget(context);
    case SURFACE.ALLOCATE_DECISIONS:
      return {
        where: withLocator(ALLOCATE_DECISIONS_PATH, context.locator),
        producer: REGENERATION_ALLOCATE_COMMAND,
        repairClass: 'regeneration',
      };
    case SURFACE.PACKAGE_RFC:
      return {
        where: withLocator(`${requirePackage({ ...context, checkId }).path}/RFC.md`, context.locator),
        producer: DETECTOR_COMMAND,
        repairClass: 'in-place',
      };
    case SURFACE.PACKAGE_OBLIGATION: {
      const pkg = requirePackage({ ...context, checkId });
      return {
        where: withLocator(`${pkg.path}/OBLIGATION.json`, context.locator),
        producer: `${SEQUENCES_SLICE_COMMAND} ${context.artifactPath ?? '<artifact>'} ${pkg.path}`,
        repairClass: 'in-place',
      };
    }
    case SURFACE.PACKAGE_VIEW: {
      const pkg = requirePackage({ ...context, checkId });
      return {
        where: withLocator(`${pkg.path}/SEQUENCES.json`, context.locator),
        producer: `${SEQUENCES_SLICE_COMMAND} ${context.artifactPath ?? '<artifact>'} ${pkg.path}`,
        repairClass: 'in-place',
      };
    }
    default:
      throw new SmoothSequencesError(`unknown repair surface ${surface} for finding ${checkId}`, {
        code: 'UNROUTED_FINDING',
        repair: 'Add the surface to SURFACE and to repairRouteFor.',
      });
  }
}

/** The route for a finding about one operation row. */
export function routeForOperation(checkId, index, operation) {
  const line = operation?.grounding?.line;
  const locator = typeof line === 'number' ? `L${line}` : operation?.id;
  return repairRouteFor(checkId, { artifact: index.artifact, artifactPath: index.artifactPath, locator });
}

/** The route for a finding about one step row. */
export function routeForStep(checkId, index, step) {
  const locator = typeof step?.line === 'number' ? `L${step.line}` : step?.id;
  return repairRouteFor(checkId, { artifact: index.artifact, artifactPath: index.artifactPath, locator });
}

/** The route for a finding about a row that carries no spec line of its own. */
export function routeForSpecRow(checkId, index, locator) {
  return repairRouteFor(checkId, { artifact: index.artifact, artifactPath: index.artifactPath, locator });
}

/** The route for a finding about a package's authored RFC or view. */
export function routeForPackage(checkId, index, packageId, locator) {
  return repairRouteFor(checkId, {
    artifactPath: index.artifactPath,
    packagesById: index.packagesById,
    packageId,
    locator,
  });
}
