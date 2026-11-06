// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
/**
 * The identity of the check set that produced a smooth-sequences pass.
 *
 * A report is comparable only with a report measured by the same checks. The digest is
 * derived from the serializable descriptors of every sub-check and the closure gate
 * scripts, so a check added or changed after a pass makes the stored pass visibly older
 * without anyone having to remember to bump a version. It records no check result and
 * changes no verdict.
 */
import { createHash } from 'node:crypto';

import { CHECK_REGISTRY } from './check-status.mjs';
import { CLOSURE_GATES } from './closure-gates.mjs';

/** The digest algorithm the check-set identity uses. */
export const CHECK_SET_DIGEST_ALGORITHM = 'sha256';

/** The identity schema; bumping it makes every earlier digest a different check set. */
export const CHECK_SET_SCHEMA_VERSION = 1;

/** The gate ids the closure phases run, in a stable order. */
export function closureGateIds() {
  return CLOSURE_GATES.map((gate) => gate.script);
}

/**
 * One descriptor reduced to what makes the check set different.
 *
 * @param {{id: string, family: string, requires: string[], claims: string}} descriptor
 * @returns {{id: string, family: string, requires: string[], claims: string}}
 */
// [::TICKET::] PX-389 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-389 --for-spec --no-implementation-order`.
function serializableDescriptor(descriptor) {
  return {
    id: descriptor.id,
    family: descriptor.family,
    requires: [...(descriptor.requires ?? [])].sort(),
    claims: descriptor.claims,
  };
}

/**
 * Hash the running check set.
 *
 * @param {{registry?: Array<object>, closureGateIds?: string[]}} [input]
 * @returns {string} hex digest
 */
export function computeCheckSetDigest({ registry = CHECK_REGISTRY, closureGateIds: gateIds = closureGateIds() } = {}) {
  const checks = registry.map(serializableDescriptor).sort((left, right) => left.id.localeCompare(right.id));
  const gates = [...gateIds].sort();

  return createHash(CHECK_SET_DIGEST_ALGORITHM)
    .update(JSON.stringify({ schema: CHECK_SET_SCHEMA_VERSION, checks, gates }))
    .digest('hex');
}

/**
 * The running check set compared with the digest a previous status recorded.
 *
 * `undefined` means there is no previous status at all, so nothing can be stale.
 * `null` means a status exists but recorded no digest, which is a previous check set.
 *
 * @param {string|null|undefined} previousDigest
 * @returns {{digest: string, previousDigest: string|null, stale: boolean}}
 */
export function buildCheckSetRecord(previousDigest) {
  const digest = computeCheckSetDigest();
  const hasPreviousStatus = previousDigest !== undefined;
  const recorded = typeof previousDigest === 'string' && previousDigest.length > 0 ? previousDigest : null;

  return { digest, previousDigest: recorded, stale: hasPreviousStatus && recorded !== digest };
}
