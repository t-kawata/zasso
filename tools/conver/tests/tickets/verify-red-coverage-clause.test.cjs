'use strict';

// [::TICKET::] PX-437 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-437 --for-spec --no-implementation-order`.
/**
 * PX-437 C002 — clause-level @verifies annotations.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { scanContractCoverage } = require('../../.claude/scripts/tickets/verify-red-coverage.js');

const CLAUSES = ['C001/precondition', 'C001/postcondition'];

test('C002: a clause-level annotation covers exactly that clause', () => {
  const result = scanContractCoverage('// @verifies C001/precondition\ntest body', new Set(['C001']), { clauseKeys: CLAUSES });

  assert.deepEqual([...result.coveredClauses], ['C001/precondition']);
  assert.deepEqual(result.missingClauses, ['C001/postcondition']);
});

test('C002: a contract-level annotation covers no clause', () => {
  const result = scanContractCoverage('// @verifies C001\ntest body', new Set(['C001']), { clauseKeys: CLAUSES });

  assert.equal(result.covered.has('C001'), true);
  assert.equal(result.coveredClauses.size, 0);
  assert.deepEqual(result.missingClauses, CLAUSES);
});

test('C002: a canonical key annotation covers its clause', () => {
  const key = 'clause|pkg-alpha|C001|precondition|abcdef0123456789';
  const result = scanContractCoverage('// @verifies ' + key + '\ntest body', new Set(['C001']), { clauseKeys: [key] });

  assert.equal(result.coveredClauses.has(key), true);
  assert.deepEqual(result.missingClauses, []);
});
