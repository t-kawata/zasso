// [::TICKET::] PX-424 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-424 --for-spec --no-implementation-order`.
// @verifies C003
// @verifies C011
/**
 * One place for the numeric boundaries the engine and verifier share.
 */

export const MAX_ANSWER_NODES = 20;
export const NODE_BUDGET = 2500;
export const MAX_TOPICS = 64;
export const MAX_CONFLICT_DEPTH = 3;
export const MAX_QUERY_LENGTH = 512;
export const TOPIC_MATCH_WEIGHT = 6;
export const SUMMARY_MATCH_WEIGHT = 3;
export const ID_MATCH_WEIGHT = 1;
export const SPEC_VERSION = '0.1.0';
