/**
 * Evaluate every check family and return its findings, its sub-check statuses and the
 * blocked surfaces.
 *
 * A family still computes the findings it knows how to compute. The registry then
 * removes any finding whose check is blocked: a check that could not read its evidence
 * must not contribute a result, or a missing surface would be indistinguishable from a
 * clean measurement. The `blocked` list is the input the verdict and the report need;
 * `subChecks` is the same information in family order.
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
 * @returns {{ findings: Array<object>, subChecks: Array<object>, blocked: Array<object> }}
 */
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
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
  const subChecks = results.flatMap((result) => result.subChecks);
  const blocked = subChecks
    .filter((entry) => entry.status === 'blocked')
    .map((entry) => ({
      checkId: entry.id,
      family: entry.family,
      surface: entry.surface,
      reason: entry.reason,
    }));
  const blockedIds = new Set(blocked.map((entry) => entry.checkId));
  const findings = results
    .flatMap((result) => result.findings)
    .filter((finding) => !blockedIds.has(finding.checkId));
  return { findings, subChecks, blocked };
}
