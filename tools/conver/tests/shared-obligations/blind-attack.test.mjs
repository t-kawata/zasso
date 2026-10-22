// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateBlindAttack } from '../../.claude/scripts/shared-obligations/blind-attack.mjs';

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const item = {
  obligationId: 'JUDGE:TRANSLATION:bd-1',
  subject: 'bd-1',
  reader: 'gen-12',
  attackReader: 'gen-12/attack',
  basisQuotes: ['the clause'],
};

// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
const blind = {
  obligationId: 'JUDGE:TRANSLATION:bd-1',
  blind: true,
  reader: 'gen-12/attack',
  searched: {
    source: 'contract_registry',
    path: 'WORKSPACIFY-ALLOCATE-MANIFEST.json',
    from: 1,
    to: 1,
    quote: 'the output',
  },
  attack: 'searched the bd-1 translation clause for a consumer input the provider does not carry; none was found.',
  counterexampleAttempt: {
    candidate: 'the output differs from the consumer input',
    source: { path: 'spec.md', line: 1, quote: 'q' },
    whyItFails: 'the clause states the output',
  },
};

// @verifies C016
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C016 a blind attack from a separate reader is accepted', () => {
  assert.equal(validateBlindAttack(blind, item).ok, true);
});

// @verifies C016
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C016 an attack that copies the basis quote is rejected', () => {
  assert.equal(validateBlindAttack({
    ...blind,
    searched: { ...blind.searched, quote: 'the clause' },
  }, item).code, 'ATTACK_SAME_AS_BASIS');
});

// @verifies C016
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C016 an attack that is not blind is rejected', () => {
  assert.equal(validateBlindAttack({ ...blind, blind: false }, item).code, 'BLIND_ATTACK_REQUIRED');
});

// @verifies C016
// [::TICKET::] PX-295, PX-296 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-295, PX-296 --for-spec --no-implementation-order`.
test('C016 an attack that does not name the subject is rejected', () => {
  assert.equal(validateBlindAttack({
    ...blind,
    attack: 'searched the record; none was found.',
  }, item).code, 'ATTACK_SUBJECT_GENERIC');
});

// @verifies C102
test('C102 a punctuation-only searched quote is rejected', () => {
  assert.equal(validateBlindAttack({
    ...blind,
    searched: { ...blind.searched, quote: '```' },
  }, item).code, 'ATTACK_QUOTE_NOT_DISCRIMINATING');
});
