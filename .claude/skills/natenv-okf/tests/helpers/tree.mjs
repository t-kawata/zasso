/**
 * Synthetic OKF trees for the generated skill's tests.
 *
 * Tests build trees in the OS temp directory so the committed fixtures stay
 * free of foreign source formats and every case states its own input.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function makeTree(files) {
  const root = mkdtempSync(join(tmpdir(), 'okf-tree-'));
  for (const [relativePath, text] of Object.entries(files)) {
    const absolute = join(root, relativePath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text);
  }
  return root;
}

export function removeTree(root) {
  rmSync(root, { recursive: true, force: true });
}

/**
 * Render one concept file. `extra` carries additional frontmatter keys so a
 * test names only the key it exercises.
 */
export function pageText({ type = 'Page', title = 'Page', body = '', extra = {} } = {}) {
  const lines = [`type: ${type}`, `title: ${JSON.stringify(title)}`];
  for (const [key, value] of Object.entries(extra)) {
    lines.push(`${key}: ${renderValue(value)}`);
  }
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

function renderValue(value) {
  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || typeof entry !== 'object')) {
      return `[${value.map((entry) => String(entry)).join(', ')}]`;
    }
    return `\n${value.map(renderItem).join('\n')}`;
  }
  if (value && typeof value === 'object') {
    return `\n${Object.entries(value).map(([key, entry]) => `  ${key}: ${renderValue(entry)}`).join('\n')}`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function renderItem(entry) {
  return Object.entries(entry)
    .map(([key, value], index) => `${index === 0 ? '  - ' : '    '}${key}: ${renderValue(value)}`)
    .join('\n');
}

export const INDEX_TEXT = '# Knowledge\n\n- [A](./a.md)\n';
export const LOG_TEXT = '# Knowledge Log\n\n## 2026-01-01\n- Built one page.\n';
