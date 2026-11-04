// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * Formula identifiers.
 *
 * The id is the digest's short form, so two runs over the same body agree without a
 * registry and two different bodies cannot share an id by accident.
 */
import { sha256Hex } from '../workspacify-tree/lib/hash.mjs';

/** The prefix every formula id carries. */
export const FORMULA_ID_PREFIX = 'fx-';

/** How many digest characters the id keeps. */
export const FORMULA_ID_LENGTH = 12;

/**
 * @param {string} normalized
 * @returns {string}
 */
export function digestFormula(normalized) {
  return sha256Hex(Buffer.from(normalized, 'utf8'));
}

/**
 * @param {string} digest
 * @returns {string}
 */
export function formulaId(digest) {
  return `${FORMULA_ID_PREFIX}${digest.slice(0, FORMULA_ID_LENGTH)}`;
}
