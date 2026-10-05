// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * Numbering and the end of the loop.
 *
 * A number a question was asked under never moves, so a reply always names its
 * question and a later round continues from the highest number the document holds
 * rather than filling a gap an earlier round left.
 *
 * A refusal because nothing is open is a normal end rather than a failure: that is
 * the shape a run takes when the records grounded every point, which is the outcome
 * this mechanism exists to make reachable. The round cap is the other refusal, and
 * it is reported rather than silently stopping — a run that stopped without saying
 * why would read as a run that finished.
 */

/** The most rounds a grill opens before it must settle or report what is left. */
export const MAX_ROUNDS = 5;

const NO_OPEN_POINT_REASON = 'no point is open';

/**
 * Whether a round may still be opened.
 *
 * @param {{ roundsUsed?: number, maxRounds?: number }} input
 * @returns {boolean}
 */
export function withinRoundCap({ roundsUsed = 0, maxRounds = MAX_ROUNDS }) {
  return roundsUsed < maxRounds;
}

/**
 * The numbers the next round's questions take, or why no round is opened.
 *
 * @param {{
 *   existingNumbers?: number[],
 *   n: number,
 *   openCount?: number,
 *   roundsUsed?: number,
 * }} input
 * @returns {{ ok: true, numbers: number[] } | { ok: false, reason: string }}
 */
export function nextNumbers({ existingNumbers = [], n, openCount = 0, roundsUsed = 0 }) {
  if (openCount === 0) return { ok: false, reason: NO_OPEN_POINT_REASON };
  if (!withinRoundCap({ roundsUsed })) {
    return { ok: false, reason: `round limit of ${MAX_ROUNDS} reached` };
  }

  const highest = existingNumbers.length === 0 ? 0 : Math.max(...existingNumbers);
  return { ok: true, numbers: Array.from({ length: n }, (_, offset) => highest + offset + 1) };
}
