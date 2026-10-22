// [::TICKET::] PX-303 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-303 --for-spec --no-implementation-order`.
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateBlindAttack } from '../../.claude/scripts/shared-obligations/blind-attack.mjs';
import {
  isDegenerateQuote,
  quoteDiscrimination,
  resolveClauseBasis,
  validateSearchedQuote,
} from '../../.claude/scripts/shared-obligations/judgment.mjs';
import { templateSignature } from '../../.claude/scripts/shared-obligations/attack-template.mjs';

const REGISTRY = [{
  boundary_id: 'bd-1',
  clauses: {
    input: 'the caller sends a canonical request',
    output: 'the callee returns a canonical response',
  },
}];

const CJK_REGISTRY = [{
  boundary_id: 'bd-2',
  clauses: {
    input: '契約は状態を変更しない',
    output: '応答は決定論的である',
  },
}];

// @verifies C101
test('C101 a one-character contract quote is not discriminating', () => {
  const result = resolveClauseBasis(
    { boundaryId: 'bd-1', field: 'translation', quote: 'T' },
    REGISTRY,
  );

  assert.equal(result.code, 'BASIS_NOT_DISCRIMINATING');
});

// @verifies C101
test('C101 a punctuation-only contract quote is not discriminating', () => {
  const result = resolveClauseBasis(
    { boundaryId: 'bd-1', field: 'translation', quote: '[' },
    REGISTRY,
  );

  assert.equal(result.code, 'BASIS_NOT_DISCRIMINATING');
});

// @verifies C101
test('C101 a substantive contract quote still resolves', () => {
  const result = resolveClauseBasis(
    { boundaryId: 'bd-1', field: 'translation', quote: 'canonical request' },
    REGISTRY,
  );

  assert.equal(result.ok, true);
});

// @verifies C101
test('C101 a CJK clause of at least eight characters resolves', () => {
  const result = resolveClauseBasis(
    { boundaryId: 'bd-2', field: 'translation', quote: '契約は状態を変更しない' },
    CJK_REGISTRY,
  );

  assert.equal(result.ok, true);
});

// @verifies C101
test('C101 a degenerate searched quote is rejected before the range check', () => {
  const result = validateSearchedQuote({
    source: 'spec',
    path: 'spec.md',
    from: 2,
    to: 2,
    quote: '```',
  }, { 'spec.md': ['line one', 'line two'] });

  assert.equal(result.code, 'BASIS_NOT_DISCRIMINATING');
});

// @verifies C101
test('C101 the quote rule names the degenerate shapes and keeps the substantive ones', () => {
  for (const quote of ['T', '[', ']', '```', '---', '=', '不変条件:', '### 16.4 正常転生']) {
    assert.equal(isDegenerateQuote(quote), true, quote);
  }
  assert.equal(isDegenerateQuote('the clause that orders the act'), false);
  assert.equal(isDegenerateQuote('契約は状態を変更しない'), false);
});

// @verifies C101
test('C101 a quote that occurs in most candidates is not discriminating', () => {
  const common = quoteDiscrimination('clause', ['a clause', 'another clause', 'a third clause']);
  const specific = quoteDiscrimination('the caller sends', ['the caller sends a request', 'the callee returns a response']);

  assert.equal(common.ok, false);
  assert.equal(specific.ok, true);
});

// @verifies C102
test('C102 a punctuation-only blind attack quote is rejected', () => {
  const item = {
    obligationId: 'JUDGE:TRANSLATION:bd-1',
    subject: 'bd-1',
    reader: 'gen-12',
    attackReader: 'gen-12/attack',
    basisQuotes: ['the clause'],
  };
  const attack = {
    obligationId: 'JUDGE:TRANSLATION:bd-1',
    blind: true,
    reader: 'gen-12/attack',
    outcome: 'held',
    attack: 'searched bd-1 and found no counterexample',
    searched: { quote: '```' },
    counterexampleAttempt: { candidate: 'a contradictory clause' },
  };

  assert.equal(validateBlindAttack(attack, item).code, 'ATTACK_QUOTE_NOT_DISCRIMINATING');
  assert.equal(validateBlindAttack({
    ...attack,
    searched: { quote: 'the clause that orders bd-1' },
  }, item).ok, true);
});

// @verifies C103
test('C103 two attacks that differ only inside the quote share a template signature', () => {
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
