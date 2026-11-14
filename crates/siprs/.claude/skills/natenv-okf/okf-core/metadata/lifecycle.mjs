/**
 * Freshness and lifecycle. The clock is always supplied by the caller.
 */

import { isStaleAt } from '../vendor/okforest.mjs';

export function isStale(metadata, now = new Date()) {
  if (!metadata) return false;
  if (metadata.status === 'deprecated') return true;
  return isStaleAt(metadata.stale_after ?? metadata.staleAfter, now);
}

export function isDeprecated(metadata) {
  return metadata?.status === 'deprecated';
}
