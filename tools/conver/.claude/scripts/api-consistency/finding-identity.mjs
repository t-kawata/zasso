/**
 * The stable identity of one API-consistency finding.
 *
 * A baseline compares two runs. The comparison is only meaningful when a finding keeps
 * one identity across runs and the digest does not depend on the order the findings were
 * produced in. Both facts live here rather than in the verifier, the guard and the
 * evidence generator separately, because three copies of one rule drift.
 */
import { createHash } from 'node:crypto';

/** The hex characters a finding id carries. */
const ID_HEX_LENGTH = 16;

/** The fields that identify a finding, in the order they are hashed. */
const IDENTITY_FIELDS = Object.freeze(['code', 'symbol', 'package', 'cause']);

/**
 * One finding's identity, or null when the finding carries no identity field.
 *
 * @param {object} finding
 * @returns {string}
 */
export function findingIdentity(finding) {
  const identity = IDENTITY_FIELDS.map((field) => String(finding?.[field] ?? '')).join('|');
  return createHash('sha256').update(identity).digest('hex').slice(0, ID_HEX_LENGTH);
}

/** The canonical record a digest hashes, so extra fields cannot change the digest. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function canonicalFinding(finding) {
  return {
    id: finding?.id ?? findingIdentity(finding),
    code: String(finding?.code ?? ''),
    symbol: String(finding?.symbol ?? ''),
    package: String(finding?.package ?? ''),
    cause: String(finding?.cause ?? ''),
  };
}

/** The sort key of one canonical finding. */
// [::TICKET::] PX-372 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-372 --for-spec --no-implementation-order`.
function canonicalKey(finding) {
  return [finding.id, finding.code, finding.symbol, finding.package, finding.cause].join('|');
}

/**
 * The digest of a finding set, independent of the order the set was collected in.
 *
 * @param {object[]} findings
 * @returns {string}
 */
export function digestOfFindings(findings) {
  const canonical = (findings ?? [])
    .map(canonicalFinding)
    .sort((left, right) => canonicalKey(left).localeCompare(canonicalKey(right)));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
