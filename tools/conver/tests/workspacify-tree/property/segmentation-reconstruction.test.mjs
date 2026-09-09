// @verifies C004
// [::TICKET::] PX-175: segmentation reconstruction property tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-175 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sha256Hex } from '../../../.claude/scripts/workspacify-tree/lib/hash.mjs';
import { buildHeadingTree } from '../../../.claude/scripts/workspacify-tree/lib/headings.mjs';
import { segmentAtHeadings, verifyReconstruction } from '../../../.claude/scripts/workspacify-tree/lib/segmentation.mjs';

// Deterministic PRNG (mulberry32) so the property test is reproducible.
function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWord(random) {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'status', 'value', 'node', 'proof', 'claim', 'record'];
  return words[Math.floor(random() * words.length)];
}

function generateMarkdown(random) {
  const lines = [];
  const headingCount = 1 + Math.floor(random() * 8);
  let previousLevel = 1;
  for (let i = 0; i < headingCount; i++) {
    // levels vary between 1 and 4, sometimes jumping to exercise warnings
    const level = 1 + Math.floor(random() * 4);
    if (i === 0) previousLevel = level;
    lines.push('#'.repeat(level) + ' ' + pickWord(random) + ' ' + i);
    const bodyLines = Math.floor(random() * 4);
    for (let b = 0; b < bodyLines; b++) {
      lines.push('Paragraph ' + pickWord(random) + ' ' + i + '-' + b + '.');
    }
    if (random() < 0.2) {
      lines.push('```');
      lines.push('# fenced hash must be ignored');
      lines.push('```');
    }
    previousLevel = level;
  }
  lines.push('');
  return lines.join('\n');
}

test('property: any generated markdown with a heading reconstructs exactly', () => {
  const random = createRandom(20260707);
  for (let run = 0; run < 80; run++) {
    const sourceText = generateMarkdown(random);
    const sourceBytes = Buffer.from(sourceText, 'utf8');
    const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
    assert.ok(headings.length > 0, 'generator always emits at least one heading');
    const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
    const result = verifyReconstruction({ sourceBytes, sourceHash: sha256Hex(sourceBytes), segments });
    assert.equal(result.status, 'PASS', 'run ' + run + ' must reconstruct');
    assert.equal(result.exactMatch, true);
    assert.equal(result.reconstructedHash, sha256Hex(sourceBytes));
  }
});

test('property: documents without a level-2 heading still cover the whole input', () => {
  const random = createRandom(99);
  for (let run = 0; run < 40; run++) {
    const sourceText = '# Only H1\n' + 'body ' + run + '\n';
    const sourceBytes = Buffer.from(sourceText, 'utf8');
    const headings = buildHeadingTree(sourceText.split('\n'), undefined, { sourceText });
    const { segments } = segmentAtHeadings({ sourceText, headings }, { segmentLevel: 2 });
    const result = verifyReconstruction({ sourceBytes, sourceHash: sha256Hex(sourceBytes), segments });
    assert.equal(result.status, 'PASS', 'no level-2 doc must reconstruct');
  }
});
