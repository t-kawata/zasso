'use strict';

/**
 * Unit tests for deterministic Markdown rendering.
 *
 * Covers C008 (pure function of JSON) and C009 (complete JSON, capped Markdown).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { makeCandidates } = require('./fixtures.cjs');

const render = require(path.join(
  __dirname,
  '..',
  '..',
  '.claude',
  'scripts',
  'pickup-conver-update-candidates',
  'render.js'
));

// [::TICKET::] PX-457 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-457 --for-spec --no-implementation-order`.
function makeLedger(candidates) {
  return {
    schemaVersion: 1,
    criteriaVersion: '1.0.0',
    workspace: '/tmp/workspace',
    claudeDir: '/tmp/workspace/.claude',
    upstreamRef: 'origin/main',
    generatedAt: '2026-11-27T00:00:00.000Z',
    candidates,
  };
}

test('C008 render is a pure function of the ledger', () => {
  const ledger = makeLedger(makeCandidates(3));
  const first = render.renderMarkdown(ledger);
  const second = render.renderMarkdown(ledger);
  assert.equal(first, second);
  assert.ok(first.includes('CONVER-UPDATE-CANDIDATES.json'));
  assert.ok(first.includes('criteriaVersion: 1.0.0'));
});

test('C008 the output does not depend on wall-clock time', () => {
  const ledger = makeLedger(makeCandidates(1));
  const first = render.renderMarkdown(ledger);
  const second = render.renderMarkdown(JSON.parse(JSON.stringify(ledger)));
  assert.equal(first, second);
});

test('C009 JSON keeps every candidate while Markdown caps the visible list', () => {
  const ledger = makeLedger(makeCandidates(55));
  const markdown = render.renderMarkdown(ledger);
  assert.equal(ledger.candidates.length, 55);
  assert.equal((markdown.match(/^### CUC-/gm) || []).length, 50);
  assert.ok(markdown.includes('…and 5 more candidates'));
});

test('candidates are sorted by impact then id', () => {
  const ledger = makeLedger([
    { ...makeCandidates(1)[0], id: 'CUC-0002', impact: 'low' },
    { ...makeCandidates(1)[0], id: 'CUC-0003', impact: 'high' },
    { ...makeCandidates(1)[0], id: 'CUC-0001', impact: 'high' },
  ]);
  const markdown = render.renderMarkdown(ledger);
  const order = [...markdown.matchAll(/^### (CUC-\d+)/gm)].map((match) => match[1]);
  assert.deepEqual(order, ['CUC-0001', 'CUC-0003', 'CUC-0002']);
});

test('each candidate section carries the five completeness headings and a patch fence', () => {
  const ledger = makeLedger(makeCandidates(1));
  const markdown = render.renderMarkdown(ledger);
  for (const label of ['Symptom:', 'Remedy:', 'Generality:', 'Risk:', 'Verification:']) {
    assert.ok(markdown.includes(label), label);
  }
  assert.ok(markdown.includes('```diff'));
  assert.ok(markdown.includes('+new1'));
});

test('the summary table counts candidates by primary criterion', () => {
  const ledger = makeLedger([
    { ...makeCandidates(1)[0], id: 'CUC-0001', primaryCriterion: 'safety' },
    { ...makeCandidates(1)[0], id: 'CUC-0002', primaryCriterion: 'safety' },
    { ...makeCandidates(1)[0], id: 'CUC-0003', primaryCriterion: 'correctness' },
  ]);
  const markdown = render.renderMarkdown(ledger);
  assert.ok(markdown.includes('| safety | 2 |'));
  assert.ok(markdown.includes('| correctness | 1 |'));
});

test('a patch containing a backtick run is fenced with a longer run', () => {
  const [candidate] = makeCandidates(1);
  const ledger = makeLedger([
    { ...candidate, evidence: { ...candidate.evidence, patch: '@@ -1 +1 @@\n-```\n+ok' } },
  ]);
  assert.ok(render.renderMarkdown(ledger).includes('````diff'));
});
