import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../okf-core/parsing/markdown.mjs';

test('finds a body link', () => {
  const parsed = parseMarkdown('# H\n\n[go](./other.md)\n');
  assert.equal(parsed.links.length, 1);
  assert.equal(parsed.links[0].target, './other.md');
});

test('does not treat a link inside a fence as an edge', () => {
  const parsed = parseMarkdown('```\n[go](./other.md)\n```\n');
  assert.equal(parsed.links.length, 0);
  assert.equal(parsed.codeBlocks.length, 1);
});

test('reads a footnote reference by label', () => {
  const parsed = parseMarkdown('Claim.[^s1]\n\n[^s1]: Source\n');
  assert.deepEqual(parsed.footnotes.map((footnote) => footnote.label), ['s1']);
});

test('a footnote definition without a reference is not a citation', () => {
  const parsed = parseMarkdown('[^s1]: Source only\n');
  assert.equal(parsed.footnotes.length, 0);
});
