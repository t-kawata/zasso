// [::TICKET::] PX-428 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-428 --for-spec --no-implementation-order`.
// [::TICKET::] PX-427 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-427 --for-spec --no-implementation-order`.
// [::TICKET::] PX-426 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-426 --for-spec --no-implementation-order`.
// [::TICKET::] PX-425 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-425 --for-spec --no-implementation-order`.
/**
 * The engine's public surface.
 */

export {
  loadBundle,
  getConcept,
  getOutgoing,
  getIncoming,
  getDependents,
  listDirectory,
} from './adapters/okforest.mjs';
export { buildTraversal, unknownConcept, candidateIds } from './commands/traverse.mjs';
export { loadProfile, listProfiles } from './profiles/index.mjs';
export { resolveReference } from './paths/resolve.mjs';
export { resolveRequired } from './context/resolve-required.mjs';
export { buildContext } from './context/assemble.mjs';
export { validateConformance } from './validation/conformance.mjs';
export { lintBundle } from './validation/lint.mjs';
export { checkProfile } from './validation/profile.mjs';
export { classifyPath } from './bundle/classify.mjs';
export { scanBundle } from './bundle/scan.mjs';
