import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { redactText, sha256, isRedactedMap } from '../scripts/lib/redact.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const map = [{ sha256: sha256('sampleproject'), placeholder: '<project-a>' }];

test('redacts whole token only', () => {
  assert.equal(redactText('sampleproject login', map), '<project-a> login');
  assert.equal(redactText('sampleprojectx login', map), 'sampleprojectx login');
});

test('redacts every occurrence', () => {
  assert.equal(redactText('sampleproject sampleproject', map), '<project-a> <project-a>');
});

test('map has only sha256 and placeholder', () => {
  assert.equal(isRedactedMap(map), true);
  assert.equal(isRedactedMap([{ sha256: sha256('x'), placeholder: '<p>', name: 'x' }]), false);
  assert.equal(isRedactedMap([{ sha256: 'nope', placeholder: '<p>' }]), false);
});

test('real redaction map has no literal identifier', () => {
  const real = JSON.parse(readFileSync(join(root, 'source/redaction.sha256.json'), 'utf8'));
  assert.equal(isRedactedMap(real), true);
  assert.equal(real.length, 4);
  for (const entry of real) {
    assert.match(entry.placeholder, /^<[a-z][a-z0-9-]*>$/);
  }
});

// @verifies C008
test('skill tree has no forbidden token', () => {
  const forbidden = new Set(
    JSON.parse(readFileSync(join(root, 'source/redaction.sha256.json'), 'utf8')).map((e) => e.sha256),
  );
  for (const file of walk(root)) {
    const text = readFileSync(file, 'utf8');
    for (const token of text.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []) {
      assert.ok(!forbidden.has(sha256(token.toLowerCase())), file + ': forbidden token');
    }
  }
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
