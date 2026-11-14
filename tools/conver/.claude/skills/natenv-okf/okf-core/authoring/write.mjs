/**
 * Deterministic concept writer.
 *
 * The frontmatter order is fixed so the same model produces the same bytes.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const KEY_ORDER = Object.freeze([
  'type', 'title', 'description', 'resource', 'tags', 'sources',
  'generated', 'verified', 'status', 'stale_after',
]);

export function writeConcept({ outDir, concept }) {
  const path = join(outDir, concept.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${renderConcept(concept)}\n`);
}

export function renderConcept(concept) {
  const frontmatter = renderFrontmatter(concept.frontmatter ?? {});
  return `---\n${frontmatter}\n---\n${concept.body ?? ''}`;
}

export function renderFrontmatter(frontmatter) {
  const keys = [
    ...KEY_ORDER.filter((key) => Object.hasOwn(frontmatter, key)),
    ...Object.keys(frontmatter).filter((key) => !KEY_ORDER.includes(key)).sort(),
  ];
  return keys.map((key) => `${key}: ${renderValue(frontmatter[key])}`).join('\n');
}

function renderValue(value) {
  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || typeof entry !== 'object')) {
      return `[${value.map((entry) => String(entry)).join(', ')}]`;
    }
    return `\n${value.map((entry) => renderObjectItem(entry)).join('\n')}`;
  }
  if (value && typeof value === 'object') {
    return `\n${Object.entries(value).map(([key, entry]) => `  ${key}: ${renderValue(entry)}`).join('\n')}`;
  }
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function renderObjectItem(entry) {
  return Object.entries(entry)
    .map(([key, value], index) => `${index === 0 ? '  - ' : '    '}${key}: ${renderValue(value)}`)
    .join('\n');
}
