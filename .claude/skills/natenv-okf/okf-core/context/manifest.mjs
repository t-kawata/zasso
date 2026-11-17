/**
 * Context manifests are deterministic hashes of the delivered concepts.
 */

import { createHash } from 'node:crypto';

export function buildManifest(concepts) {
  const ids = concepts.map((concept) => concept.id);
  const hashes = concepts.map((concept) => [concept.id, hash(concept.body)]);
  return {
    ids,
    hashes,
    sha256: hash(JSON.stringify(hashes)),
  };
}

function hash(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}
