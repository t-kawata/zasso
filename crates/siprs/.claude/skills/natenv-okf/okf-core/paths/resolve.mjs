/**
 * Resolve an arbitrary target through the same link parser the bundle uses.
 *
 * A synthetic one-link document plus the existing file paths gives the library
 * enough context to mark existence, directory, outside-root, and concept.
 */

import { parseTree } from '../vendor/okforest.mjs';
import { mapLinkToEdge } from '../graph/build.mjs';

export function resolveReference({ fromPath, rawTarget, files = [] }) {
  if (isEncodedTraversal(rawTarget)) {
    return { fromPath, rawTarget, resolvedPath: null, to: null, state: 'blocked' };
  }
  const others = files
    .filter((path) => path !== fromPath)
    .map((path) => ({ path }));
  const sourcePath = fromPath.endsWith('.md') ? fromPath : `${fromPath}.md`;
  const tree = parseTree([
    ...others,
    { path: sourcePath, text: `---\ntype: Concept\n---\n[x](${rawTarget})\n` },
  ]);
  const concept = tree.concepts.find((entry) => entry.path === sourcePath);
  const link = concept?.links[0];
  if (!link) {
    return { fromPath: sourcePath, rawTarget, resolvedPath: null, to: null, state: 'missing' };
  }
  return mapLinkToEdge(link);
}

function isEncodedTraversal(rawTarget) {
  const text = String(rawTarget ?? '');
  if (/%2e/i.test(text) && /%2f|%5c/i.test(text)) return true;
  try {
    const decoded = decodeURIComponent(text);
    return decoded !== text && /(^|\/)\.\.(\/|$)/.test(decoded);
  } catch {
    return false;
  }
}
