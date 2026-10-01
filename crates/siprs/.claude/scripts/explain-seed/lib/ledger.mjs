/**
 * The ledger: what state each recorded point is in, read out of the two documents.
 *
 * The command document derives this on every read rather than storing it, because the
 * Invariant limits the files this command creates to the two documents. Each point of the
 * universe — the recorded open set together with the points the document adds — is exactly one
 * of three things — open (nothing names it), bound to a question (a question's bound-points
 * line names it), or settled (a pre-decided item carrying a ground names it) — and the three
 * sets are pairwise disjoint, so a point can neither vanish nor appear between two readings of
 * the same document and projection.
 *
 * This module reads a string and a projection and touches no file, so what it answers can be
 * tested against a fixture rather than against a workspace.
 */
import {
  HUMAN_ITEM_HEADING,
  PREDECIDED_ITEM_HEADING,
  questionNumberOf,
  splitItems,
} from './items.mjs';
import {
  GROUND_LABEL,
  HUMAN_SECTION_ID,
  PREDECIDED_SECTION_ID,
  boundPointIds,
  collectOpenItems,
  labelledValue,
  locateSections,
  mentionsId,
  readAddedPoints,
  readRoundNumbers,
} from './frame.mjs';

/**
 * The recorded points a question binds, read from its AI-only line.
 *
 * @param {{ questionBody: string }} input
 * @returns {Array<string>}
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function readBoundPointIds({ questionBody }) {
  return boundPointIds(questionBody);
}

/**
 * The questions a document asks, in order, with the points each one binds.
 *
 * A heading that names no question number is not a question this document asks: it is the
 * shape an earlier frame wrote, and it carries no `bound` the ledger could act on.
 *
 * @param {{ documentText: string }} input
 * @returns {Array<{ number: number|null, heading: string, body: string, boundIds: Array<string> }>}
 */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function readQuestions({ documentText }) {
  const located = locateSections(documentText);
  const body = located.bodies[HUMAN_SECTION_ID] ?? '';
  return splitItems(body, HUMAN_ITEM_HEADING).map((item) => ({
    ...item,
    number: questionNumberOf(item.heading),
    boundIds: boundPointIds(item.body),
  }));
}

/** The rounds a document opens, in order. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
export function readRounds({ documentText }) {
  return readRoundNumbers(documentText);
}

/**
 * The recorded points a pre-decided item carrying a ground names.
 *
 * A point is settled only when the item that names it carries a ground: an item with a
 * decision and no ground rests on nothing, and reading it as settled would report a point as
 * decided while the gate is still refusing the item that claims it.
 */
// [::TICKET::] PX-229, PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-229|PX-230) --for-spec --no-implementation-order`.
function readSettledPointIds({ documentText, universe }) {
  const located = locateSections(documentText);
  const body = located.bodies[PREDECIDED_SECTION_ID] ?? '';
  const settled = new Set();

  for (const item of splitItems(body, PREDECIDED_ITEM_HEADING)) {
    if (labelledValue(item.body, GROUND_LABEL) === null) continue;
    for (const id of universe) {
      if (mentionsId(`${item.heading}\n${item.body}`, id)) settled.add(id);
    }
  }
  return settled;
}

/**
 * The ids a point may be: the recorded open set together with the points this document adds.
 *
 * The two are disjoint by construction, because a reserved added id can never be a recorded
 * id, so the union is exact and every rule that ranges over the universe reads it here rather
 * than rebuilding the widening from the two sources each time.
 *
 * @param {{ projection: object, documentText: string }} input
 * @returns {Set<string>}
 */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
export function universeOf({ projection, documentText }) {
  return new Set([
    ...collectOpenItems(projection).map((item) => item.id),
    ...readAddedPoints({ documentText }).map((point) => point.id),
  ]);
}

/**
 * Partition the universe into open, bound and settled.
 *
 * The universe is the recorded open set together with the points the document adds, and the
 * three sets are disjoint with that universe as their exact sum: an id a question or a
 * pre-decision names that is neither recorded nor added is not a point of this projection, so
 * the gate reports it as a decision nothing recorded rather than the ledger inventing a point.
 * `unsettled` is `open` union `bound` — the points no answer has settled yet. `added` says
 * which ids came from the document rather than the manifests.
 *
 * @param {{ documentText: string, projection: object }} input
 * @returns {{ open: Set<string>, bound: Set<string>, settled: Set<string>, unsettled: Set<string>, added: Set<string>, questions: Array<object> }}
 */
// [::TICKET::] PX-229, PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-229|PX-230) --for-spec --no-implementation-order`.
export function deriveLedger({ documentText, projection }) {
  const recordedIds = new Set(collectOpenItems(projection).map((item) => item.id));
  const universe = universeOf({ projection, documentText });
  const added = new Set([...universe].filter((id) => !recordedIds.has(id)));
  const questions = readQuestions({ documentText });

  const boundToQuestion = new Set();
  for (const question of questions) {
    for (const id of question.boundIds) {
      if (universe.has(id)) boundToQuestion.add(id);
    }
  }

  const settled = readSettledPointIds({ documentText, universe });
  const bound = new Set([...boundToQuestion].filter((id) => !settled.has(id)));
  const open = new Set([...universe].filter((id) => !bound.has(id) && !settled.has(id)));

  return { open, bound, settled, unsettled: new Set([...open, ...bound]), questions, added };
}
