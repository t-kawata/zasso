// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateEffortTrace } from '../../.claude/scripts/shared-obligations/effort.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const item = {
  obligationId: 'JUDGE:TRANSLATION:bd-1',
  kind: 'judgment',
  verdict: 'entailed',
  answerVocabulary: ['consistent', 'conflicting', 'entailed', 'not_entailed'],
  anchorSet: { contract: [{ boundaryId: 'bd-1', field: 'translation' }] },
};

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const effort = {
  obligationId: 'JUDGE:TRANSLATION:bd-1',
  searched: [
    { source: 'contract_registry', path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json', line: 1, quote: 'translation' },
    { source: 'spec', path: 'spec.md', line: 10, quote: 'the clause' },
    { source: 'artifact', path: 'artifact.json', line: 1, quote: 'the step' },
  ],
  alternatives: [
    { verdict: 'consistent', rejectedBecause: 'the clause states the same input and output', evidence: { boundaryId: 'bd-1', field: 'translation' } },
    { verdict: 'conflicting', rejectedBecause: 'the input side matches the provider clause', evidence: { boundaryId: 'bd-1', field: 'translation' } },
    { verdict: 'not_entailed', rejectedBecause: 'the output side is carried by the provider postcondition', evidence: { boundaryId: 'bd-1', field: 'translation' } },
  ],
  counterexampleAttempt: {
    candidate: 'the provider output differs from the consumer input',
    source: { path: 'spec.md', line: 10, quote: 'the clause' },
    whyItFails: 'the clause states the same output',
  },
  discriminator: {
    basisRef: 'clauses.output',
    ifAbsentOrFalse: 'not_entailed',
  },
  uncertainty: { level: 'low' },
};

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C015 a complete effort trace is accepted', () => {
  assert.equal(validateEffortTrace(effort, item).ok, true);
});

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C015 a shallow search is rejected', () => {
  assert.equal(validateEffortTrace({ ...effort, searched: [] }, item).code, 'EFFORT_SHALLOW');
});

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C015 missing or generic alternatives are rejected', () => {
  assert.equal(validateEffortTrace({ ...effort, alternatives: [] }, item).code, 'ALTERNATIVES_MISSING');
  assert.equal(validateEffortTrace({
    ...effort,
    alternatives: effort.alternatives.map((entry) => ({ ...entry, rejectedBecause: 'it is different' })),
  }, item).code, 'ALTERNATIVE_GENERIC');
});

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C015 a missing counterexample attempt or discriminator is rejected', () => {
  assert.equal(validateEffortTrace({ ...effort, counterexampleAttempt: null }, item).code, 'COUNTEREXAMPLE_ATTEMPT_MISSING');
  assert.equal(validateEffortTrace({ ...effort, discriminator: null }, item).code, 'DISCRIMINATOR_MISSING');
});

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C015 a discriminator that would not flip the verdict is rejected', () => {
  assert.equal(validateEffortTrace({
    ...effort,
    discriminator: { basisRef: 'clauses.output', ifAbsentOrFalse: 'entailed' },
  }, item).code, 'BASIS_NOT_DISCRIMINATING');
});

// @verifies C015
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C015 high uncertainty cannot be held', () => {
  assert.equal(validateEffortTrace({ ...effort, uncertainty: { level: 'high' } }, item).code, 'UNCERTAINTY_HIGH');
});
