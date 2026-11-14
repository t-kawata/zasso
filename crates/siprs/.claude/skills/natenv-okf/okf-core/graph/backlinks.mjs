/**
 * Incoming links are the library's backlink index.
 */

import { getIncoming } from '../adapters/okforest.mjs';

export function backlinks(bundle, id) {
  return getIncoming(bundle, id);
}
