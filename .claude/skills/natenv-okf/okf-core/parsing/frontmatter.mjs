/**
 * Frontmatter parsing is delegated to @okforest/okf.
 *
 * The library uses yaml.parseDocument with uniqueKeys, so a duplicate key is a
 * diagnostic rather than a silent last-wins overwrite.
 */

import { parseTree } from '../vendor/okforest.mjs';

export function parseFrontmatter(text) {
  const tree = parseTree([{ path: 'concept.md', text: String(text ?? '') }]);
  const file = tree.concepts[0] ?? tree.reserved[0];
  if (!file || !file.hasFrontmatter) {
    return { data: {}, errors: [{ code: 'FRONTMATTER_MISSING', message: 'frontmatter block is absent' }] };
  }
  if (file.frontmatterError) {
    const message = /unique|duplicate/i.test(file.frontmatterError.message)
      ? `duplicate key: ${file.frontmatterError.message}`
      : file.frontmatterError.message;
    return {
      data: file.frontmatter ?? {},
      errors: [{
        code: 'FRONTMATTER_INVALID',
        message,
        line: file.frontmatterError.line,
        column: file.frontmatterError.column,
      }],
    };
  }
  const data = file.frontmatter ?? {};
  if (typeof data.type !== 'string' || data.type.trim().length === 0) {
    return { data, errors: [{ code: 'TYPE_EMPTY', message: 'type must be a non-empty string' }] };
  }
  return { data, errors: [] };
}
