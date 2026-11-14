/**
 * Markdown parsing is delegated to @okforest/okf.
 *
 * The library returns mdast links, footnote references, and code blocks. A
 * link written inside a fenced code block is a code node, not a link node.
 */

import { parseTree } from '../vendor/okforest.mjs';

export function parseMarkdown(body) {
  const tree = parseTree([{ path: 'concept.md', text: `---\ntype: Concept\n---\n${String(body ?? '')}` }]);
  const file = tree.concepts[0];
  return {
    ast: file?.ast ?? null,
    links: file?.links ?? [],
    footnotes: file?.footnotes ?? [],
    codeBlocks: file?.codeBlocks ?? [],
  };
}
