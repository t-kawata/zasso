// [::TICKET::] PX-293 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-293 --for-spec --no-implementation-order`.
// [::TICKET::] PX-292 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-292 --for-spec --no-implementation-order`.
/**
 * The reader identity a generation's records carry.
 *
 * A reader names the pipeline and the generation that read, never a ticket. A ticket key
 * in a live record says who filed the work, not who performed the reading, and it makes
 * the provenance depend on a project's bookkeeping rather than on the run.
 */

/** The reader that answers a generation's worklist. */
export function readerForGeneration({ generation } = {}, pipeline = 'educe-sequences') {
  const number = Number.isInteger(generation) ? generation : 0;
  return `${pipeline}/generation-${number}`;
}

/** The reader that attacks a generation's judgments. */
export function attackReaderForGeneration({ generation } = {}, pipeline = 'educe-sequences') {
  return `${readerForGeneration({ generation }, pipeline)}/attack`;
}
