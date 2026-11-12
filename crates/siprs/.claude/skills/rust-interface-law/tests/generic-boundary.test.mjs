import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../scripts/lib/redact.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const redaction = JSON.parse(readFileSync(join(root, 'source/redaction.sha256.json'), 'utf8'));
const forbidden = new Set(redaction.map((entry) => entry.sha256));

// @verifies C009
test('C009 skill tree has zero forbidden identifier', () => {
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const token of text.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []) {
      assert.ok(!forbidden.has(sha256(token.toLowerCase())), file + ': forbidden token');
    }
  }
});

// @verifies C009
test('C009 SKILL.md contains procedure and no rule text', () => {
  const text = readFileSync(join(root, 'SKILL.md'), 'utf8');
  assert.match(text, /## Procedure/);
  assert.doesNotMatch(text, /^## Rule/m);
});

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
