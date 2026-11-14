/**
 * Trust tiers are the OKF library's derivation, not a second vocabulary.
 */

import { deriveTrustTier as deriveFromLibrary } from '../vendor/okforest.mjs';

export function deriveTrustTier(verified) {
  if (!verified) return 'unverified';
  const events = Array.isArray(verified) ? verified : [verified];
  const usable = events.filter((event) => event && typeof event.by === 'string' && event.by.length > 0);
  return deriveFromLibrary(usable);
}
