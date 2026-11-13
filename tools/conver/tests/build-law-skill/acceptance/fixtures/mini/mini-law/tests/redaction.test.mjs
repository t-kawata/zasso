import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../scripts/lib/redact.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const map = JSON.parse(readFileSync(join(root, 'source/redaction.sha256.json'), 'utf8'));
const forbidden = new Set(map.map((entry) => entry.sha256));
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'target') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
test('map is hash-only and the tree has no forbidden token', () => {
  assert.ok(Array.isArray(map));
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const token of text.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []) {
      assert.ok(!forbidden.has(sha256(token.toLowerCase())), file);
    }
  }
});
