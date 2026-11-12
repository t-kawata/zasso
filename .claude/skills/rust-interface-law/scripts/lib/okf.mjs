import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function parseFrontmatter(text) {
  const normalized = String(text).replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return { data: {}, body: normalized };

  const data = {};
  for (const raw of normalized.slice(4, end).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    data[line.slice(0, colon).trim()] = parseValue(line.slice(colon + 1).trim());
  }
  return { data, body: normalized.slice(end + 5) };
}

export function loadOkf(dir) {
  const nodesDir = join(dir, 'nodes');
  return readdirSync(nodesDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(nodesDir, file), 'utf8');
      const { data, body } = parseFrontmatter(text);
      return { ...data, body, file: join(nodesDir, file) };
    });
}

function parseValue(value) {
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
