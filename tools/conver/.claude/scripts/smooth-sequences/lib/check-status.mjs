/**
 * The declared sub-checks of the smooth-sequences gate.
 *
 * Every check states the surfaces it reads, whether it claims something about the
 * specification or only about a projection, and the denominator it measures. The
 * evaluator resolves the check to `executed` only when every required surface is
 * present and the denominator is positive; otherwise it resolves to `blocked` with the
 * surface and reason. The union of executed and blocked is the registry itself, which
 * is the property a test can assert without knowing which branch a workspace takes.
 */
import { ORIGIN, SURFACES, surfaceAvailabilityOf } from './surfaces.mjs';

const ACTIVE_DISPOSITION = 'active';
const AUTHORED_FACT_FIELDS = Object.freeze(['pre', 'post', 'consumes', 'produces', 'errors']);

/** The number of check families the detector evaluates. */
export const CHECK_FAMILY_COUNT = 7;

/** One descriptor with every field the evaluator reads. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function check(id, family, { requires, claims, denominator }) {
  return Object.freeze({ id, family, requires: Object.freeze(requires), claims, denominator });
}

/** The active operations a status or effect surface is measured over. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function countActiveOperations(index) {
  return (index.artifact?.operations ?? []).filter((operation) => operation?.disposition === ACTIVE_DISPOSITION).length;
}

/** The rows of one artifact array. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function countRows(rows) {
  return Array.isArray(rows) ? rows.length : 0;
}

/** The steps that carry a typed (object) contract. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function collectTypedSteps(index) {
  return (index.artifact?.steps ?? []).filter((step) => step?.contract !== null
    && typeof step?.contract === 'object'
    && !Array.isArray(step.contract));
}

/** Whether a step carries typed authored facts or an authored prose contract. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function hasAuthoredContract(step) {
  const authored = step?.contract?.authored;
  if (authored !== null && typeof authored === 'object') {
    const hasTypedFact = AUTHORED_FACT_FIELDS.some((field) => Array.isArray(authored[field]) && authored[field].length > 0);
    if (hasTypedFact) return true;
  }
  return typeof step?.contract_prose === 'string' && step.contract_prose.trim() !== '';
}

/** The steps that carry an authored contract rather than a registry projection. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function countAuthoredSteps(index) {
  return (index.artifact?.steps ?? []).filter((step) => hasAuthoredContract(step)).length;
}

/** The typed steps that declare at least one crossing. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function collectCrossingSteps(index) {
  return collectTypedSteps(index).filter((step) => Object.prototype.hasOwnProperty.call(step.contract, 'crosses'));
}

/** The distinct boundaries the typed steps cross. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function countCrossingBoundaries(index) {
  const boundaries = new Set();
  for (const step of collectCrossingSteps(index)) {
    for (const boundary of step.contract.crosses ?? []) boundaries.add(boundary);
  }
  return boundaries.size;
}

/** Every check id, in the order the report lists its family. */
export const CHECK_REGISTRY = Object.freeze([
  check('S1.duplicate-id', 'enumeration', {
    requires: [SURFACES.OPERATIONS, SURFACES.SEQUENCES, SURFACES.STEPS],
    claims: 'spec',
    denominator: (index) => countRows(index.artifact?.operations) + countRows(index.artifact?.sequences) + countRows(index.artifact?.steps),
  }),
  check('S1.step-unresolved-operation', 'enumeration', {
    requires: [SURFACES.OPERATIONS, SURFACES.STEPS],
    claims: 'spec',
    denominator: (index) => countRows(index.artifact?.steps),
  }),
  check('S1.step-unresolved-sequence', 'enumeration', {
    requires: [SURFACES.SEQUENCES, SURFACES.STEPS],
    claims: 'spec',
    denominator: (index) => countRows(index.artifact?.steps),
  }),
  check('S1.sequence-without-step', 'enumeration', {
    requires: [SURFACES.SEQUENCES, SURFACES.STEPS],
    claims: 'spec',
    denominator: (index) => countRows(index.artifact?.sequences),
  }),
  check('S1.not-a-sequence-ground-missing', 'enumeration', {
    requires: [SURFACES.SEQUENCES],
    claims: 'spec',
    denominator: (index) => countRows(index.artifact?.sequences),
  }),
  check('S3.status-initial-unknown', 'envelope', {
    requires: [SURFACES.OPERATIONS, SURFACES.OPERATION_TRANSITIONS],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S3.transition-target-unknown', 'envelope', {
    requires: [SURFACES.OPERATIONS, SURFACES.OPERATION_TRANSITIONS],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S3.transition-out-of-terminal', 'envelope', {
    requires: [SURFACES.OPERATIONS, SURFACES.OPERATION_TRANSITIONS, SURFACES.TERMINAL_STATUSES],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S3.finality-missing-for-external', 'envelope', {
    requires: [SURFACES.OPERATIONS],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S3.interface-mapping-missing', 'envelope', {
    requires: [SURFACES.OPERATIONS, SURFACES.REQUIRED_INTERFACES],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S4.boundary-contract-missing', 'boundaries', {
    requires: [SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => countRows(index.allocateManifest?.contract_registry),
  }),
  check('S4.contract-source-refs-missing', 'boundaries', {
    requires: [SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => countRows(index.allocateManifest?.contract_registry),
  }),
  check('S4.boundary-clause-missing', 'boundaries', {
    requires: [SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => countRows(index.allocateManifest?.contract_registry),
  }),
  check('S4.boundary-clause-extra', 'boundaries', {
    requires: [SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => countRows(index.allocateManifest?.contract_registry),
  }),
  check('S4.boundary-side-mismatch', 'boundaries', {
    requires: [SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => countRows(index.allocateManifest?.contract_registry),
  }),
  check('S4.contribution-missing', 'contribution', {
    requires: [SURFACES.REGISTRY_CONTRIBUTION],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S4.contribution-ground-missing', 'contribution', {
    requires: [SURFACES.REGISTRY_CONTRIBUTION],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S4.contribution-unowned', 'contribution', {
    requires: [SURFACES.REGISTRY_CONTRIBUTION],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S7.view-missing', 'consistency', {
    requires: [SURFACES.PACKAGE_VIEWS],
    claims: 'spec',
    denominator: (index) => countRows(index.packages),
  }),
  check('S7.view-package-mismatch', 'consistency', {
    requires: [SURFACES.PACKAGE_VIEWS],
    claims: 'spec',
    denominator: (index) => countRows(index.packages),
  }),
  check('S7.view-unit-mismatch', 'consistency', {
    requires: [SURFACES.PACKAGE_VIEWS],
    claims: 'spec',
    denominator: (index) => countRows(index.packages),
  }),
  check('S7.rfc-boundary-missing', 'consistency', {
    requires: [SURFACES.PACKAGE_VIEWS],
    claims: 'spec',
    denominator: (index) => countRows(index.packages),
  }),
  check('S7.obligation-unit-unknown', 'consistency', {
    requires: [SURFACES.OBLIGATION_UNITS],
    claims: 'spec',
    denominator: (index) => countRows(index.packages),
  }),
  check('S5.crossing-boundary-unknown', 'meshing', {
    requires: [SURFACES.STEP_CROSSINGS],
    claims: 'spec',
    denominator: (index) => collectCrossingSteps(index).length,
  }),
  check('S5.crossing-direction-mismatch', 'meshing', {
    requires: [SURFACES.STEP_CROSSINGS, SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => collectCrossingSteps(index).length,
  }),
  check('S5.crossing-side-missing', 'meshing', {
    requires: [SURFACES.STEP_CROSSINGS, SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: countCrossingBoundaries,
  }),
  check('S5.precondition-not-implied', 'meshing', {
    requires: [SURFACES.AUTHORED_CONTRACTS],
    claims: 'spec',
    denominator: countAuthoredSteps,
  }),
  check('S5.consumes-not-produced', 'meshing', {
    requires: [SURFACES.AUTHORED_CONTRACTS],
    claims: 'spec',
    denominator: countAuthoredSteps,
  }),
  check('S5.error-set-mismatch', 'meshing', {
    requires: [SURFACES.AUTHORED_CONTRACTS],
    claims: 'spec',
    denominator: countAuthoredSteps,
  }),
  check('S5.boundary-uncovered', 'meshing', {
    requires: [SURFACES.STEP_CROSSINGS, SURFACES.CONTRACT_REGISTRY],
    claims: 'spec',
    denominator: (index) => countRows(index.treeManifest?.dependencies?.boundaries),
  }),
  check('S5.projection-only', 'meshing', {
    requires: [SURFACES.TYPED_STEP_CONTRACTS],
    claims: 'spec',
    denominator: (index) => collectTypedSteps(index).length,
  }),
  check('S6.cycle', 'danger', {
    requires: [SURFACES.TYPED_STEP_CONTRACTS],
    claims: 'spec',
    denominator: (index) => collectTypedSteps(index).length,
  }),
  check('S6.unreachable-operation', 'danger', {
    requires: [SURFACES.OPERATIONS],
    claims: 'spec',
    denominator: countActiveOperations,
  }),
  check('S6.orphan-object', 'danger', {
    requires: [SURFACES.TYPED_STEP_CONTRACTS, SURFACES.GROUNDED_OBJECTS],
    claims: 'spec',
    denominator: (index) => collectTypedSteps(index).length,
  }),
  check('S6.unannotated-repeat', 'danger', {
    requires: [SURFACES.OPERATIONS, SURFACES.STEPS],
    claims: 'spec',
    denominator: (index) => countRows(index.artifact?.steps),
  }),
  check('S6.order-contradiction', 'danger', {
    requires: [SURFACES.TYPED_STEP_CONTRACTS],
    claims: 'spec',
    denominator: (index) => collectTypedSteps(index).length,
  }),
  check('S6.boundary-effect-drift', 'danger', {
    requires: [SURFACES.BOUNDARY_EFFECTS],
    claims: 'projection',
    denominator: countActiveOperations,
  }),
]);

/** A check that executed, with the denominator it measured. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function buildExecutedEntry(entry, denominator) {
  return { id: entry.id, family: entry.family, status: 'executed', denominator };
}

/** A check that could not execute, with the surface and reason. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function buildBlockedEntry(entry, surface, reason) {
  return { id: entry.id, family: entry.family, status: 'blocked', surface, reason, denominator: 0 };
}

/** The first reason a descriptor cannot execute over this index, or null. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function findBlockingReason(entry, index) {
  for (const surface of entry.requires) {
    const availability = surfaceAvailabilityOf(index, surface);
    if (!availability.present) return { surface, reason: `${surface} is absent` };
    if (entry.claims === 'spec' && availability.origin === ORIGIN.MIGRATION) {
      return { surface, reason: `${surface} is synthesized by migration` };
    }
  }
  return null;
}

/**
 * The status of every check in one family.
 *
 * `skippedReasons` is reserved for a family that can state a more precise reason than
 * the generic surface message, such as the vocabulary derivation text. A reason in
 * this map blocks the check even when the surface record looks present.
 *
 * @param {string} family
 * @param {object} index
 * @param {Map<string, string>} [skippedReasons] — check id to the reason it could not run
 * @returns {Array<{id: string, family: string, status: string, surface?: string,
 *   reason?: string, denominator?: number}>}
 */
export function buildFamilySubChecks(family, index, skippedReasons = new Map()) {
  return CHECK_REGISTRY
    .filter((entry) => entry.family === family)
    .map((entry) => {
      const stated = skippedReasons.get(entry.id);
      if (stated !== undefined) return buildBlockedEntry(entry, entry.requires[0] ?? 'unknown', stated);
      const reason = findBlockingReason(entry, index);
      if (reason !== null) return buildBlockedEntry(entry, reason.surface, reason.reason);
      const denominator = entry.denominator(index);
      if (denominator === 0) return buildBlockedEntry(entry, entry.requires[0] ?? 'unknown', 'empty denominator');
      return buildExecutedEntry(entry, denominator);
    });
}
