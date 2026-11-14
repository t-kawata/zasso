import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../okf-core/index.mjs';
import { conceptBody } from '../okf-core/context/assemble.mjs';

const skillFile = (relativePath) => fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function parseManifest(text) {
  const files = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '[[file]]') {
      current = {};
      files.push(current);
      continue;
    }
    const assignment = line.match(/^([a-z_][a-z0-9_]*)\s*=\s*"([^"]*)"$/);
    if (assignment && current) current[assignment[1]] = assignment[2];
  }
  return files;
}

function parseSpan(value) {
  const match = String(value).match(/^(\d+)-(\d+)$/);
  assert.ok(match, `span: ${value}`);
  return [Number(match[1]), Number(match[2])];
}

test('the baseline matches the manifest hash', () => {
  const baseline = readFileSync(skillFile('source/source.baseline.md'), 'utf8');
  const manifest = parseManifest(readFileSync(skillFile('source/manifest.toml'), 'utf8'));
  assert.equal(manifest.length, 1);
  assert.equal(sha256(baseline.replace(/\r\n?/g, '\n')), manifest[0].sha256);
  assert.equal(manifest[0].path, 'sources/implementation-handbook.md');
});

test('concept spans partition every source line exactly once', async () => {
  const baseline = readFileSync(skillFile('source/source.baseline.md'), 'utf8').replace(/\r\n?/g, '\n');
  const lines = baseline.endsWith('\n') ? baseline.slice(0, -1).split('\n') : baseline.split('\n');
  const bundle = await loadBundle(fileURLToPath(new URL('../okf', import.meta.url)));
  const covered = new Array(lines.length + 1).fill(0);
  for (const concept of bundle.concepts) {
    const [start, end] = parseSpan(concept.frontmatter['x-source-span']);
    assert.ok(start >= 1 && end <= lines.length, `${concept.id} span ${start}-${end}`);
    for (let line = start; line <= end; line += 1) covered[line] += 1;
  }
  for (let line = 1; line <= lines.length; line += 1) {
    if (lines[line - 1].trim() === '') continue;
    assert.equal(covered[line], 1, `line ${line} is owned by ${covered[line]} concepts`);
  }
});

test('each concept body starts at its source heading and its span is truthful', async () => {
  const baseline = readFileSync(skillFile('source/source.baseline.md'), 'utf8').replace(/\r\n?/g, '\n');
  const lines = baseline.endsWith('\n') ? baseline.slice(0, -1).split('\n') : baseline.split('\n');
  const bundle = await loadBundle(fileURLToPath(new URL('../okf', import.meta.url)));
  for (const concept of bundle.concepts) {
    const [start] = parseSpan(concept.frontmatter['x-source-span']);
    const headingLine = lines[start - 1].trim();
    assert.match(headingLine, /^#{1,2}\s/, concept.id);
    assert.equal(headingLine.replace(/^#{1,2}\s+/, ''), concept.title, concept.id);
    assert.ok(conceptBody(concept).startsWith(headingLine), concept.id);
  }
});

test('the content hash covers the emitted body', async () => {
  const bundle = await loadBundle(fileURLToPath(new URL('../okf', import.meta.url)));
  for (const concept of bundle.concepts) {
    assert.equal(sha256(conceptBody(concept)), concept.frontmatter['x-content-sha256'], concept.id);
  }
});
