/**
 * Evaluate every check family and return both its findings and its sub-check statuses.
 *
 * The families keep their existing order so the report reads the same as before. The
 * registry is the single list of check ids; a family returns one status per id, so the
 * report can never claim a count that the executed checks do not support.
 */
import { collectBoundaryClauses, collectContributionCompleteness, collectEnumerationIntegrity, collectOperationEnvelope, collectArtifactViewConsistency } from './checks-layer-a.mjs';
import { collectCrossingContracts } from './checks-layer-b.mjs';
import { collectDangers } from './checks-danger.mjs';
import { CHECK_FAMILY_COUNT, CHECK_REGISTRY } from './check-status.mjs';

export { CHECK_FAMILY_COUNT, CHECK_REGISTRY };

/**
 * Run every check family over one index.
 *
 * @param {object} index
 * @returns {{ findings: Array<object>, subChecks: Array<object> }}
 */
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
export function evaluateCheckRegistry(index) {
  const results = [
    collectEnumerationIntegrity(index),
    collectOperationEnvelope(index),
    collectBoundaryClauses(index),
    collectContributionCompleteness(index),
    collectArtifactViewConsistency(index),
    collectCrossingContracts(index),
    collectDangers(index),
  ];
  return {
    findings: results.flatMap((result) => result.findings),
    subChecks: results.flatMap((result) => result.subChecks),
  };
}
