/**
 * Bundle scan is the library read plus the engine's classification.
 */

import { loadBundle } from '../adapters/okforest.mjs';
import { classifyPath } from './classify.mjs';

export async function scanBundle(root) {
  const bundle = await loadBundle(root);
  const entries = bundle.files.map((path) => ({ path, kind: classifyPath(path) }));
  return { bundle, entries, diagnostics: bundle.diagnostics };
}
