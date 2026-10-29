/**
 * One digest per input, so a re-run can say whether the measured world moved.
 *
 * The calibration cannot be asserted against the live workspace in CI, so the next best
 * guarantee is that a run says what it read: a digest that is a function of the inputs
 * and of nothing else turns "the numbers changed" into "these inputs changed". A digest
 * that moved when nothing moved would cry wolf, and one that stayed put when an input
 * moved would present a stale measurement as current.
 */
import { sha256Hex } from '../../workspacify-tree/lib/hash.mjs';

/**
 * The canonical JSON of a value: object keys sorted, arrays left in order.
 *
 * Sorting is what makes the digest a function of the value rather than of the order a
 * writer happened to emit its keys in. Two documents that differ only in key order are
 * the same document, and a digest that disagreed would report a drift that did not happen.
 *
 * @param {unknown} value
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/**
 * The lowercase hex SHA-256 of a value's canonical JSON.
 *
 * @param {unknown} value
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function digestValue(value) {
  return sha256Hex(canonicalJson(value));
}

/**
 * One digest over the three inputs together.
 *
 * @param {{ artifact: unknown, treeManifest: unknown, allocateManifest: unknown }} triple
 * @returns {string}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function digestSequenceTriple({ artifact, treeManifest, allocateManifest }) {
  return digestValue({ artifact, treeManifest, allocateManifest });
}

/**
 * One digest per input, so a run can name which of them moved.
 *
 * @param {{ artifact: unknown, treeManifest: unknown, allocateManifest: unknown }} triple
 * @returns {{ artifact: string, treeManifest: string, allocateManifest: string }}
 */
// [::TICKET::] PX-255 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-255 --for-spec --no-implementation-order`.
export function digestSnapshot({ artifact, treeManifest, allocateManifest }) {
  return {
    artifact: digestValue(artifact),
    treeManifest: digestValue(treeManifest),
    allocateManifest: digestValue(allocateManifest),
  };
}
