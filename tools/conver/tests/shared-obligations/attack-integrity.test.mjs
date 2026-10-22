// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAttackIndependence,
  validateCounterexampleAttempt,
  validateFalsificationClaim,
  validateSearchedQuote,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import {
  templateSignature,
  validateAttackTemplate,
} from '../../.claude/scripts/shared-obligations/attack-template.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const sources = { 'spec.md': ['line one', 'line two'] };

// @verifies C006
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C006 an attack quote must be literal and its range must be real', () => {
  assert.equal(validateSearchedQuote({
    source: 'spec', path: 'spec.md', from: 2, to: 2, quote: 'line two',
  }, sources).ok, true);

  assert.equal(validateSearchedQuote({
    source: 'spec', path: 'spec.md', from: 2, to: 2, quote: 'line three',
  }, sources).code, 'ATTACK_QUOTE_NOT_FOUND');

  assert.equal(validateSearchedQuote({
    source: 'spec', path: 'spec.md', from: 0, to: 0, quote: 'line one',
  }, sources).code, 'ATTACK_RANGE_INVALID');
});

// @verifies C007
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C007 an attack that copies the basis quote is rejected', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const judgment = {
    basis: [{ source: 'artifact', id: 'CreateForum', field: 'idempotency_scope', quote: 'op id' }],
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const copied = {
    searched: { quote: 'op id' },
    attack: 'searched the operation record; none was found.',
  };
  assert.equal(validateAttackIndependence(copied, judgment).code, 'ATTACK_SAME_AS_BASIS');
});

// @verifies C007
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
// @verifies C103
test('C103 two attacks differing only inside the quoted span share a signature', () => {
  const first = 'searched the line carrying "first quote" for a contradiction in A-1; none found.';
  const second = 'searched the line carrying "second quote" for a contradiction in A-1; none found.';
  const otherSubject = 'searched the line carrying "first quote" for a contradiction in A-2; none found.';

  assert.equal(templateSignature(first), templateSignature(second));
  assert.notEqual(templateSignature(first), templateSignature(otherSubject));
});

// @verifies C103
test('C103 evidence and signal tags do not make a template unique', () => {
  const first = 'searched the line carrying "a quote" in A-1; none found. [evidence aabbccdd] [signal 11223344]';
  const second = 'searched the line carrying "another quote" in A-1; none found. [evidence eeff0011] [signal 55667788]';

  assert.equal(templateSignature(first), templateSignature(second));
});

test('C007 a normalized template reused beyond the threshold is rejected', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const templateA = 'searched the operation record for a case in which the concurrency risk is neither mitigated nor accepted; none was found.';
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const templateB = 'searched the operation record for a case in which the replay risk is neither mitigated nor accepted; none was found.';
  assert.equal(templateSignature(templateA), templateSignature(templateB));

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const seen = new Map([[templateSignature(templateA), 177]]);
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const result = validateAttackTemplate({ attack: templateA, seen, threshold: 1 });
  assert.equal(result.code, 'ATTACK_TEMPLATE_REUSED');
});

// @verifies C008
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C008 a held attack requires a concrete counterexample attempt', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const held = {
    outcome: 'held',
    counterexampleAttempt: {
      candidate: 'a concurrent call changes the status',
      source: { path: 'spec.md', line: 2, quote: 'line two' },
      whyItFails: 'the status map serializes it',
    },
  };
  assert.equal(validateCounterexampleAttempt(held).ok, true);
  assert.equal(validateCounterexampleAttempt({ outcome: 'held' }).code, 'COUNTEREXAMPLE_ATTEMPT_MISSING');
  assert.equal(validateCounterexampleAttempt({
    outcome: 'held',
    counterexampleAttempt: { candidate: 'the claim is false', whyItFails: 'because it is' },
  }).code, 'COUNTEREXAMPLE_GENERIC');
});

// @verifies C009
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C009 the no-act template is rejected for an active operation', () => {
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const item = {
    obligationId: 'FALSIFY:CreateForum',
    subject: 'CreateForum',
    subjectKind: 'active-operation',
    claim: 'the operation is ordered and covered by a step or a grounded escape',
  };
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const generic = {
    obligationId: 'FALSIFY:CreateForum',
    searched: { quote: 'forum作成には二つの形がある。' },
    attack: 'searched the span and grounding for a counterexample to the No answer; the rows read carry no act the specification orders.',
  };
  assert.equal(validateFalsificationClaim(generic, item).code, 'ATTACK_SUBJECT_GENERIC');

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
  const specific = {
    ...generic,
    attack: 'searched the CreateForum definition and its steps for a missing step or a contradictory classification; none was found.',
  };
  assert.equal(validateFalsificationClaim(specific, item).ok, true);
});
