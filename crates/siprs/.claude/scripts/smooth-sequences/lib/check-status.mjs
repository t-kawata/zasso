/**
 * The declared sub-checks of the smooth-sequences gate.
 *
 * The detector used to report one count per family, so a family that skipped its
 * condition looked the same as one that ran and found nothing. Every check id lives
 * here once, and a family either executes it or states why it could not. The union of
 * executed and skipped is therefore the registry itself, which is the property a test
 * can assert without knowing which branch a workspace takes.
 */

/** Every check id, in the order the report lists its family. */
export const CHECK_REGISTRY = Object.freeze([
  { id: 'S1.duplicate-id', family: 'enumeration' },
  { id: 'S1.step-unresolved-operation', family: 'enumeration' },
  { id: 'S1.step-unresolved-sequence', family: 'enumeration' },
  { id: 'S1.sequence-without-step', family: 'enumeration' },
  { id: 'S1.not-a-sequence-ground-missing', family: 'enumeration' },
  { id: 'S3.status-initial-unknown', family: 'envelope' },
  { id: 'S3.transition-target-unknown', family: 'envelope' },
  { id: 'S3.transition-out-of-terminal', family: 'envelope' },
  { id: 'S3.finality-missing-for-external', family: 'envelope' },
  { id: 'S3.interface-mapping-missing', family: 'envelope' },
  { id: 'S4.boundary-contract-missing', family: 'boundaries' },
  { id: 'S4.contract-source-refs-missing', family: 'boundaries' },
  { id: 'S4.boundary-clause-missing', family: 'boundaries' },
  { id: 'S4.boundary-clause-extra', family: 'boundaries' },
  { id: 'S4.boundary-side-mismatch', family: 'boundaries' },
  { id: 'S4.contribution-missing', family: 'contribution' },
  { id: 'S4.contribution-ground-missing', family: 'contribution' },
  { id: 'S4.contribution-unowned', family: 'contribution' },
  { id: 'S7.view-missing', family: 'consistency' },
  { id: 'S7.view-package-mismatch', family: 'consistency' },
  { id: 'S7.view-unit-mismatch', family: 'consistency' },
  { id: 'S7.rfc-boundary-missing', family: 'consistency' },
  { id: 'S7.obligation-unit-unknown', family: 'consistency' },
  { id: 'S5.crossing-boundary-unknown', family: 'meshing' },
  { id: 'S5.crossing-direction-mismatch', family: 'meshing' },
  { id: 'S5.crossing-side-missing', family: 'meshing' },
  { id: 'S5.precondition-not-implied', family: 'meshing' },
  { id: 'S5.consumes-not-produced', family: 'meshing' },
  { id: 'S5.error-set-mismatch', family: 'meshing' },
  { id: 'S5.boundary-uncovered', family: 'meshing' },
  { id: 'S5.projection-only', family: 'meshing' },
  { id: 'S6.cycle', family: 'danger' },
  { id: 'S6.unreachable-operation', family: 'danger' },
  { id: 'S6.orphan-object', family: 'danger' },
  { id: 'S6.unannotated-repeat', family: 'danger' },
  { id: 'S6.order-contradiction', family: 'danger' },
  { id: 'S6.boundary-effect-drift', family: 'danger' },
]);

/** The number of check families the detector evaluates. */
export const CHECK_FAMILY_COUNT = 7;

/** The status of one sub-check. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function executed(id, family) {
  return { id, family, status: 'executed' };
}

/** The status of one sub-check that its family could not evaluate. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function skipped(id, family, reason) {
  return { id, family, status: 'skipped', reason };
}

/**
 * The status of every check in one family.
 *
 * @param {string} family
 * @param {Map<string, string>} [skippedReasons] — check id to the reason it could not run
 * @returns {Array<{id: string, family: string, status: string, reason?: string}>}
 */
export function buildFamilySubChecks(family, skippedReasons = new Map()) {
  return CHECK_REGISTRY
    .filter((entry) => entry.family === family)
    .map((entry) => {
      const reason = skippedReasons.get(entry.id);
      return reason === undefined ? executed(entry.id, family) : skipped(entry.id, family, reason);
    });
}

/** The same reason for every check in a family. */
export function skipWholeFamily(family, reason) {
  return new Map(CHECK_REGISTRY.filter((entry) => entry.family === family).map((entry) => [entry.id, reason]));
}
