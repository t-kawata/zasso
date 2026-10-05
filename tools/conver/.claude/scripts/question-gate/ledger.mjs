/**
 * The ledger: what state each point is in.
 *
 * Every point of the universe — the points a run records together with the points
 * the document adds — is exactly one of three things: open (nothing names it),
 * bound to a question (a question's bound-points line names it), or settled (a
 * pre-decision carrying a ground names it). The three sets are pairwise disjoint
 * and sum exactly to the universe, so a point can neither vanish nor appear
 * between two readings of the same inputs.
 *
 * This module takes plain data and touches no file. That is what lets one ledger
 * serve both commands: a grill's state lives in its design tree and a drill's in
 * its session document, and neither shape reaches this file.
 */

/**
 * A pre-decision settles the points it names only when it carries a ground.
 *
 * An item with a decision and no ground rests on nothing; reading it as settled
 * would report a point as decided while the gate is still refusing the item that
 * claims it.
 *
 * @param {{ ground?: string }} item
 * @returns {boolean}
 */
// [::TICKET::] PX-233, PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-233|PX-234) --for-spec --no-implementation-order`.
function carriesGround(item) {
  return typeof item.ground === 'string' && item.ground.trim() !== '';
}

/**
 * Every id a point may be: the recorded points together with the added ones.
 *
 * The two are disjoint by construction, because a reserved added id (added-NNN)
 * can never be a recorded id, so the union is exact.
 *
 * @param {{ points?: string[], addedPoints?: string[] }} input
 * @returns {Set<string>}
 */
export function universeOf({ points = [], addedPoints = [] }) {
  return new Set([...points, ...addedPoints]);
}

/**
 * Partition the universe into open, bound and settled.
 *
 * An id a question or a pre-decision names that is neither recorded nor added is
 * not a point of this run: it is reported by the gate as a decision nothing
 * recorded, rather than being invented into the universe here.
 *
 * @param {{
 *   points?: string[],
 *   questions?: Array<{ number: number, boundIds: string[] }>,
 *   preDecided?: Array<{ ids: string[], decision: string, ground: string, override: string }>,
 *   addedPoints?: string[],
 * }} input
 * @returns {{ open: Set<string>, bound: Set<string>, settled: Set<string>, unsettled: Set<string>, added: Set<string> }}
 */
export function partitionPoints({ points = [], questions = [], preDecided = [], addedPoints = [] }) {
  const universe = universeOf({ points, addedPoints });
  const recorded = new Set(points);
  const added = new Set([...universe].filter((id) => !recorded.has(id)));

  const settled = new Set();
  for (const item of preDecided) {
    if (!carriesGround(item)) continue;
    for (const id of item.ids ?? []) {
      if (universe.has(id)) settled.add(id);
    }
  }

  const namedByQuestion = new Set();
  for (const question of questions) {
    for (const id of question.boundIds ?? []) {
      if (universe.has(id)) namedByQuestion.add(id);
    }
  }

  // A point a ground settles is settled even when a question also names it, which
  // is why the settled set is subtracted here rather than the reverse.
  const bound = new Set([...namedByQuestion].filter((id) => !settled.has(id)));
  const open = new Set([...universe].filter((id) => !bound.has(id) && !settled.has(id)));

  return { open, bound, settled, unsettled: new Set([...open, ...bound]), added };
}
