// [::TICKET::] PX-192 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-192 --for-spec --no-implementation-order`.
// PX-192 @verifies C002
// The contract-clause vocabulary is the seam stage 2 relies on: it must be a
// closed, frozen set with five mandatory core clauses, and every dependency
// boundary must be built from it rather than from an inline literal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_CLAUSES,
  CORE_CONTRACT_CLAUSES,
  buildBoundaryContractScope,
  validateContractScope,
} from '../../../.claude/scripts/workspacify-tree/lib/contract-clauses.mjs';

const RUN_SOURCE = readFileSync(
  fileURLToPath(new URL('../../../.claude/scripts/workspacify-tree/run.mjs', import.meta.url)),
  'utf8',
);

test('C002 the vocabulary is frozen, closed and carries the five core clauses', () => {
  assert.ok(Object.isFrozen(CONTRACT_CLAUSES), 'CONTRACT_CLAUSES must be frozen');
  assert.equal(new Set(CONTRACT_CLAUSES).size, CONTRACT_CLAUSES.length, 'clause names must be unique');
  assert.deepEqual(
    [...CORE_CONTRACT_CLAUSES],
    ['input', 'output', 'preconditions', 'postconditions', 'invariants'],
  );
  for (const clause of CORE_CONTRACT_CLAUSES) {
    assert.ok(CONTRACT_CLAUSES.includes(clause), `core clause ${clause} must be part of the vocabulary`);
  }
  for (const clause of ['errors', 'state_ownership', 'idempotency', 'atomicity', 'ordering', 'finality',
    'canonicalization', 'signature', 'proof_verification', 'tests']) {
    assert.ok(CONTRACT_CLAUSES.includes(clause), `clause ${clause} must be part of the vocabulary`);
  }
});

test('C002 every connection kind yields a scope that contains all core clauses', () => {
  for (const connectionKind of ['value_only', 'typed_protocol_input', 'proof_verification', 'state_transition',
    'external_effect', 'composition_obligation', 'port_contract']) {
    const scope = buildBoundaryContractScope(connectionKind);
    for (const clause of CORE_CONTRACT_CLAUSES) {
      assert.ok(scope.includes(clause), `${connectionKind} scope must contain ${clause}`);
    }
    for (const clause of scope) {
      assert.ok(CONTRACT_CLAUSES.includes(clause), `${connectionKind} scope must not invent ${clause}`);
    }
    assert.equal(new Set(scope).size, scope.length, `${connectionKind} scope must not repeat a clause`);
  }
});

test('C002 validateContractScope rejects unknown, duplicate and missing core clauses', () => {
  const unknown = validateContractScope(['input', 'output', 'preconditions', 'postconditions', 'invariants', 'bogus']);
  assert.deepEqual(unknown.unknown, ['bogus']);
  assert.equal(unknown.ok, false);

  const missingCore = validateContractScope(['input', 'output']);
  assert.deepEqual(missingCore.missingCore.sort(), ['invariants', 'postconditions', 'preconditions']);
  assert.equal(missingCore.ok, false);

  const duplicated = validateContractScope(['input', 'input', 'output', 'preconditions', 'postconditions', 'invariants']);
  assert.deepEqual(duplicated.duplicates, ['input']);
  assert.equal(duplicated.ok, false);

  const valid = validateContractScope([...CORE_CONTRACT_CLAUSES, 'errors']);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.unknown, []);
  assert.deepEqual(valid.missingCore, []);
  assert.deepEqual(valid.duplicates, []);
});

test('C002 the tree command builds boundaries from the vocabulary, not from an inline literal', () => {
  assert.ok(
    RUN_SOURCE.includes('buildBoundaryContractScope'),
    'run.mjs must delegate boundary scopes to buildBoundaryContractScope',
  );
  assert.ok(
    !RUN_SOURCE.includes("'state_ownership', 'idempotency', 'atomicity'"),
    'the inline clause literal must be gone from run.mjs',
  );
});
