// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * Formula identity: one normalization rule for every consumer.
 *
 * The digest answers "is this the same formula?" and nothing else. Delimiters,
 * whitespace, grouping braces and spacing commands are presentation; symbols,
 * coefficients and operators are content. Removing presentation is therefore the
 * whole rule, and it is deliberately small enough to be read and tested in one place.
 */

/** Spacing commands that carry no symbol, coefficient or operator. */
const SPACING_COMMANDS = ['\\qquad', '\\quad', '\\,', '\\;', '\\:', '\\!', '~'];

/** Sizing commands that change rendering, not the formula. */
const SIZING_COMMANDS = ['\\left', '\\right'];

/**
 * Normalize a formula body to the token sequence its digest is taken over.
 *
 * @param {string} body
 * @returns {string}
 */
export function normalizeFormula(body) {
  let normalized = String(body);

  for (const command of SIZING_COMMANDS) {
    normalized = normalized.split(command).join('');
  }
  for (const command of SPACING_COMMANDS) {
    normalized = normalized.split(command).join('');
  }

  return normalized.replace(/[{}\s]/g, '');
}
