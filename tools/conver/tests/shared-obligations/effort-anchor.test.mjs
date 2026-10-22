// PX-306 @verifies C001
// An effort trace that searches the same three generic lines for every obligation is a
// record of work, not of this claim. The check requires the basis anchor to appear in the
// searched set and refuses a searched set reused by another subject.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  effortSignature,
  validateEffortTrace,
} from '../../.claude/scripts/shared-obligations/effort.mjs';

const item = {
  obligationId: 'JUDGE:ENTAILMENT:boundary-005',
  kind: 'judgment',
  verdict: 'entailed',
  answerVocabulary: ['consistent', 'conflicting', 'entailed', 'not_entailed'],
  anchorSet: { contract: [{ boundaryId: 'boundary-005', field: 'entailment' }] },
};

const anchored = {
  obligationId: item.obligationId,
  searched: [
    { source: 'contract_registry', boundaryId: 'boundary-005', field: 'entailment', line: 1, quote: 'the provider returns the order' },
    { source: 'spec', path: 'spec.md', line: 10, quote: 'the clause' },
    { source: 'artifact', path: 'artifact.json', line: 1, quote: 'the step' },
  ],
  alternatives: [
    { verdict: 'consistent', rejectedBecause: 'the clause states the same input and output' },
    { verdict: 'conflicting', rejectedBecause: 'the input side matches the provider clause' },
    { verdict: 'not_entailed', rejectedBecause: 'the output side is carried by the provider postcondition' },
  ],
  counterexampleAttempt: {
    candidate: 'the provider output differs from the consumer input',
    source: { path: 'spec.md', line: 10 },
    whyItFails: 'the clause states the same output',
  },
  discriminator: { basisRef: 'clauses.entailment', ifAbsentOrFalse: 'not_entailed' },
  uncertainty: { level: 'low' },
};

// [::TICKET::] PX-306 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-306 --for-spec --no-implementation-order`.
function genericRows() {
  return [
    { source: 'spec', path: 'spec.md', line: 14147, quote: 'the core operation order' },
    { source: 'spec', path: 'spec.md', line: 14148, quote: 'the core operation order' },
    { source: 'spec', path: 'spec.md', line: 14149, quote: 'the core operation order' },
  ];
}

test('C001 an effort trace that searched the claim anchor is accepted', () => {
  assert.equal(validateEffortTrace(anchored, item, { requireAnchor: true }).ok, true);
});

test('C001 an effort trace that searched only generic lines is rejected', () => {
  const result = validateEffortTrace({ ...anchored, searched: genericRows() }, item, { requireAnchor: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EFFORT_ANCHOR_MISSING');
});

test('C001 an effort trace repeated across two subjects is rejected', () => {
  const seen = new Map([[effortSignature({ searched: genericRows() }), 'JUDGE:ENTAILMENT:boundary-004']]);
  const result = validateEffortTrace(
    { ...anchored, searched: genericRows() },
    { ...item, anchorSet: {} },
    { requireAnchor: false, seenEffortSignatures: seen },
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EFFORT_NOT_SUBJECT_SPECIFIC');
});

test('C001 the signature is order independent and names the searched rows', () => {
  const first = effortSignature({ searched: genericRows() });
  const reversed = effortSignature({ searched: [...genericRows()].reverse() });
  assert.equal(first, reversed);
  assert.match(first, /spec\.md\|14147/);
});
