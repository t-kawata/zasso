// @verifies C004
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeDebtIncrease } from '../../.claude/scripts/regeneration/lib/debt.mjs';

// [::TICKET::] PX-288 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-288 --for-spec --no-implementation-order`.
function baseline() {
  return { findings: new Set(), blocked: new Set(), readingSubjects: new Set(['op-1', 'op-2']), readingCount: 201 };
}

test('a disappeared Yes subject with a resolution is carried, not added', () => {
  const staging = {
    findings: new Set(),
    blocked: new Set(),
    readingSubjects: new Set(),
    readingCount: 0,
    readingResolutions: new Map([['op-1', { kind: 'spec-change' }], ['op-2', { kind: 'artifact-change' }]]),
  };
  const increase = computeDebtIncrease({ baseline: baseline(), staging });
  assert.deepEqual(increase.newReadingSubjects, []);
  assert.equal(increase.increased, false);
});

test('201 to 0 without resolutions is an increase even though the delta is negative', () => {
  const staging = { findings: new Set(), blocked: new Set(), readingSubjects: new Set(), readingCount: 0 };
  const increase = computeDebtIncrease({ baseline: baseline(), staging });
  assert.deepEqual(increase.newReadingSubjects, ['op-1', 'op-2']);
  assert.equal(increase.readingCountDelta, -201);
  assert.equal(increase.increased, true);
});

test('only the unresolved disappeared subject is named', () => {
  const staging = {
    findings: new Set(),
    blocked: new Set(),
    readingSubjects: new Set(),
    readingCount: 0,
    readingResolutions: new Map([['op-1', { kind: 'spec-change' }]]),
  };
  const increase = computeDebtIncrease({ baseline: baseline(), staging });
  assert.deepEqual(increase.newReadingSubjects, ['op-2']);
});
