// PX-383 @verifies C004
// A census is a project document with an authored selector. The producer and the
// consumer must accept the same shape set and yield the same members; an unknown or
// unreadable shape is a named refusal, not a silent empty census.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { extractMembers } from '../../.claude/scripts/educe-sequences/rail/pins.mjs';
import { readPinnedCensus } from '../../.claude/scripts/shared-obligations/source-census.mjs';

const SUPPLIED_DIRECTORY = join('educe-sequences', 'supplied');
const CENSUS_FILE = 'operations-census.md';

const SHAPES = [
  {
    shape: 'jsonFieldRows',
    parameter: 'kind',
    lines: ['```jsonl', '{"kind":"OpA"}', '{"kind":"OpB"}', '```'],
    members: ['OpA', 'OpB'],
  },
  {
    shape: 'tableColumn',
    parameter: 'operation',
    lines: ['| operation |', '| --- |', '| OpA |', '| OpB |'],
    members: ['OpA', 'OpB'],
  },
  {
    shape: 'markedLines',
    parameter: '- ',
    lines: ['- OpA', '- OpB'],
    members: ['OpA', 'OpB'],
  },
  {
    shape: 'specSpans',
    parameter: 'span',
    lines: ['```jsonl', '{"span":"1-2"}', '{"span":"3-4"}', '```'],
    members: ['1-2', '3-4'],
  },
];

/** A temporary workspace with a supplied census file. */
// [::TICKET::] PX-383 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-383 --for-spec --no-implementation-order`.
function writeCensus(body) {
  const root = mkdtempSync(join(tmpdir(), 'px383-census-'));
  const directory = join(root, SUPPLIED_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, CENSUS_FILE), body);
  const digest = createHash('sha256').update(body).digest('hex');
  return { root, digest, remove: () => rmSync(root, { recursive: true, force: true }) };
}

test('C004 the shared extractor and the rail extractor return the same members for every shape', async () => {
  const shared = await import('../../.claude/scripts/shared-obligations/source-census.mjs');
  assert.equal(typeof shared.extractCensusMembers, 'function');

  for (const fixture of SHAPES) {
    const extracted = shared.extractCensusMembers({
      lines: fixture.lines,
      shape: fixture.shape,
      parameter: fixture.parameter,
    });
    const rail = extractMembers({
      lines: fixture.lines,
      shape: fixture.shape,
      parameter: fixture.parameter,
    });

    assert.deepEqual(extracted.members, fixture.members, fixture.shape);
    assert.deepEqual(extracted.members, rail.members, fixture.shape);
  }
});

test('C004 both extractors skip a fence that is not a row block', async () => {
  const shared = await import('../../.claude/scripts/shared-obligations/source-census.mjs');
  const lines = ['```text', 'prose that is not a row', '```', '', '```jsonl', '{"kind":"OpA"}', '```'];

  const extracted = shared.extractCensusMembers({ lines, shape: 'jsonFieldRows', parameter: 'kind' });
  const rail = extractMembers({ lines, shape: 'jsonFieldRows', parameter: 'kind' });

  assert.deepEqual(extracted.members, ['OpA']);
  assert.deepEqual(extracted.members, rail.members);
});

test('C004 both extractors read every table beneath its own header', async () => {
  const shared = await import('../../.claude/scripts/shared-obligations/source-census.mjs');
  const lines = [
    '| operation |', '| --- |', '| OpA |',
    '',
    '| operation |', '| --- |', '| OpB |',
  ];

  const extracted = shared.extractCensusMembers({ lines, shape: 'tableColumn', parameter: 'operation' });
  const rail = extractMembers({ lines, shape: 'tableColumn', parameter: 'operation' });

  assert.deepEqual(extracted.members, ['OpA', 'OpB']);
  assert.deepEqual(extracted.members, rail.members);
});

test('C004 both extractors skip a fenced block in a marked-lines census', async () => {
  const shared = await import('../../.claude/scripts/shared-obligations/source-census.mjs');
  const lines = ['- OpA', '', '```', 'not a member', '```', '- OpB'];

  const extracted = shared.extractCensusMembers({ lines, shape: 'markedLines', parameter: '- ' });
  const rail = extractMembers({ lines, shape: 'markedLines', parameter: '- ' });

  assert.deepEqual(extracted.members, ['OpA', 'OpB']);
  assert.deepEqual(extracted.members, rail.members);
});

test('C004 both extractors refuse a member that is not a span', async () => {
  const shared = await import('../../.claude/scripts/shared-obligations/source-census.mjs');
  const lines = ['```jsonl', '{"span":"5-3"}', '```'];

  const extracted = shared.extractCensusMembers({ lines, shape: 'specSpans', parameter: 'span' });
  const rail = extractMembers({ lines, shape: 'specSpans', parameter: 'span' });

  assert.equal(typeof extracted.refused, 'string');
  assert.equal(typeof rail.refused, 'string');
});

test('C004 a markedLines census is read by readPinnedCensus instead of refused', () => {
  const workspace = writeCensus('- OpA\n- OpB\n');
  try {
    const result = readPinnedCensus(workspace.root, {
      source: { file: CENSUS_FILE, sha256: workspace.digest },
      selector: { shape: 'markedLines', parameter: '- ' },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.rows.map((row) => row.key), ['OpA', 'OpB']);
  } finally {
    workspace.remove();
  }
});

test('C004 an unknown census shape is a named refusal', async () => {
  const shared = await import('../../.claude/scripts/shared-obligations/source-census.mjs');
  const refusal = shared.extractCensusMembers({ lines: ['- OpA'], shape: 'csvRows', parameter: 'id' });

  assert.equal(refusal.refused.includes('csvRows'), true);
});
