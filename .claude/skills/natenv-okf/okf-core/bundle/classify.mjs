/**
 * Classify a bundle-relative path without reading the file.
 */

export function classifyPath(path) {
  if (path === 'index.md' || path.endsWith('/index.md')) return 'reserved-index';
  if (path === 'log.md' || path.endsWith('/log.md')) return 'reserved-log';
  if (path.endsWith('.md')) return 'concept';
  return 'asset';
}
