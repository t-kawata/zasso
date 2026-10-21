// @verifies C001
// @verifies C002
// @verifies C003
// @verifies C013
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  assertSingleReader,
  previousInquestRecordsIn,
  readReadingsFile,
  validateUncoveredRecord,
  verifyResolution,
} from '../../.claude/scripts/educe-sequences/rail/readings.mjs';

const WORK = mkdtempSync(join(tmpdir(), 'educe-integrity-'));

// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
function line(record) {
  return `${JSON.stringify(record)}\n`;
}

test('one reader generation is accepted and a mixture is refused', () => {
  const same = [
    { subject: 'op-1', lens: 'omission', reader: 'educe-sequences/2026-10-21-generation11' },
    { subject: 'op-2', lens: 'omission', reader: 'educe-sequences/2026-10-21-generation11' },
  ];
  assert.deepEqual(assertSingleReader(same), { ok: true, readers: ['educe-sequences/2026-10-21-generation11'] });

  const mixed = [
    { subject: 'op-1', lens: 'omission', reader: 'educe-sequences/2026-10-15-generation10' },
    { subject: 'op-2', lens: 'omission', reader: 'educe-sequences/2026-10-21-generation11' },
  ];
  assert.throws(() => assertSingleReader(mixed), (error) => error.code === 'READER_MIXED');
});

test('a legacy reader without a generation suffix is one legacy reader', () => {
  const rows = [
    { subject: 'op-1', lens: 'omission', reader: 'span' },
    { subject: 'op-2', lens: 'omission', reader: 'span' },
  ];
  assert.deepEqual(assertSingleReader(rows), { ok: true, readers: ['span'] });
});

test('readReadingsFile refuses a mixed-generation inquest', () => {
  const path = join(WORK, 'mixed.jsonl');
  writeFileSync(path, line({ subject: 'op-1', lens: 'omission', question: 'q', answer: 'No', line: 1, quote: 'q', reader: 'educe-sequences/2026-10-15-generation10' })
    + line({ subject: 'op-2', lens: 'omission', question: 'q', answer: 'No', line: 2, quote: 'q', reader: 'educe-sequences/2026-10-21-generation11' }));
  const result = readReadingsFile(path);
  assert.equal(result.ok, false);
  assert.match(result.problems.join(' '), /READER_MIXED/);
});

test('a resolved Yes-to-No is accepted only when the cited line changed', () => {
  const previousSpec = { lines: ['before', 'the bond matures on failure'] };
  const currentSpec = { lines: ['before', 'the bond matures on failure and refunds the buyer'] };
  const record = {
    subject: 'operation:refund-maturity-bond',
    lens: 'omission',
    answer: 'No',
    previous: 'Yes',
    resolution: {
      kind: 'spec-change',
      evidence: {
        line: 1700,
        previousQuote: 'the bond matures on failure',
        currentQuote: 'the bond matures on failure and refunds the buyer',
      },
    },
  };
  assert.equal(verifyResolution(record, { previousSpec, currentSpec }).ok, true);

  const unchanged = {
    ...record,
    resolution: { kind: 'spec-change', evidence: { line: 1, previousQuote: 'same', currentQuote: 'same' } },
  };
  assert.throws(
    () => verifyResolution(unchanged, { previousSpec: { lines: ['same'] }, currentSpec: { lines: ['same'] } }),
    (error) => error.code === 'READING_UNRESOLVED',
  );
});

test('a Yes-to-No without a resolution is refused and a plain No is not asked for one', () => {
  assert.throws(
    () => verifyResolution({ subject: 'op-1', lens: 'omission', answer: 'No', previous: 'Yes' }, { previousSpec: { lines: [] }, currentSpec: { lines: [] } }),
    (error) => error.code === 'READING_UNRESOLVED',
  );
  assert.equal(verifyResolution({ subject: 'op-2', lens: 'omission', answer: 'No', previous: 'No' }).ok, true);
});

test('the previous generation is read from the newest archive file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'educe-archive-'));
  const archivePath = join(directory, 'archive');
  // The helper reads <directory>/archive, so the temp directory is the run directory.
  mkdirSync(archivePath, { recursive: true });
  writeFileSync(join(archivePath, 'readings-inquest.g10.jsonl'), line({ subject: 'old', lens: 'omission', question: 'q', answer: 'Yes', line: 1, quote: 'q', reader: 'educe-sequences/2026-10-15-generation10' }));
  writeFileSync(join(archivePath, 'readings-inquest.g11.jsonl'), line({ subject: 'new', lens: 'omission', question: 'q', answer: 'No', line: 1, quote: 'q', reader: 'educe-sequences/2026-10-21-generation11' }));
  const records = previousInquestRecordsIn(directory);
  assert.deepEqual(records.map((record) => record.subject), ['new']);
});

test('artifact-change and misreading resolutions carry their own evidence', () => {
  const artifactChange = {
    subject: 'op-1', lens: 'contradiction', answer: 'No', previous: 'Yes',
    resolution: { kind: 'artifact-change', evidence: { transaction: 'mvhngsku-ded19ec2' } },
  };
  assert.equal(verifyResolution(artifactChange).ok, true);
  assert.throws(
    () => verifyResolution({ ...artifactChange, resolution: { kind: 'artifact-change', evidence: {} } }),
    (error) => error.code === 'READING_UNRESOLVED',
  );

  const misreading = {
    subject: 'op-2', lens: 'omission', answer: 'No', previous: 'Yes',
    resolution: { kind: 'misreading', evidence: { secondReader: 'reader-b', waiver: false } },
  };
  assert.throws(() => verifyResolution(misreading), (error) => error.code === 'READING_UNRESOLVED');
  assert.equal(verifyResolution({ ...misreading, resolution: { kind: 'misreading', evidence: { secondReader: 'reader-b', waiver: true } } }).ok, true);
});

test('an uncovered record must say performed or escaped and cite its evidence', () => {
  assert.deepEqual(validateUncoveredRecord({
    subject: 'op-1', outcome: 'escaped', position: 'excluded', line: 10, quote: 'excluded by the spec', why: 'no act', reader: 'gen-11',
  }), []);
  const missing = validateUncoveredRecord({ subject: 'op-1', outcome: 'maybe' });
  assert.ok(missing.length > 0);
  assert.match(missing.join(' '), /outcome|position|line|quote|why|reader/);
});

// @verifies C005
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
test('a non-inquest reading file is checked for a current generation', () => {
  const rows = [{ subject: 'A-1', outcome: 'direct', reader: 'educe-sequences/generation-11' }];
  assert.throws(
    () => assertSingleReader(rows, { currentGeneration: 12 }),
    (error) => error.code === 'READER_STALE',
  );
});
