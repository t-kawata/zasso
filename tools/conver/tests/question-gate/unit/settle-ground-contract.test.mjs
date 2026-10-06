// @verifies C003
//
// A settlement rests on a record the run actually read. Widening the scan record
// (making an artifact visible that was previously missing from it) must not be paid
// for by loosening the rule that decides which records a settlement may cite: the
// comparison stays exact membership, never a substring or a prefix. Without this
// guard, the cheapest way to make a previously-refused block settle would be to
// weaken this predicate, and nothing would notice.
// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { settlePoint } from '../../../.claude/scripts/question-gate/settle.mjs';

const CANDIDATE = {
  decision: 'the store is a file',
  ground: 'EXPLAIN-RFC-SEED.md#§1',
  override: 'a level moves',
};

test('C003 postcondition: a settlement rests on a record the run read', () => {
  const verdict = settlePoint({
    point: { id: 'Q1' },
    candidate: CANDIDATE,
    records: ['EXPLAIN-RFC-SEED.md#§1'],
  });

  assert.equal(verdict.kind, 'settled');
  assert.equal(verdict.ground, 'EXPLAIN-RFC-SEED.md#§1');
});

test('C003 invariant: a record the run did not read leaves the point open', () => {
  const verdict = settlePoint({
    point: { id: 'Q1' },
    candidate: CANDIDATE,
    records: ['SOMETHING-ELSE.md#§1'],
  });

  assert.equal(verdict.kind, 'question');
});

test('C003 invariant: a prefix or substring of a record is not the record', () => {
  for (const nearly of ['EXPLAIN-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md#§', '§1']) {
    const verdict = settlePoint({
      point: { id: 'Q1' },
      candidate: { ...CANDIDATE, ground: nearly },
      records: ['EXPLAIN-RFC-SEED.md#§1'],
    });

    assert.equal(verdict.kind, 'question', `${nearly} is not a record the run read`);
  }
});
