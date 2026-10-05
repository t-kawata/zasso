/**
 * Bundling: the fewest axes one answer each settles every bound point.
 *
 * A question that binds a single point is a point-question wearing a question's
 * clothes — the AI could have settled it or it is not yet understood — so the
 * floor is two points to an axis. The cap keeps a round short enough that the
 * human reads it, and what does not fit stays open for a later round rather than
 * being dropped or folded into an axis it would weaken.
 */

/** An axis binds at least this many points, unless fewer points than this are open. */
export const MAX_POINTS_PER_AXIS_FLOOR = 2;

/** A round opens at most this many axes. */
export const MAX_AXES_PER_ROUND = 3;

/**
 * The floor for this round: a lone open point is not stranded by a rule written
 * for the normal case.
 *
 * @param {number} openCount
 * @returns {number}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function floorFor(openCount) {
  return openCount < MAX_POINTS_PER_AXIS_FLOOR ? 1 : MAX_POINTS_PER_AXIS_FLOOR;
}

/**
 * Open the axes this round asks, and leave the rest of the points open.
 *
 * A candidate that shares a point with an axis already opened cannot be opened
 * too: two answers would both claim to settle that point and neither would be the
 * one that did. Such a candidate's remaining points stay open.
 *
 * @param {{
 *   candidates?: Array<{ boundIds: string[], direction: string }>,
 *   openCount?: number,
 *   maxAxes?: number,
 * }} input
 * @returns {{ axes: Array<{ boundIds: string[], direction: string }>, overflow: string[] }}
 */
export function bundleAxes({ candidates = [], openCount = 0, maxAxes = MAX_AXES_PER_ROUND }) {
  const floor = floorFor(openCount);
  const bound = new Set();
  const axes = [];
  const overflow = [];

  for (const candidate of candidates) {
    const fresh = candidate.boundIds.filter((id) => !bound.has(id));
    const intact = fresh.length === candidate.boundIds.length;

    if (axes.length < maxAxes && fresh.length >= floor && intact) {
      axes.push({ boundIds: [...candidate.boundIds], direction: candidate.direction });
      for (const id of candidate.boundIds) bound.add(id);
      continue;
    }

    overflow.push(...fresh);
  }

  return { axes, overflow };
}
