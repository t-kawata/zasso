import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertSingleReader,
  readerGenerationsOf,
  readReadingsFile,
} from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
const NAMED = 'educe-sequences/generation-12';
const DATED = 'educe-sequences/2026-10-21-generation12';
const OLD = 'educe-sequences/generation-11';
const LEGACY = 'span';

// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function sequenceRow(reader) {
  return { subject: 'A-1', outcome: 'direct', reader };
}

// [::TICKET::] PX-294 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-294 --for-spec --no-implementation-order`.
function inquestRow(reader) {
  return { subject: 'A-1', lens: 'omission', question: 'q', answer: 'No', line: 1, quote: 'q', reader };
}

// @verifies C005
test('both generation spellings are recognised, including on non-inquest rows', () => {
  assert.deepEqual(readerGenerationsOf([sequenceRow(NAMED)]), [NAMED]);
  assert.deepEqual(readerGenerationsOf([sequenceRow(DATED)]), [DATED]);
  assert.deepEqual(readerGenerationsOf([inquestRow(NAMED)]), [NAMED]);
  assert.deepEqual(readerGenerationsOf([inquestRow(DATED)]), [DATED]);
});

// @verifies C005
test('a file naming the current generation is accepted', () => {
  assert.deepEqual(assertSingleReader([sequenceRow(NAMED)], { currentGeneration: 12 }), { ok: true, readers: [NAMED] });
  assert.deepEqual(assertSingleReader([inquestRow(DATED)], { currentGeneration: 12 }), { ok: true, readers: [DATED] });
});

// @verifies C005
test('a file naming an older generation is refused with READER_STALE', () => {
  assert.throws(
    () => assertSingleReader([sequenceRow(OLD)], { currentGeneration: 12 }),
    (error) => error.code === 'READER_STALE',
  );
  assert.throws(
    () => assertSingleReader([inquestRow(OLD)], { currentGeneration: 12 }),
    (error) => error.code === 'READER_STALE',
  );
});

// @verifies C005
test('a mixture of generations is refused with READER_MIXED', () => {
  assert.throws(
    () => assertSingleReader([sequenceRow(NAMED), sequenceRow(OLD)], { currentGeneration: 12 }),
    (error) => error.code === 'READER_MIXED',
  );
});

// @verifies C005
test('a wholly legacy file keeps the legacy single-reader behavior', () => {
  assert.deepEqual(assertSingleReader([sequenceRow(LEGACY)], { currentGeneration: 12 }), { ok: true, readers: [LEGACY] });
});

// @verifies C005
test('a named generation mixed with a legacy row is refused', () => {
  assert.throws(
    () => assertSingleReader([sequenceRow(NAMED), sequenceRow(LEGACY)], { currentGeneration: 12 }),
    (error) => error.code === 'READER_MIXED',
  );
});

// @verifies C005
test('readReadingsFile passes the current generation to the reader gate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'px294-reader-'));
  try {
    const path = join(directory, 'readings-span.jsonl');
    writeFileSync(path, `${JSON.stringify(sequenceRow(OLD))}\n`);
    const result = readReadingsFile(path, { currentGeneration: 12 });
    assert.equal(result.ok, false);
    assert.match(result.problems.join(' '), /READER_STALE/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// @verifies C005
test('without a current generation a named reader is accepted', () => {
  assert.deepEqual(assertSingleReader([sequenceRow(OLD)]), { ok: true, readers: [OLD] });
});
