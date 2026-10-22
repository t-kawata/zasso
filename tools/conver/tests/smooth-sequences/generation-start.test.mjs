// PX-306 @verifies C004
// A generation without a start time cannot prove its readings were taken after it opened.
// The start is stamped once when the generation begins and enforced when a reading is
// validated.
import test from 'node:test';
import assert from 'node:assert/strict';

import { beginGeneration } from '../../.claude/scripts/educe-sequences/rail/run-state.mjs';
import { validateJudgmentRecord } from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { generationFreshness } from '../../.claude/scripts/shared-obligations/predicates.mjs';

test('C004 opening a generation stamps generationStartedAt', () => {
  const status = beginGeneration({ generation: 0, phases: [], entered: false }, {
    spec: { path: 'spec.md', sha256: 'sha' },
    digest: 'digest',
    now: new Date('2026-10-22T00:00:00.000Z'),
  });
  assert.equal(status.generationStartedAt, '2026-10-22T00:00:00.000Z');
});

test('C004 a generation with a positive number and no start cannot validate a reading', () => {
  const item = {
    obligationId: 'JUDGE:ENTAILMENT:boundary-005',
    schemaVersion: 2,
    generation: 2,
    generationStartedAt: undefined,
    anchorSet: {},
    answerVocabulary: ['entailed'],
  };
  const record = {
    obligationId: item.obligationId,
    schemaVersion: 2,
    readerGeneration: 2,
    readAt: '2026-10-22T00:00:00.000Z',
    verdict: 'entailed',
    basis: [{ source: 'spec', path: 'spec.md', line: 1, quote: 'the clause' }],
  };
  assert.equal(validateJudgmentRecord(record, item).code, 'READING_NOT_REREAD');
  assert.equal(generationFreshness(record, 2, undefined).code, 'READING_NOT_REREAD');
});

test('C004 a reading older than the generation start is rejected', () => {
  const item = {
    obligationId: 'JUDGE:ENTAILMENT:boundary-005',
    schemaVersion: 2,
    generation: 2,
    generationStartedAt: '2026-10-22T00:00:00.000Z',
    anchorSet: {},
    answerVocabulary: ['entailed'],
  };
  const record = {
    obligationId: item.obligationId,
    schemaVersion: 2,
    readerGeneration: 2,
    readAt: '2026-10-21T00:00:00.000Z',
    verdict: 'entailed',
    basis: [{ source: 'spec', path: 'spec.md', line: 1, quote: 'the clause' }],
  };
  assert.equal(validateJudgmentRecord(record, item).code, 'READING_NOT_REREAD');
  assert.equal(generationFreshness(record, 2, item.generationStartedAt).code, 'READING_NOT_REREAD');
});

test('C004 a reading at or after the start is fresh', () => {
  assert.equal(generationFreshness({
    readerGeneration: 2,
    readAt: '2026-10-22T00:00:00.000Z',
  }, 2, '2026-10-22T00:00:00.000Z').ok, true);
});
