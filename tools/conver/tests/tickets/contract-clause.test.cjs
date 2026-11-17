// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
'use strict';

/**
 * PX-436 C001 — canonical clause identity.
 *
 * The key is independent of line, ticket, phase and run. Normalization is
 * fixed and versioned so two copies of the same normative text agree, while
 * two different texts never collapse into one obligation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeClauseText,
  textHash,
  clauseKey,
  parseClauseKey,
  compareClauseKeys,
  isNonEmptyText,
} = require('../../.claude/scripts/tickets/lib/contract-clause.js');

test('C001: normalization applies NFC, LF, trailing-space removal, whitespace collapse and trim', () => {
  const input = '  input\t is \r\n valid.  ';
  assert.equal(normalizeClauseText(input), 'input is valid.');
});

test('C001: normalization keeps non-ASCII clause text and still collapses whitespace', () => {
  const input = '  入力\tは\r\n有効  ';
  assert.equal(normalizeClauseText(input), '入力 は 有効');
});

test('C001: canonical key has the fixed shape and a 16-hex text hash', () => {
  const key = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'precondition', text: 'input is present' });
  assert.match(key, /^clause\|pkg-alpha\|C001\|precondition\|[0-9a-f]{16}$/);
  assert.equal(key.split('|')[4], textHash('input is present'));
});

test('C001: same normalized text yields the same key; differing text yields a different key', () => {
  const first = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'precondition', text: '  input   is present ' });
  const second = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'precondition', text: 'input is present' });
  const third = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'precondition', text: 'input is absent' });

  assert.equal(first, second);
  assert.notEqual(second, third);
});

test('C001: key is independent of line, ticket, phase and run', () => {
  const base = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'postcondition', text: 'output is stored' });
  const withMetadata = clauseKey({
    scope: 'pkg-alpha',
    contractId: 'C001',
    element: 'postcondition',
    text: 'output is stored',
    ticketKey: 'P4-2',
    line: 91,
    phase: 4,
    run: 17,
  });

  assert.equal(base, withMetadata);
});

test('C001: ordinal is present only when the adapter splits a field', () => {
  const unsplit = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'postcondition', text: 'output is stored' });
  const split = clauseKey({ scope: 'pkg-alpha', contractId: 'C001', element: 'postcondition', ordinal: 2, text: 'output is stored' });

  assert.match(unsplit, /\|postcondition\|/);
  assert.match(split, /\|postcondition#2\|/);
  assert.notEqual(unsplit, split);
});

test('C001: parseClauseKey recovers the identity fields', () => {
  const key = clauseKey({ scope: 'pkg-alpha', contractId: 'C-9', element: 'invariant', ordinal: 3, text: 'state is unchanged' });
  const parsed = parseClauseKey(key);

  assert.deepEqual(
    { scope: parsed.scope, contractId: parsed.contractId, element: parsed.element, ordinal: parsed.ordinal, textHash: parsed.textHash },
    { scope: 'pkg-alpha', contractId: 'C-9', element: 'invariant', ordinal: 3, textHash: textHash('state is unchanged') },
  );
  assert.equal(parseClauseKey('not-a-clause-key'), null);
});

test('C001: ordering is by Unicode code point, not locale', () => {
  assert.equal(compareClauseKeys('clause|a|C1|x|1', 'clause|a|C2|x|1') < 0, true);
  assert.equal(compareClauseKeys('Z', 'a') < 0, true);
});

test('C001: empty or whitespace-only text is not a clause', () => {
  assert.equal(isNonEmptyText(''), false);
  assert.equal(isNonEmptyText('  \t\n'), false);
  assert.equal(isNonEmptyText('x'), true);
});
