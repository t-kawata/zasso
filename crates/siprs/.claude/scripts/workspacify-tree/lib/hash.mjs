// [::TICKET::] PX-175 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`.
/**
 * SHA-256 helper over bytes. The design fixes SHA-256 (lowercase hex) as the
 * only content hash so no extra dependency is needed and results are
 * reproducible on any Node runtime.
 */
import { createHash } from 'node:crypto';

/**
 * Compute the lowercase hex SHA-256 of bytes (or a UTF-8 string).
 *
 * @param {Uint8Array|Buffer|string} input - bytes to hash; strings are UTF-8 encoded
 * @returns {string} 64-character lowercase hex digest
 */
export function sha256Hex(input) {
  const data = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return createHash('sha256').update(data).digest('hex');
}
