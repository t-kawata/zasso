/**
 * The API-consistency surface, exported as one module.
 *
 * The parser and the verifier are separate programs because one reads a document and the
 * other decides a workspace; this index is the seam a caller imports when it wants both.
 */
export { parseRustSurface } from './parse-rust-surface.mjs';
// [::TICKET::] PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-369 --for-spec --no-implementation-order`.
export {
  FINDING_CODES,
  dependencyPairs,
  packagesOf,
  verifyApiConsistency,
} from './verify-api-consistency.mjs';
