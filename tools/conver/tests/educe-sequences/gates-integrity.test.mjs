// @verifies C002
// @verifies C003
// @verifies C008
import test from 'node:test';
import assert from 'node:assert/strict';

import { gateInquestResolutions, gateUncovered } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';

// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
const ARTIFACT = {
  operations: [
    { id: 'op-1', position: 'excluded', grounding: { classification: 'no_act_stated_by_the_specification', line: 10 } },
    { id: 'op-2', position: 'singleStep' },
  ],
  steps: [{ id: 's-2', operation: 'op-2', sequence: 'A-1', line: 20 }],
};

test('phase 8 accepts one performed or escaped record per worklist member', () => {
  const result = gateUncovered({
    worklist: ['op-1 account-for', 'op-2 account-for'],
    span: [{ subject: 'A-1', outcome: 'direct', steps: [{ id: 's-2', operation: 'op-2' }], reader: 'gen-11' }],
    artifact: ARTIFACT,
    records: [
      { subject: 'op-1', outcome: 'escaped', position: 'excluded', line: 10, quote: 'not an act', why: 'the specification states no act', reader: 'gen-11' },
      { subject: 'op-2', outcome: 'performed', step: 's-2', reader: 'gen-11' },
    ],
  });
  assert.equal(result.ok, true);
});

test('phase 8 refuses a duplicate, a missing and a performed step outside the artifact', () => {
  const duplicate = gateUncovered({
    worklist: ['op-1 account-for'],
    span: [],
    artifact: ARTIFACT,
    records: [
      { subject: 'op-1', outcome: 'escaped', position: 'excluded', line: 10, quote: 'q', why: 'w', reader: 'r' },
      { subject: 'op-1', outcome: 'escaped', position: 'excluded', line: 10, quote: 'q', why: 'w', reader: 'r' },
    ],
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.reason, /duplicate/);

  const missing = gateUncovered({ worklist: ['op-1 account-for'], span: [], artifact: ARTIFACT, records: [] });
  assert.equal(missing.ok, false);
  assert.match(missing.reason, /no uncovered record/);

  const absentStep = gateUncovered({
    worklist: ['op-2 account-for'],
    span: [{ subject: 'op-2', outcome: 'direct', reader: 'r' }],
    artifact: ARTIFACT,
    records: [{ subject: 'op-2', outcome: 'performed', step: 's-missing', reader: 'r' }],
  });
  assert.equal(absentStep.ok, false);
  assert.match(absentStep.reason, /s-missing/);
});

test('phase 13 accepts a resolved Yes-to-No and refuses one without evidence', () => {
  const resolved = gateInquestResolutions({
    previous: [{ subject: 'op-2', lens: 'omission', answer: 'Yes' }],
    current: [{
      subject: 'op-2', lens: 'omission', answer: 'No', previous: 'Yes',
      resolution: { kind: 'spec-change', evidence: { line: 1700, previousQuote: 'old', currentQuote: 'new' } },
    }],
    artifact: ARTIFACT,
  });
  assert.equal(resolved.ok, true);

  const unresolved = gateInquestResolutions({
    previous: [{ subject: 'op-1', lens: 'omission', answer: 'Yes' }],
    current: [{ subject: 'op-1', lens: 'omission', answer: 'No', previous: 'Yes' }],
    artifact: ARTIFACT,
  });
  assert.equal(unresolved.ok, false);
  assert.match(unresolved.reason, /READING_UNRESOLVED/);
});

test('phase 13 refuses an omission No over a no-act or designer-supplied grounding', () => {
  const result = gateInquestResolutions({
    previous: [],
    current: [{ subject: 'op-1', lens: 'omission', answer: 'No', previous: 'Yes', resolution: { kind: 'spec-change', evidence: { line: 10, previousQuote: 'a', currentQuote: 'b' } } }],
    artifact: ARTIFACT,
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no_act_stated_by_the_specification/);
});
