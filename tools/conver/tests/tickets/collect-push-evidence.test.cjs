const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractTitle,
  extractSummary,
  derivePrefix,
  selectDateCandidates,
  chooseMode,
} = require('../../.claude/scripts/tickets/collect-push-evidence.js');

test('extractTitle reads the keyed heading, not the preamble H1', () => {
  const text = [
    '# Implementation Order',
    '',
    '### Goal',
    'Do the thing.',
    '',
    '# Target ticket is PX-452: Fix the audit',
    '',
  ].join('\n');
  assert.equal(extractTitle(text), 'Fix the audit');
  assert.equal(extractTitle('# P27-1: find-omissions resumes\n'), 'find-omissions resumes');
  assert.equal(extractTitle('# Implementation Order\n### Goal\nNormalize paths.\n'), '');
});

test('extractSummary returns Goal until Purpose, else Background', () => {
  assert.equal(extractSummary('### Goal\nDo X.\n\n### Purpose\nWhy.\n'), 'Do X.');
  assert.equal(extractSummary('## Goal\nDo Y.\n## Scope\n...\n'), 'Do Y.');
  assert.equal(extractSummary('## Background\nContext.\n\n## Scope\n...\n'), 'Context.');
});

test('derivePrefix maps the leading verb', () => {
  assert.equal(derivePrefix('Fix every finding'), 'fix');
  assert.equal(derivePrefix('Implement the loop'), 'feat');
  assert.equal(derivePrefix('Refactor the parser'), 'refactor');
  assert.equal(derivePrefix('Normalize every path'), 'refactor');
  assert.equal(derivePrefix('Document the API'), 'docs');
  assert.equal(derivePrefix('find-omissions resumes'), 'chore');
});

test('selectDateCandidates keeps the window and returns newest 3', () => {
  const now = 1_000_000;
  const entries = [
    { path: 'a', mtime: now - 10 },
    { path: 'b', mtime: now - 20 },
    { path: 'c', mtime: now - 30 },
    { path: 'd', mtime: now - 40 },
    { path: 'old', mtime: now - 604_801 },
  ];
  assert.deepEqual(selectDateCandidates(entries, now - 25, now), ['a', 'b', 'c']);
  assert.deepEqual(selectDateCandidates([{ path: 'x', mtime: now - 100 }], now - 200, now), ['x']);
});

test('chooseMode prefers exact, then a single date candidate, else diff', () => {
  assert.deepEqual(chooseMode(['s'], []), { mode: 'exact', selected: ['s'] });
  assert.deepEqual(chooseMode([], ['s']), { mode: 'date-inferred', selected: ['s'] });
  assert.deepEqual(chooseMode([], ['a', 'b']), { mode: 'diff', selected: [] });
  assert.deepEqual(chooseMode([], []), { mode: 'diff', selected: [] });
});
